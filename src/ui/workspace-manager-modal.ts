import { Modal, Notice, Setting, normalizePath } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import {
	DEFAULT_WORKSPACE_FOLDERS,
	validateWorkspaceCatalog,
	type WorkspaceCatalog,
	type WorkspaceDefinition,
	type WorkspaceFolderKey,
	type WorkspaceFolderOverrides,
	type WorkspaceMode
} from '../v2/workspaces';

const MODE_LABELS: Record<WorkspaceMode, string> = {
	genealogy: 'Genealogy',
	historical: 'Historical research',
	worldbuilding: 'Worldbuilding'
};

const FOLDER_LABELS: Record<WorkspaceFolderKey, string> = {
	people: 'People',
	places: 'Places',
	organizations: 'Organizations',
	offices: 'Offices',
	events: 'Events',
	processes: 'Processes',
	periods: 'Periods',
	assertions: 'Assertions',
	claims: 'Claims',
	sources: 'Sources',
	citations: 'Citations',
	research: 'Research',
	maps: 'Maps',
	universes: 'Universes',
	schemas: 'Schemas',
	canvases: 'Canvases',
	staging: 'Staging',
	notes: 'Notes',
	bases: 'Bases',
	timelines: 'Timelines',
	reports: 'Reports'
};

function cloneWorkspace(workspace: WorkspaceDefinition): WorkspaceDefinition {
	return {
		...workspace,
		enabledPacks: [...workspace.enabledPacks],
		folders: workspace.folders ? { ...workspace.folders } : undefined
	};
}

function generateWorkspaceId(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (slug && /^[a-z]/.test(slug)) return slug;
	return `workspace-${Date.now().toString(36)}`;
}

async function ensureVaultFolder(plugin: CanvasRootsPlugin, path: string): Promise<void> {
	const normalized = normalizePath(path.trim());
	if (!normalized) return;

	let current = '';
	for (const segment of normalized.split('/').filter(Boolean)) {
		current = current ? `${current}/${segment}` : segment;
		if (await plugin.app.vault.adapter.exists(current)) continue;
		await plugin.app.vault.adapter.mkdir(current);
	}
}

