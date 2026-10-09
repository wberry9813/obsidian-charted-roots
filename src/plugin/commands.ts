import type CanvasRootsPlugin from '../../main';
import { WorkspaceManagerModal } from '../ui/workspace-manager-modal';
import { registerCommandsAndEvents as registerCoreCommandsAndEvents } from './commands-core';

/**
 * Register the mature Charted Roots command surface, then layer Workspace
 * foundation commands on top without rewriting the large upstream command
 * registry.
 */
export function registerCommandsAndEvents(plugin: CanvasRootsPlugin): void {
	registerCoreCommandsAndEvents(plugin);

	plugin.addCommand({
		id: 'manage-workspaces',
		name: 'Manage Workspaces',
		callback: () => {
			new WorkspaceManagerModal(plugin).open();
		}
	});

	plugin.addRibbonIcon('layers', 'Manage Charted Roots Workspaces', () => {
		new WorkspaceManagerModal(plugin).open();
	});
}
