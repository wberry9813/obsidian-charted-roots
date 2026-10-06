import type { App } from 'obsidian';
import {
	deriveLegacyWorkspace,
	type LegacyFolderSettingsLike,
	type LegacyWorkspaceDerivation
} from './legacy-workspace-derivation';
import {
	WorkspaceCatalogService
} from './workspace-catalog-service';
import { WorkspaceService } from './workspace-service';

export interface WorkspaceBootstrapResult {
	status: 'catalog' | 'derived' | 'review';
	service: WorkspaceService | null;
	derivation?: LegacyWorkspaceDerivation;
	catalogCreated: boolean;
}

/**
 * Establish Workspace scope without touching Schema v2 state.
 *
 * Existing catalog wins. Otherwise only a deterministic legacy-folder layout
 * may be materialized automatically. Ambiguous layouts stay in review/legacy
 * mode and are never guessed.
 */
export async function bootstrapWorkspaceFoundation(
	app: App,
	legacySettings: LegacyFolderSettingsLike,
	activeWorkspaceId?: string,
	catalogService = new WorkspaceCatalogService(app)
): Promise<WorkspaceBootstrapResult> {
	const existing = await catalogService.read();
	if (existing) {
		return {
			status: 'catalog',
			service: new WorkspaceService(app, existing, activeWorkspaceId),
			catalogCreated: false
		};
	}

	const derivation = deriveLegacyWorkspace(legacySettings);
	if (derivation.status !== 'ready' || !derivation.workspace) {
		return {
			status: 'review',
			service: null,
			derivation,
			catalogCreated: false
		};
	}

	const catalog = {
		version: 1 as const,
		workspaces: [derivation.workspace]
	};
	await catalogService.write(catalog);

	return {
		status: 'derived',
		service: new WorkspaceService(app, catalog, activeWorkspaceId),
		derivation,
		catalogCreated: true
	};
}
