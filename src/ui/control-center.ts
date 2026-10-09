import { Notice } from 'obsidian';
import { ControlCenterModal as CoreControlCenterModal } from './control-center-core';
import { WorkspaceManagerModal } from './workspace-manager-modal';

/**
 * Keep the mature Control Center implementation isolated in control-center-core
 * and layer Workspace controls into its existing header.
 */
export class ControlCenterModal extends CoreControlCenterModal {
	override onOpen(): void {
		super.onOpen();
		this.installWorkspaceControls();
	}

	private installWorkspaceControls(): void {
		const actions = this.modalEl.querySelector('.crc-header-actions') as HTMLElement | null;
		if (!actions) return;
		actions.empty();

		const service = this.plugin.getWorkspaceService();
		if (service) {
			actions.createSpan({
				text: 'Workspace',
				cls: 'crc-workspace-selector__label'
			});
			const select = actions.createEl('select', {
				cls: 'dropdown crc-workspace-selector'
			});
			for (const workspace of service.getCatalog().workspaces) {
				const option = select.createEl('option', {
					value: workspace.id,
					text: workspace.name
				});
				option.selected = workspace.id === service.getActiveId();
			}
			select.addEventListener('change', () => {
				void this.switchWorkspace(select.value);
			});
		}

		const manage = actions.createEl('button', {
			text: 'Manage Workspaces',
			cls: 'cr-workspace-manage-button'
		});
		manage.addEventListener('click', () => {
			new WorkspaceManagerModal(this.plugin).open();
		});
	}

	private async switchWorkspace(id: string): Promise<void> {
		try {
			await this.plugin.setActiveWorkspace(id);
			// Rebuild the existing Control Center so all of its own private caches
			// and the active tab are refreshed against the new Workspace scope.
			super.onClose();
			super.onOpen();
			this.installWorkspaceControls();
			new Notice(`Active Workspace: ${this.plugin.getWorkspaceService()?.getActive().name ?? id}`);
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
			this.installWorkspaceControls();
		}
	}
}