export class WorkspaceManagerModal extends Modal {
	constructor(
		private readonly plugin: CanvasRootsPlugin
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private getCatalog(): WorkspaceCatalog {
		return this.plugin.getWorkspaceService()?.getCatalog() ?? {
			version: 1,
			workspaces: []
		};
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-workspace-manager');

		contentEl.createEl('h2', {
			text: 'Manage Workspaces',
			cls: 'cr-workspace-manager__title'
		});
		contentEl.createEl('p', {
			text: 'Each Workspace is an independent Charted Roots dataset inside this Obsidian vault. Files belong to a Workspace by folder path.',
			cls: 'setting-item-description'
		});

		const service = this.plugin.getWorkspaceService();
		const catalog = this.getCatalog();
		if (service) {
			new Setting(contentEl)
				.setName('Active Workspace')
				.setDesc('Views, pickers and new notes use this Workspace by default.')
				.addDropdown(dropdown => {
					for (const workspace of catalog.workspaces) {
						dropdown.addOption(workspace.id, workspace.name);
					}
					dropdown
						.setValue(service.getActiveId())
						.onChange(async id => {
							try {
								await this.plugin.setActiveWorkspace(id);
								this.render();
							} catch (error) {
								new Notice(error instanceof Error ? error.message : String(error));
							}
						});
				});
		} else {
			const status = this.plugin.getWorkspaceSetupStatus();
			contentEl.createDiv({
				cls: 'cr-info-box',
				text: status.error
					? `Workspace setup is unavailable: ${status.error}`
					: 'Workspace setup needs review. Create a Workspace below to establish an explicit dataset boundary.'
			});
		}

		const list = contentEl.createDiv({ cls: 'cr-workspace-manager__list' });
		const activeId = service?.getActiveId();
		for (const workspace of catalog.workspaces) {
			this.renderWorkspaceCard(list, workspace, workspace.id === activeId);
		}

		if (catalog.workspaces.length === 0) {
			list.createEl('p', {
				text: 'No Workspace catalog is configured yet.',
				cls: 'setting-item-description'
			});
		}

		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		const add = buttons.createEl('button', {
			text: 'Add Workspace',
			cls: 'mod-cta cr-workspace-manager__add'
		});
		add.addEventListener('click', () => {
			new WorkspaceEditModal(this.plugin, undefined, async workspace => {
				await this.saveWorkspace(workspace);
			}).open();
		});
		const close = buttons.createEl('button', { text: 'Close' });
		close.addEventListener('click', () => this.close());
	}

	private renderWorkspaceCard(
		container: HTMLElement,
		workspace: WorkspaceDefinition,
		active: boolean
	): void {
		const card = container.createDiv({
			cls: `cr-workspace-card${active ? ' cr-workspace-card--active' : ''}`
		});
		const heading = card.createDiv({ cls: 'cr-workspace-card__heading' });
		heading.createEl('strong', { text: workspace.name });
		if (active) {
			heading.createSpan({ text: 'Active', cls: 'cr-workspace-card__badge' });
		}

		card.createDiv({
			text: workspace.rootFolder,
			cls: 'cr-workspace-card__root setting-item-description'
		});
		card.createDiv({
			text: `${MODE_LABELS[workspace.mode]} · ${workspace.enabledPacks.join(', ')}`,
			cls: 'setting-item-description'
		});

		const actions = card.createDiv({ cls: 'cr-workspace-card__actions' });
		if (!active) {
			const activate = actions.createEl('button', { text: 'Activate' });
			activate.addEventListener('click', () => {
				void this.activate(workspace.id);
			});
		}
		const edit = actions.createEl('button', { text: 'Edit' });
		edit.addEventListener('click', () => {
			new WorkspaceEditModal(this.plugin, workspace, async updated => {
				await this.saveWorkspace(updated, workspace.id);
			}).open();
		});

		const catalog = this.getCatalog();
		const remove = actions.createEl('button', { text: 'Delete' });
		remove.disabled = catalog.workspaces.length <= 1;
		remove.addEventListener('click', () => {
			if (catalog.workspaces.length <= 1) return;
			new WorkspaceDeleteConfirmModal(this.plugin, workspace, async () => {
				await this.deleteWorkspace(workspace.id);
			}).open();
		});
	}

	private async activate(id: string): Promise<void> {
		try {
			await this.plugin.setActiveWorkspace(id);
			new Notice(`Active Workspace: ${this.plugin.getWorkspaceService()?.getActive().name ?? id}`);
			this.render();
		} catch (error) {
			new Notice(error instanceof Error ? error.message : String(error));
		}
	}

	private async saveWorkspace(
		workspace: WorkspaceDefinition,
		originalId?: string
	): Promise<void> {
		const current = this.getCatalog();
		const workspaces = originalId
			? current.workspaces.map(item => item.id === originalId ? workspace : item)
			: [...current.workspaces, workspace];
		const catalog: WorkspaceCatalog = { version: 1, workspaces };
		const validation = validateWorkspaceCatalog(catalog);
		if (!validation.valid) {
			throw new Error(validation.issues.map(issue => issue.message).join(' '));
		}

		await ensureVaultFolder(this.plugin, workspace.rootFolder);
		await this.plugin.replaceWorkspaceCatalog(catalog);
		new Notice(`${originalId ? 'Updated' : 'Created'} Workspace “${workspace.name}”.`);
		this.render();
	}

	private async deleteWorkspace(id: string): Promise<void> {
		const current = this.getCatalog();
		const workspace = current.workspaces.find(item => item.id === id);
		const workspaces = current.workspaces.filter(item => item.id !== id);
		if (workspaces.length === 0) {
			new Notice('At least one Workspace must remain configured.');
			return;
		}
		await this.plugin.replaceWorkspaceCatalog({ version: 1, workspaces });
		new Notice(`Removed Workspace “${workspace?.name ?? id}”. Files were not deleted.`);
		this.render();
	}
}

class WorkspaceEditModal extends Modal {
	private readonly editing: boolean;
	private draft: WorkspaceDefinition;
	private errorEl: HTMLElement | null = null;

