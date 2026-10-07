/**
 * Timeline Processor
 *
 * Handles the `charted-roots-timeline` code block.
 * Renders a chronological list of events for the current person note.
 *
 * Usage in a note:
 * ```charted-roots-timeline
 * sort: chronological
 * include: birth, death, marriage, residence
 * limit: 10
 * ```
 */

import { MarkdownPostProcessorContext, MarkdownRenderChild, TAbstractFile, TFile } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import { DynamicContentService, renderBlockError, renderBlockLoading } from '../services/dynamic-content-service';
import { TimelineRenderer } from '../renderers/timeline-renderer';
import { extractWikilinkPath } from '../../utils/wikilink-resolver';

/**
 * Processor for charted-roots-timeline code blocks
 */
export class TimelineProcessor {
	private plugin: CanvasRootsPlugin;
	private service: DynamicContentService;
	private renderer: TimelineRenderer;

	constructor(plugin: CanvasRootsPlugin) {
		this.plugin = plugin;
		this.service = new DynamicContentService(plugin);
		this.renderer = new TimelineRenderer(this.service);
	}

	/**
	 * Process a charted-roots-timeline code block
	 */
	async process(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	): Promise<void> {
		try {
			// Parse config from code block source
			const config = this.service.parseConfig(source);

			// Build context (resolves file, cr_id, person)
			const context = this.service.buildContext(ctx);
			if (!context) return;

			// Create a MarkdownRenderChild for proper cleanup of rendered markdown
			const component = new MarkdownRenderChild(el);
			ctx.addChild(component);

			// If cr_id not found, the metadata cache may not be ready yet
			// Show loading state and wait for the 'changed' event to re-render
			if (!context.crId) {
				renderBlockLoading(el, 'Waiting for metadata...');

				// Register for metadata changes - will re-render when cache is ready
				const metadataHandler = async (changedFile: TFile) => {
					if (changedFile.path === context.file.path) {
						// Re-build context to get fresh data
						const freshContext = this.service.buildContext(ctx);
						if (!freshContext) return;
						// Clear and re-render
						el.empty();
						if (freshContext.crId) {
							await this.renderer.render(el, freshContext, config, component);
						} else {
							renderBlockError(el, 'This note does not have a cr_id. Timeline can only be rendered in person notes.');
						}
					}
				};

				component.registerEvent(
					this.plugin.app.metadataCache.on('changed', metadataHandler)
				);
				return;
			}

			// Initial render
			await this.renderer.render(el, context, config, component);

			// In Workspace mode the Workspace root is the authoritative dataset
			// boundary and event notes may live outside the default Events folder.
			// Legacy mode keeps the historical global eventsFolder behavior.
			const workspaceService = this.plugin.getWorkspaceService?.();
			const eventsFolder = workspaceService
				? workspaceService.getFolder('events')
				: (this.plugin.settings.eventsFolder || '');

			// Resolve context note path for change detection
			const contextParam = config.context as string | undefined;
			const contextValue = contextParam !== 'none'
				? (contextParam || this.plugin.settings.defaultTimelineContext)
				: '';
			const contextNotePath = contextValue
				? extractWikilinkPath(contextValue)
				: '';
			const contextFile = contextNotePath
				? this.plugin.app.metadataCache.getFirstLinkpathDest(contextNotePath, context.file.path)
				: null;

			// Register for metadata changes to re-render when frontmatter changes
			const metadataHandler = async (changedFile: TFile) => {
				// Re-render if the person's own file changed
				if (changedFile.path === context.file.path) {
					const freshContext = this.service.buildContext(ctx);
					if (!freshContext) return;
					el.empty();
					await this.renderer.render(el, freshContext, config, component);
					return;
				}

				// Re-render if the context note changed
				if (contextFile && changedFile.path === contextFile.path) {
					const freshContext = this.service.buildContext(ctx);
					if (!freshContext) return;
					el.empty();
					await this.renderer.render(el, freshContext, config, component);
					return;
				}

				// Also re-render if an event note in the active Workspace changed.
				// In Workspace mode use type + scope rather than the default folder
				// alone, so manually-organized event notes still refresh correctly.
				const isScopedEvent = workspaceService
					? workspaceService.getScope().contains(changedFile)
						&& this.plugin.app.metadataCache.getFileCache(changedFile)?.frontmatter?.cr_type === 'event'
					: !!eventsFolder && changedFile.path.startsWith(eventsFolder);
				if (isScopedEvent) {
					const freshContext = this.service.buildContext(ctx);
					if (!freshContext) return;
					el.empty();
					await this.renderer.render(el, freshContext, config, component);
				}
			};

			// Register the event and store reference for cleanup
			component.registerEvent(
				this.plugin.app.metadataCache.on('changed', metadataHandler)
			);

			// Also listen for file creation events (for newly created event notes).
			// Metadata may not be populated yet on create, so in Workspace mode the
			// default Events folder is the deterministic immediate signal; a custom
			// event path will be picked up by the subsequent metadata changed event.
			const createHandler = (file: TAbstractFile) => {
				const shouldRefresh = file instanceof TFile && (
					workspaceService
						? workspaceService.getScope().contains(file) && file.path.startsWith(eventsFolder)
						: !!eventsFolder && file.path.startsWith(eventsFolder)
				);
				if (shouldRefresh) {
					// Small delay to allow metadata cache to process the new file
					window.setTimeout(() => {
						const freshContext = this.service.buildContext(ctx);
						if (!freshContext) return;
						el.empty();
						void this.renderer.render(el, freshContext, config, component);
					}, 100);
				}
			};

			component.registerEvent(
				this.plugin.app.vault.on('create', createHandler)
			);

		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			renderBlockError(el, `Error rendering timeline: ${message}`);
		}
	}

}
