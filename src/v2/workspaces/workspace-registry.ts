import { DEFAULT_WORKSPACE_FOLDERS } from './defaults';
import {
	isSafeRelativeWorkspacePath,
	normalizeWorkspacePath,
	rootsOverlap
} from './path-utils';
import type {
	WorkspaceCatalog,
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

export function validateWorkspaceDefinitions(
	workspaces: WorkspaceDefinition[]
): WorkspaceValidationResult {
	const issues: WorkspaceValidationIssue[] = [];
	const ids = new Map<string, WorkspaceDefinition>();
	const validModes = new Set(['genealogy', 'historical', 'worldbuilding']);
	const validFolderKeys = new Set(Object.keys(DEFAULT_WORKSPACE_FOLDERS));

	if (!Array.isArray(workspaces) || workspaces.length === 0) {
		issues.push({
			code: 'empty_registry',
			message: 'At least one Workspace must be configured.'
		});
		if (!Array.isArray(workspaces)) {
			return { valid: false, issues };
		}
	}

	for (const candidate of workspaces as unknown[]) {
		if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
			issues.push({
				code: 'invalid_definition',
				message: 'Each Workspace definition must be an object.'
			});
			continue;
		}

		const record = candidate as Record<string, unknown>;
		const id = typeof record.id === 'string' ? record.id : undefined;
		const workspaceId = id;

		if (!id || !WORKSPACE_ID_PATTERN.test(id)) {
			issues.push({
				code: 'invalid_id',
				workspaceId,
				message: 'Workspace id must start with a lowercase letter and use only lowercase letters, numbers, "_" or "-".'
			});
		}

		if (typeof record.name !== 'string') {
			issues.push({
				code: 'invalid_definition',
				workspaceId,
				field: 'name',
				message: 'Workspace name must be a string.'
			});
		} else if (!record.name.trim()) {
			issues.push({
				code: 'empty_name',
				workspaceId,
				field: 'name',
				message: 'Workspace name must not be empty.'
			});
		}

		if (typeof record.rootFolder !== 'string') {
			issues.push({
				code: 'invalid_definition',
				workspaceId,
				field: 'rootFolder',
				message: 'Workspace rootFolder must be a string.'
			});
		} else {
			const root = normalizeWorkspacePath(record.rootFolder);
			if (!root) {
				issues.push({
					code: 'empty_root',
					workspaceId,
					field: 'rootFolder',
					message: 'Workspace rootFolder must not be empty.'
				});
			} else if (!isSafeRelativeWorkspacePath(record.rootFolder)) {
				issues.push({
					code: 'invalid_root',
					workspaceId,
					field: 'rootFolder',
					message: 'Workspace rootFolder must be a safe vault-relative path.'
				});
			}
		}

		if (typeof record.mode !== 'string' || !validModes.has(record.mode)) {
			issues.push({
				code: 'invalid_mode',
				workspaceId,
				field: 'mode',
				message: 'Workspace mode must be genealogy, historical, or worldbuilding.'
			});
		}

		if (
			!Array.isArray(record.enabledPacks)
			|| record.enabledPacks.length === 0
			|| record.enabledPacks.some(
				item => typeof item !== 'string' || !item.trim()
			)
			|| !record.enabledPacks.includes('core')
		) {
			issues.push({
				code: 'invalid_packs',
				workspaceId,
				field: 'enabledPacks',
				message: 'Workspace enabledPacks must be non-empty strings and include "core".'
			});
		}

		const folders = record.folders;
		if (folders !== undefined) {
			if (!folders || typeof folders !== 'object' || Array.isArray(folders)) {
				issues.push({
					code: 'invalid_definition',
					workspaceId,
					field: 'folders',
					message: 'Workspace folders must be an object when provided.'
				});
			} else {
				for (const [folderKey, folderPath] of Object.entries(
					folders as Record<string, unknown>
				)) {
					if (!validFolderKeys.has(folderKey)) {
						issues.push({
							code: 'unknown_folder_key',
							workspaceId,
							field: `folders.${folderKey}`,
							message: `Unknown Workspace folder key "${folderKey}".`
						});
						continue;
					}
					if (
						typeof folderPath !== 'string'
						|| !isSafeRelativeWorkspacePath(folderPath)
					) {
						issues.push({
							code: 'invalid_folder_override',
							workspaceId,
							field: `folders.${folderKey}`,
							message: `Workspace folder override "${folderKey}" must be a non-empty relative path inside the Workspace root.`
						});
					}
				}
			}
		}

		if (id && !ids.has(id)) {
			ids.set(id, candidate as WorkspaceDefinition);
		} else if (id) {
			issues.push({
				code: 'duplicate_id',
				workspaceId: id,
				conflictingWorkspaceId: id,
				message: `Duplicate Workspace id "${id}".`
			});
		}
	}

	for (let i = 0; i < workspaces.length; i++) {
		const current = workspaces[i] as unknown as Record<string, unknown>;
		if (typeof current?.rootFolder !== 'string') continue;
		const currentRoot = normalizeWorkspacePath(current.rootFolder);
		if (!currentRoot) continue;

		for (let j = i + 1; j < workspaces.length; j++) {
			const other = workspaces[j] as unknown as Record<string, unknown>;
			if (typeof other?.rootFolder !== 'string') continue;
			const otherRoot = normalizeWorkspacePath(other.rootFolder);
			if (!otherRoot || !rootsOverlap(currentRoot, otherRoot)) continue;

			const currentId = typeof current.id === 'string' ? current.id : undefined;
			const otherId = typeof other.id === 'string' ? other.id : undefined;
			const same = currentRoot === otherRoot;
			issues.push({
				code: same ? 'duplicate_root' : 'overlapping_root',
				workspaceId: currentId,
				conflictingWorkspaceId: otherId,
				field: 'rootFolder',
				message: same
					? `Workspaces "${currentId ?? '?'}" and "${otherId ?? '?'}" use the same root folder.`
					: `Workspace roots "${currentRoot}" and "${otherRoot}" overlap. Nested Workspaces are not supported.`
			});
		}
	}

	return {
		valid: issues.length === 0,
		issues
	};
}

