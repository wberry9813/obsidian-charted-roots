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

/**
 * Create an ephemeral settings view for old report/export code that still
 * reads folder paths or FolderFilter settings from CanvasRootsSettings. The
 * user's persisted settings object is never mutated.
 */
export function createReportScopedSettings(
	settings: CanvasRootsSettings,
	context: ReportGenerationContext
): CanvasRootsSettings {
	const workspaceRoot = context.workspaceRootProvider?.()?.trim();

	return {
		...settings,
		// Most legacy genealogy report generators create their own FamilyGraph.
		// Force those graphs through FolderFilter when a Workspace is active so
		// they cannot silently fall back to whole-vault person discovery.
		folderFilterMode: workspaceRoot ? 'include' : settings.folderFilterMode,
		includedFolders: workspaceRoot ? [workspaceRoot] : settings.includedFolders,
		excludedFolders: workspaceRoot ? [] : settings.excludedFolders,
		eventsFolder: context.folderProvider?.('events') ?? settings.eventsFolder,
		sourcesFolder: context.folderProvider?.('sources') ?? settings.sourcesFolder,
		citationsFolder: context.folderProvider?.('citations') ?? settings.citationsFolder,
		canvasesFolder: context.folderProvider?.('canvases') ?? settings.canvasesFolder,
		reportsFolder: context.folderProvider?.('reports') ?? settings.reportsFolder
	};
}
