import type { TFile } from 'obsidian';
import type { CanvasRootsSettings } from '../../settings';

export type ReportFolderKind =
	| 'reports'
	| 'events'
	| 'sources'
	| 'citations'
	| 'canvases';

/**
 * Runtime-only scope supplied by the active Charted Roots Workspace.
 *
 * Report services stay independent from the v2 Workspace implementation: the
 * plugin provides plain functions, so reports can still be constructed in
 * tests or legacy contexts without a WorkspaceService.
 */
export interface ReportGenerationContext {
	fileProvider?: () => TFile[];
	scopeKeyProvider?: () => string | null;
	workspaceRootProvider?: () => string | undefined;
	folderProvider?: (kind: ReportFolderKind) => string | undefined;
}

type ReportGenerationContextProvider = () => ReportGenerationContext;
let defaultContextProvider: ReportGenerationContextProvider | undefined;

/**
 * Register the plugin-level dynamic Workspace context used by legacy report UI
 * that still constructs ReportGenerationService with only app + settings.
 * Provider functions remain dynamic, so switching the Active Workspace does
 * not require rebuilding persisted settings.
 */
export function registerDefaultReportGenerationContext(
	provider: ReportGenerationContextProvider
): void {
	defaultContextProvider = provider;
}

export function getDefaultReportGenerationContext(): ReportGenerationContext {
	return defaultContextProvider?.() ?? {};
}

/**
 * Create an ephemeral settings view for old report/export code that still
 * reads folder paths or FolderFilter settings from CanvasRootsSettings. The
 * user's persisted settings object is never mutated.
 *
 * `context` is hydrated in-place with the registered default context so the
 * owning ReportGenerationService can also use the same providers for output
 * validation and folder discovery without changing its legacy constructor.
 */
export function createReportScopedSettings(
	settings: CanvasRootsSettings,
	context: ReportGenerationContext
): CanvasRootsSettings {
	const effective: ReportGenerationContext = {
		...getDefaultReportGenerationContext(),
		...context
	};
	Object.assign(context, effective);

	const workspaceRoot = effective.workspaceRootProvider?.()?.trim();

	return {
		...settings,
		// Most legacy genealogy report generators create their own FamilyGraph.
		// Force those graphs through FolderFilter when a Workspace is active so
		// they cannot silently fall back to whole-vault person discovery.
		folderFilterMode: workspaceRoot ? 'include' : settings.folderFilterMode,
		includedFolders: workspaceRoot ? [workspaceRoot] : settings.includedFolders,
		excludedFolders: workspaceRoot ? [] : settings.excludedFolders,
		eventsFolder: effective.folderProvider?.('events') ?? settings.eventsFolder,
		sourcesFolder: effective.folderProvider?.('sources') ?? settings.sourcesFolder,
		citationsFolder: effective.folderProvider?.('citations') ?? settings.citationsFolder,
		canvasesFolder: effective.folderProvider?.('canvases') ?? settings.canvasesFolder,
		reportsFolder: effective.folderProvider?.('reports') ?? settings.reportsFolder
	};
}
