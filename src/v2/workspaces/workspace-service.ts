import type { App } from 'obsidian';
import { WorkspacePathResolver } from './workspace-path-resolver';
import { WorkspaceRegistry } from './workspace-registry';
import { WorkspaceScope } from './workspace-scope';
import type {
	WorkspaceCatalog,
	WorkspaceConfiguration,
	WorkspaceDefinition,
	WorkspaceFolderKey
} from './types';

export type WorkspaceActiveChangeListener = (
	current: WorkspaceDefinition,
	previous: WorkspaceDefinition
) => void;

export class WorkspaceService {
	private registry: WorkspaceRegistry;
	private scope: WorkspaceScope;
	private readonly paths = new WorkspacePathResolver();
	private readonly listeners = new Set<WorkspaceActiveChangeListener>();

	constructor(
		private readonly app: App,
		catalog: WorkspaceCatalog,
		activeWorkspaceId?: string
	) {
		const selected = catalog.workspaces.some(
			workspace => workspace.id === activeWorkspaceId
		)
			? activeWorkspaceId!
			: catalog.workspaces[0]?.id;

		if (!selected) {
			throw new Error('Workspace catalog must contain at least one Workspace.');
		}

		this.registry = new WorkspaceRegistry({
			version: 1,
			activeWorkspaceId: selected,
			workspaces: catalog.workspaces
		});
		this.scope = new WorkspaceScope(this.app, this.registry);
	}

	getRegistry(): WorkspaceRegistry {
		return this.registry;
	}

	getScope(): WorkspaceScope {
		return this.scope;
	}

	getCatalog(): WorkspaceCatalog {
		const config = this.registry.getConfiguration();
		return {
			version: 1,
			workspaces: config.workspaces
		};
	}

	getConfiguration(): WorkspaceConfiguration {
		return this.registry.getConfiguration();
	}

	getActive(): WorkspaceDefinition {
		return this.registry.getActive();
	}

	getActiveId(): string {
		return this.registry.getActiveId();
	}

	setActive(id: string): void {
		const previous = this.registry.getActive();
		if (previous.id === id) return;

		this.registry.setActive(id);
		const current = this.registry.getActive();
		for (const listener of this.listeners) {
			listener(current, previous);
		}
	}

	replaceCatalog(
		catalog: WorkspaceCatalog,
		preferredActiveWorkspaceId?: string
	): void {
		const currentActiveId = preferredActiveWorkspaceId
			?? this.registry.getActiveId();
		const selected = catalog.workspaces.some(
			workspace => workspace.id === currentActiveId
		)
			? currentActiveId
			: catalog.workspaces[0]?.id;

		if (!selected) {
			throw new Error('Workspace catalog must contain at least one Workspace.');
		}

		const previous = this.registry.getActive();
		this.registry = new WorkspaceRegistry({
			version: 1,
			activeWorkspaceId: selected,
			workspaces: catalog.workspaces
		});
		this.scope = new WorkspaceScope(this.app, this.registry);
		const current = this.registry.getActive();

		if (current.id !== previous.id) {
			for (const listener of this.listeners) {
				listener(current, previous);
			}
		}
	}

	onActiveChange(listener: WorkspaceActiveChangeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getFolder(key: WorkspaceFolderKey, workspaceId?: string): string {
		const workspace = workspaceId
			? this.registry.get(workspaceId)
			: this.registry.getActive();
		if (!workspace) {
			throw new Error(`Workspace "${workspaceId}" does not exist.`);
		}
		return this.paths.getFolder(workspace, key);
	}

	resolvePath(
		key: WorkspaceFolderKey,
		childPath?: string,
		workspaceId?: string
	): string {
		const workspace = workspaceId
			? this.registry.get(workspaceId)
			: this.registry.getActive();
		if (!workspace) {
			throw new Error(`Workspace "${workspaceId}" does not exist.`);
		}
		return this.paths.resolve(workspace, key, childPath);
	}
}