export function validateWorkspaceCatalog(
	catalog: WorkspaceCatalog
): WorkspaceValidationResult {
	if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
		return {
			valid: false,
			issues: [{
				code: 'invalid_definition',
				message: 'Workspace catalog must be an object.'
			}]
		};
	}

	const record = catalog as unknown as Record<string, unknown>;
	const issues: WorkspaceValidationIssue[] = [];
	if (record.version !== 1) {
		issues.push({
			code: 'invalid_definition',
			field: 'version',
			message: 'Workspace catalog version must be 1.'
		});
	}
	if (!Array.isArray(record.workspaces)) {
		issues.push({
			code: 'invalid_definition',
			field: 'workspaces',
			message: 'Workspace catalog workspaces must be an array.'
		});
		return { valid: false, issues };
	}

	const definitions = validateWorkspaceDefinitions(
		record.workspaces as WorkspaceDefinition[]
	);
	return {
		valid: issues.length === 0 && definitions.valid,
		issues: [...issues, ...definitions.issues]
	};
}

export function validateWorkspaceConfiguration(
	config: WorkspaceConfiguration
): WorkspaceValidationResult {
	const result = validateWorkspaceCatalog({
		version: config.version,
		workspaces: config.workspaces
	});
	const issues = [...result.issues];

	if (
		config.workspaces.length > 0
		&& (
			typeof config.activeWorkspaceId !== 'string'
			|| !config.workspaces.some(
				workspace => workspace.id === config.activeWorkspaceId
			)
		)
	) {
		issues.push({
			code: 'missing_active_workspace',
			workspaceId: typeof config.activeWorkspaceId === 'string'
				? config.activeWorkspaceId
				: undefined,
			message: `Active Workspace "${String(config.activeWorkspaceId)}" does not exist.`
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
