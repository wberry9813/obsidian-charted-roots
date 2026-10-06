import { normalizePath } from 'obsidian';
import { DEFAULT_WORKSPACE_FOLDERS } from './defaults';
import {
	isSafeRelativeWorkspacePath,
	normalizeWorkspacePath
} from './path-utils';
import type {
	WorkspaceDefinition,
	WorkspaceFolderKey
} from './types';

export class WorkspacePathResolver {
	getRoot(workspace: WorkspaceDefinition): string {
		const root = normalizeWorkspacePath(workspace.rootFolder);
		if (!root) {
			throw new Error(`Workspace "${workspace.id}" has an empty root folder.`);
		}
		return root;
	}

	getFolder(
		workspace: WorkspaceDefinition,
		key: WorkspaceFolderKey
	): string {
		const override = workspace.folders?.[key];
		const relative = override ?? DEFAULT_WORKSPACE_FOLDERS[key];
		if (!isSafeRelativeWorkspacePath(relative)) {
			throw new Error(
				`Workspace "${workspace.id}" has an invalid folder path for "${key}".`
			);
		}
		return normalizePath(`${this.getRoot(workspace)}/${relative}`);
	}

	resolve(
		workspace: WorkspaceDefinition,
		key: WorkspaceFolderKey,
		childPath?: string
	): string {
		const folder = this.getFolder(workspace, key);
		if (!childPath) return folder;
		if (!isSafeRelativeWorkspacePath(childPath)) {
			throw new Error('Workspace child path must remain relative.');
		}
		return normalizePath(`${folder}/${childPath}`);
	}
}
