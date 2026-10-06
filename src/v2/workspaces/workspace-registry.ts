import {
	isSafeRelativeWorkspacePath,
	normalizeWorkspacePath,
	rootsOverlap
} from './path-utils';
import type {
	WorkspaceConfiguration,
	WorkspaceDefinition,
	WorkspaceValidationIssue,
	WorkspaceValidationResult
} from './types';

const WORKSPACE_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

function cloneWorkspace(workspace: WorkspaceDefinition): WorkspaceDefinition {
	return {
		...workspace,
		enabledPacks: [...workspace.enabledPacks],
		folders: workspace.folders ? { ...workspace.folders } : undefined
	};
}

export function validateWorkspaceConfiguration(
	config: WorkspaceConfiguration
): WorkspaceValidationResult {
	const issues: WorkspaceValidationIssue[] = [];
	const ids = new Map<string, WorkspaceDefinition>();

	if (config.workspaces.length === 0) {
		issues.push({
			code: 'empty_registry',
			message: 'At least one Workspace must be configured.'
		});
	}

	for (const workspace of config.workspaces) {
		if (!WORKSPACE_ID_PATTERN.test(workspace.id)) {
			issues.push({
				code: 'invalid_id',
				workspaceId: workspace.id,
				message: `Invalid Workspace id "${workspace.id}". Use lowercase letters, numbers, "_" or "-".`
			});
		}
		if (!workspace.name.trim()) {
			issues.push({
				code: 'empty_name',
				workspaceId: workspace.id,
				message: 'Workspace name must not be empty.'
			});
		}

		const root = normalizeWorkspacePath(workspace.rootFolder);
		if (!root) {
			issues.push({
				code: 'empty_root',
				workspaceId: workspace.id,
				field: 'rootFolder',
				message: 'Workspace rootFolder must not be empty.'
			});
		} else if (!isSafeRelativeWorkspacePath(workspace.rootFolder)) {
			issues.push({
				code: 'invalid_root',
				workspaceId: workspace.id,
				field: 'rootFolder',
				message: 'Workspace rootFolder must be a safe vault-relative path.'
			});
		}

		const existingId = ids.get(workspace.id);
		if (existingId) {
			issues.push({
				code: 'duplicate_id',
				workspaceId: workspace.id,
				conflictingWorkspaceId: existingId.id,
				message: `Duplicate Workspace id "${workspace.id}".`
			});
		} else {
			ids.set(workspace.id, workspace);
		}

		for (const [folderKey, folderPath] of Object.entries(workspace.folders ?? {})) {
			if (
				typeof folderPath !== 'string'
				|| !isSafeRelativeWorkspacePath(folderPath)
			) {
				issues.push({
					code: 'invalid_folder_override',
					workspaceId: workspace.id,
					field: `folders.${folderKey}`,
					message: `Workspace folder override "${folderKey}" must be a non-empty relative path inside the Workspace root.`
				});
			}
		}
	}

	for (let i = 0; i < config.workspaces.length; i++) {
		const current = config.workspaces[i];
		const currentRoot = normalizeWorkspacePath(current.rootFolder);
		if (!currentRoot) continue;

		for (let j = i + 1; j < config.workspaces.length; j++) {
			const other = config.workspaces[j];
			const otherRoot = normalizeWorkspacePath(other.rootFolder);
			if (!otherRoot || !rootsOverlap(currentRoot, otherRoot)) continue;

			const same = currentRoot === otherRoot;
			issues.push({
				code: same ? 'duplicate_root' : 'overlapping_root',
				workspaceId: current.id,
				conflictingWorkspaceId: other.id,
				field: 'rootFolder',
				message: same
					? `Workspaces "${current.id}" and "${other.id}" use the same root folder.`
					: `Workspace roots "${currentRoot}" and "${otherRoot}" overlap. Nested Workspaces are not supported.`
			});
		}
	}

	if (
		config.workspaces.length > 0
		&& !config.workspaces.some(workspace => workspace.id === config.activeWorkspaceId)
	) {
		issues.push({
			code: 'missing_active_workspace',
			workspaceId: config.activeWorkspaceId,
			message: `Active Workspace "${config.activeWorkspaceId}" does not exist.`
		});
	}

	return {
		valid: issues.length === 0,
		issues
	};
}

export class WorkspaceRegistry {
	private config: WorkspaceConfiguration;

	constructor(initial: WorkspaceConfiguration) {
		const validation = validateWorkspaceConfiguration(initial);
		if (!validation.valid) {
			throw new Error(
				validation.issues.map(issue => issue.message).join(' ')
			);
		}
		this.config = {
			version: 1,
			activeWorkspaceId: initial.activeWorkspaceId,
			workspaces: initial.workspaces.map(cloneWorkspace)
		};
	}

	getConfiguration(): WorkspaceConfiguration {
		return {
			version: 1,
			activeWorkspaceId: this.config.activeWorkspaceId,
			workspaces: this.config.workspaces.map(cloneWorkspace)
		};
	}

	getAll(): WorkspaceDefinition[] {
		return this.config.workspaces.map(cloneWorkspace);
	}

	get(id: string): WorkspaceDefinition | undefined {
		const workspace = this.config.workspaces.find(item => item.id === id);
		return workspace ? cloneWorkspace(workspace) : undefined;
	}

	getActive(): WorkspaceDefinition {
		const workspace = this.config.workspaces.find(
			item => item.id === this.config.activeWorkspaceId
		);
		if (!workspace) {
			throw new Error(
				`Active Workspace "${this.config.activeWorkspaceId}" does not exist.`
			);
		}
		return cloneWorkspace(workspace);
	}

	getActiveId(): string {
		return this.config.activeWorkspaceId;
	}

	setActive(id: string): void {
		if (!this.config.workspaces.some(workspace => workspace.id === id)) {
			throw new Error(`Workspace "${id}" does not exist.`);
		}
		this.config.activeWorkspaceId = id;
	}

	add(workspace: WorkspaceDefinition): void {
		this.replaceConfiguration({
			...this.config,
			workspaces: [...this.config.workspaces, workspace]
		});
	}

	update(id: string, update: WorkspaceDefinition): void {
		if (id !== update.id) {
			throw new Error('Workspace id cannot be changed by update().');
		}
		if (!this.config.workspaces.some(workspace => workspace.id === id)) {
			throw new Error(`Workspace "${id}" does not exist.`);
		}
		this.replaceConfiguration({
			...this.config,
			workspaces: this.config.workspaces.map(workspace =>
				workspace.id === id ? update : workspace
			)
		});
	}

	remove(id: string): void {
		if (!this.config.workspaces.some(workspace => workspace.id === id)) {
			return;
		}

		const workspaces = this.config.workspaces.filter(
			workspace => workspace.id !== id
		);
		if (workspaces.length === 0) {
			throw new Error('At least one Workspace must remain configured.');
		}

		const activeWorkspaceId = this.config.activeWorkspaceId === id
			? workspaces[0].id
			: this.config.activeWorkspaceId;

		this.replaceConfiguration({
			version: 1,
			activeWorkspaceId,
			workspaces
		});
	}

	private replaceConfiguration(config: WorkspaceConfiguration): void {
		const validation = validateWorkspaceConfiguration(config);
		if (!validation.valid) {
			throw new Error(
				validation.issues.map(issue => issue.message).join(' ')
			);
		}
		this.config = {
			version: 1,
			activeWorkspaceId: config.activeWorkspaceId,
			workspaces: config.workspaces.map(cloneWorkspace)
		};
	}
}
