import type { App, TFile } from 'obsidian';
import { pathIsInsideRoot } from './path-utils';
import type { WorkspaceDefinition } from './types';
import { WorkspaceRegistry } from './workspace-registry';

export class WorkspaceScope {
	constructor(
		private readonly app: App,
		private readonly registry: WorkspaceRegistry
	) {}

	getActiveWorkspace(): WorkspaceDefinition {
		return this.registry.getActive();
	}

	containsPath(path: string, workspaceId?: string): boolean {
		const workspace = workspaceId
			? this.registry.get(workspaceId)
			: this.registry.getActive();
		if (!workspace) return false;
		return pathIsInsideRoot(path, workspace.rootFolder);
	}

	contains(file: TFile, workspaceId?: string): boolean {
		return this.containsPath(file.path, workspaceId);
	}

	getWorkspaceForPath(path: string): WorkspaceDefinition | undefined {
		return this.registry.getAll().find(workspace =>
			pathIsInsideRoot(path, workspace.rootFolder)
		);
	}

	getMarkdownFiles(workspaceId?: string): TFile[] {
		return this.app.vault.getMarkdownFiles().filter(file =>
			this.contains(file, workspaceId)
		);
	}
}