	constructor(
		private readonly plugin: CanvasRootsPlugin,
		workspace: WorkspaceDefinition | undefined,
		private readonly onSave: (workspace: WorkspaceDefinition) => Promise<void>
	) {
		super(plugin.app);
		this.editing = !!workspace;
		this.draft = workspace ? cloneWorkspace(workspace) : {
			id: '',
			name: '',
			rootFolder: '',
			mode: 'historical',
			enabledPacks: ['core'],
			folders: undefined
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-workspace-editor');
		contentEl.createEl('h2', { text: this.editing ? 'Edit Workspace' : 'Add Workspace' });

		new Setting(contentEl)
			.setName('Name')
			.setDesc('Display name shown in the Workspace selector.')
			.addText(text => text
				.setValue(this.draft.name)
				.setPlaceholder('中国历史')
				.onChange(value => { this.draft.name = value; }));

		new Setting(contentEl)
			.setName('Workspace ID')
			.setDesc(this.editing
				? 'Stable machine ID. Existing IDs cannot be changed.'
				: 'Stable lowercase machine ID. Leave empty to generate one from the name.')
			.addText(text => {
				text
					.setValue(this.draft.id)
					.setPlaceholder('history-cn')
					.onChange(value => { this.draft.id = value.trim(); });
				if (this.editing) text.setDisabled(true);
			});

		new Setting(contentEl)
			.setName('Root folder')
			.setDesc('Vault-relative folder that owns this dataset. Workspace roots may not overlap.')
			.addText(text => text
				.setValue(this.draft.rootFolder)
				.setPlaceholder('History/Chinese-History')
				.onChange(value => { this.draft.rootFolder = value.trim(); }));

		new Setting(contentEl)
			.setName('Mode')
			.setDesc('Default working context for this Workspace.')
			.addDropdown(dropdown => dropdown
				.addOption('genealogy', 'Genealogy')
				.addOption('historical', 'Historical research')
				.addOption('worldbuilding', 'Worldbuilding')
				.setValue(this.draft.mode)
				.onChange(value => { this.draft.mode = value as WorkspaceMode; }));

		new Setting(contentEl)
			.setName('Ontology packs')
			.setDesc('Comma-separated pack IDs. “core” is always enabled.')
			.addText(text => text
				.setValue(this.draft.enabledPacks.join(', '))
				.setPlaceholder('core, chinese-history')
				.onChange(value => {
					const values = value.split(',').map(item => item.trim()).filter(Boolean);
					this.draft.enabledPacks = Array.from(new Set(['core', ...values]));
				}));

		const folderDetails = contentEl.createEl('details', { cls: 'cr-workspace-editor__folders' });
		folderDetails.createEl('summary', { text: 'Folder overrides (advanced)' });
		folderDetails.createEl('p', {
			text: 'Leave blank to use the default relative folder. Overrides remain inside the Workspace root.',
			cls: 'setting-item-description'
		});
		for (const key of Object.keys(DEFAULT_WORKSPACE_FOLDERS) as WorkspaceFolderKey[]) {
			new Setting(folderDetails)
				.setName(FOLDER_LABELS[key])
				.setDesc(`Default: ${DEFAULT_WORKSPACE_FOLDERS[key]}`)
				.addText(text => text
					.setValue(this.draft.folders?.[key] ?? '')
					.setPlaceholder(DEFAULT_WORKSPACE_FOLDERS[key])
					.onChange(value => this.setFolderOverride(key, value)));
		}

		this.errorEl = contentEl.createDiv({ cls: 'cr-workspace-editor__error setting-item-description' });

		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		const save = buttons.createEl('button', { text: 'Save', cls: 'mod-cta' });
		save.addEventListener('click', () => { void this.save(); });
		const cancel = buttons.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => this.close());
	}

	private setFolderOverride(key: WorkspaceFolderKey, value: string): void {
		const trimmed = value.trim();
		const folders: WorkspaceFolderOverrides = { ...(this.draft.folders ?? {}) };
		if (trimmed) {
			folders[key] = trimmed;
		} else {
			delete folders[key];
		}
		this.draft.folders = Object.keys(folders).length > 0 ? folders : undefined;
	}

	private async save(): Promise<void> {
		try {
			const workspace = cloneWorkspace(this.draft);
			workspace.name = workspace.name.trim();
			workspace.rootFolder = workspace.rootFolder.trim();
			if (!workspace.id) workspace.id = generateWorkspaceId(workspace.name);
			workspace.id = workspace.id.trim();
			workspace.enabledPacks = Array.from(new Set(['core', ...workspace.enabledPacks]));
			await this.onSave(workspace);
			this.close();
		} catch (error) {
			if (this.errorEl) {
				this.errorEl.setText(error instanceof Error ? error.message : String(error));
			}
		}
	}
}

class WorkspaceDeleteConfirmModal extends Modal {
	constructor(
		private readonly plugin: CanvasRootsPlugin,
		private readonly workspace: WorkspaceDefinition,
		private readonly onConfirm: () => Promise<void>
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Remove Workspace?' });
		contentEl.createEl('p', {
			text: `Remove “${this.workspace.name}” from Charted Roots? Its files under ${this.workspace.rootFolder} will not be deleted.`
		});
		const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
		const remove = buttons.createEl('button', { text: 'Remove Workspace', cls: 'mod-warning' });
		remove.addEventListener('click', () => {
			void this.onConfirm().then(() => this.close()).catch(error => {
				new Notice(error instanceof Error ? error.message : String(error));
			});
		});
		const cancel = buttons.createEl('button', { text: 'Cancel' });
		cancel.addEventListener('click', () => this.close());
	}
}
