/**
 * Relationships Dockable View
 *
 * A workspace ItemView that displays the relationships list in a dockable
 * sidebar panel. Shares rendering logic with the Control Center modal via
 * `renderRelationshipsList()`.
 */

import { ItemView, WorkspaceLeaf, setIcon } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import { astronomicalYearToHistorical } from '../../v2/time/historical-year';
import { renderRelationshipsList, type RelationshipFilter, type RelationshipSort } from './relationships-tab';

export const VIEW_TYPE_RELATIONSHIPS = 'canvas-roots-relationships';

interface RelationshipsViewState {
	filter?: RelationshipFilter;
	sort?: RelationshipSort;
}

function displayReference(value: string | undefined): string {
	if (!value) return '';
	const trimmed = value.trim();
	if (!trimmed.startsWith('[[') || !trimmed.endsWith(']]')) {
		return trimmed;
	}
	const inner = trimmed.slice(2, -2);
	const [target, alias] = inner.split('|', 2);
	return (alias ?? target ?? '').split('/').pop() ?? trimmed;
}

function formatTemporalPosition(
	plugin: CanvasRootsPlugin,
	position: number
): string {
	const calendar = plugin.getHistoricalDateService()
		.getCalendarProvider('tyme');
	if (!calendar) return 'Temporal focus';
	const solar = calendar.julianDayToSolar(position);
	const historical = astronomicalYearToHistorical(solar.year);
	const month = String(solar.month).padStart(2, '0');
	const day = String(solar.day).padStart(2, '0');
	return `${historical.year} ${historical.era} · ${month}-${day}`;
}

export class RelationshipsView extends ItemView {
	plugin: CanvasRootsPlugin;
	private currentFilter: RelationshipFilter = 'all';
	private currentSort: RelationshipSort = 'from_asc';
	private refreshTimeout: number | null = null;
	private focusUnsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: CanvasRootsPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_RELATIONSHIPS;
	}

	getDisplayText(): string {
		return 'Relationships';
	}

	getIcon(): string {
		return 'users';
	}

	async onOpen(): Promise<void> {
		this.buildUI();
		this.registerEventHandlers();
		this.focusUnsubscribe = this.plugin.getTemporalFocusService().subscribe(
			() => this.buildUI()
		);
	}

	async onClose(): Promise<void> {
		if (this.refreshTimeout) {
			window.clearTimeout(this.refreshTimeout);
		}
		this.focusUnsubscribe?.();
		this.focusUnsubscribe = null;
	}

	/**
	 * Build the view UI
	 */
	private buildUI(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass('cr-relationships-view');

		// Header
		this.buildHeader(container);

		this.renderTemporalState(container);

		// List content
		const listContainer = container.createDiv({ cls: 'cr-rv-content' });
		renderRelationshipsList({
			container: listContainer,
			plugin: this.plugin,
			initialFilter: this.currentFilter,
			initialSort: this.currentSort,
			onStateChange: (filter, sort) => {
				this.currentFilter = filter;
				this.currentSort = sort;
			}
		});
	}

	private renderTemporalState(container: HTMLElement): void {
		const focus = this.plugin.getTemporalFocusService().get();
		if (!focus) return;

		const stateService = this.plugin.getTemporalAssertionStateService();
		if (!stateService) return;

		const snapshot = focus.kind === 'point'
			? stateService.getAt(focus.position)
			: stateService.getRange({
				start: focus.start,
				endExclusive: focus.endExclusive
			});

		const section = container.createDiv({
			cls: 'cr-rv-temporal-state'
		});
		const heading = section.createDiv({
			cls: 'cr-rv-temporal-state__header'
		});
		heading.createEl('strong', {
			text: 'Temporal Assertions at focus'
		});
		heading.createSpan({
			text: focus.kind === 'point'
				? formatTemporalPosition(this.plugin, focus.position)
				: 'Selected range',
			cls: 'cr-rv-temporal-state__focus'
		});

		section.createDiv({
			text: `${snapshot.active.length} active · ${snapshot.possible.length} possible`,
			cls: 'cr-rv-temporal-state__summary'
		});

		const renderEntries = (
			state: 'active' | 'possible',
			entries: typeof snapshot.active
		): void => {
			for (const entry of entries) {
				const button = section.createEl('button', {
					cls: `cr-rv-temporal-state__item cr-rv-temporal-state__item--${state}`,
					attr: {
						type: 'button',
						'data-temporal-state': state,
						'data-assertion-id': entry.id
					}
				});
				const object = entry.object
					? displayReference(entry.object)
					: String(entry.value ?? '');
				button.createSpan({
					text: displayReference(entry.subject),
					cls: 'cr-rv-temporal-state__subject'
				});
				button.createSpan({
					text: ` — ${entry.predicate}${object ? ` → ${object}` : ''}`,
					cls: 'cr-rv-temporal-state__predicate'
				});
				button.addEventListener('click', () => {
					void this.app.workspace.getLeaf(false).openFile(entry.item.file);
				});
			}
		};

		renderEntries('active', snapshot.active);
		renderEntries('possible', snapshot.possible);
	}

	/**
	 * Build the header with title and refresh button
	 */
	private buildHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: 'cr-rv-header' });

		header.createEl('h2', { text: 'Relationships', cls: 'cr-rv-title' });

		const actions = header.createDiv({ cls: 'cr-rv-actions' });

		const refreshBtn = actions.createEl('button', {
			cls: 'clickable-icon',
			attr: { 'aria-label': 'Refresh' }
		});
		setIcon(refreshBtn, 'refresh-cw');
		refreshBtn.addEventListener('click', () => this.refresh());
	}

	/**
	 * Refresh the view
	 */
	private refresh(): void {
		this.buildUI();
	}

	/**
	 * Register event handlers for vault changes
	 */
	private registerEventHandlers(): void {
		this.registerEvent(
			this.app.vault.on('modify', () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on('create', () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on('delete', () => this.scheduleRefresh())
		);
	}

	/**
	 * Schedule a debounced refresh
	 */
	private scheduleRefresh(): void {
		if (this.refreshTimeout) {
			window.clearTimeout(this.refreshTimeout);
		}
		this.refreshTimeout = window.setTimeout(() => {
			this.refreshTimeout = null;
			this.refresh();
		}, 2000);
	}

	// State persistence
	getState(): Record<string, unknown> {
		return {
			filter: this.currentFilter,
			sort: this.currentSort
		};
	}

	async setState(state: Partial<RelationshipsViewState>): Promise<void> {
		if (state.filter) {
			this.currentFilter = state.filter;
		}
		if (state.sort) {
			this.currentSort = state.sort;
		}
		this.buildUI();
	}
}
