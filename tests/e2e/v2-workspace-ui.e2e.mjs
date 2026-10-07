import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchObsidian } from './obsidian-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.join(HERE, 'vault');
const ARTIFACTS = path.join(HERE, 'artifacts');

const CATALOG = {
	version: 1,
	workspaces: [
		{
			id: 'history-cn',
			name: '中国历史',
			rootFolder: 'Workspace-E2E/History',
			mode: 'historical',
			enabledPacks: ['core', 'chinese-history']
		},
		{
			id: 'shushan',
			name: '蜀山',
			rootFolder: 'Workspace-E2E/Shushan',
			mode: 'worldbuilding',
			enabledPacks: ['core']
		}
	]
};

test('Workspace manager, Control Center selector and global identity work in real Obsidian', async (t) => {
	await mkdir(ARTIFACTS, { recursive: true });
	const session = await launchObsidian({ vault: VAULT });
	t.after(async () => session.close());

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		await plugin.replaceWorkspaceCatalog(${JSON.stringify(CATALOG)});
		await plugin.setActiveWorkspace('history-cn');
		return true;
	`);

	// Command entry opens the user-facing manager.
	await session.evalInApp(`
		const opened = app.commands.executeCommandById('charted-roots:manage-workspaces');
		if (!opened) throw new Error('Manage Workspaces command was not registered.');
		return true;
	`);
	await session.waitFor(`document.querySelector('.cr-workspace-manager__title')?.textContent === 'Manage Workspaces'`);

	let manager = await session.evalInApp(`
		const root = document.querySelector('.cr-workspace-manager');
		const select = root?.querySelector('select.dropdown');
		return {
			title: root?.querySelector('.cr-workspace-manager__title')?.textContent ?? null,
			options: [...(select?.options ?? [])].map(option => ({
				value: option.value,
				text: option.textContent
			})),
			active: select?.value ?? null,
			cards: [...(root?.querySelectorAll('.cr-workspace-card strong') ?? [])]
				.map(el => el.textContent ?? '')
		};
	`);
	assert.equal(manager.title, 'Manage Workspaces');
	assert.deepEqual(manager.options, [
		{ value: 'history-cn', text: '中国历史' },
		{ value: 'shushan', text: '蜀山' }
	]);
	assert.equal(manager.active, 'history-cn');
	assert.deepEqual(manager.cards, ['中国历史', '蜀山']);

	// Switching through the manager changes local active state without rewriting
	// the persisted Workspace catalog.
	await session.evalInApp(`
		const select = document.querySelector('.cr-workspace-manager select.dropdown');
		select.value = 'shushan';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);
	await session.waitFor(`
		app.plugins.plugins['charted-roots'].getWorkspaceService()?.getActiveId() === 'shushan'
		&& app.plugins.plugins['charted-roots'].settings.activeWorkspaceId === 'shushan'
	`);

	await session.evalInApp(`
		const close = [...document.querySelectorAll('.cr-workspace-manager button')]
			.find(button => button.textContent === 'Close');
		close?.click();
		return true;
	`);
	await session.waitFor(`!document.querySelector('.cr-workspace-manager')`);

	// Control Center carries the same active Workspace selector in its header.
	await session.evalInApp(`
		const opened = app.commands.executeCommandById('charted-roots:open-control-center');
		if (!opened) throw new Error('Control Center command was not registered.');
		return true;
	`);
	await session.waitFor(`document.querySelector('.crc-workspace-selector')?.value === 'shushan'`);

	const control = await session.evalInApp(`
		const select = document.querySelector('.crc-workspace-selector');
		return {
			active: select?.value ?? null,
			options: [...(select?.options ?? [])].map(option => option.textContent),
			manage: document.querySelector('.cr-workspace-manage-button')?.textContent ?? null
		};
	`);
	assert.deepEqual(control, {
		active: 'shushan',
		options: ['中国历史', '蜀山'],
		manage: 'Manage Workspaces'
	});

	await session.evalInApp(`
		const select = document.querySelector('.crc-workspace-selector');
		select.value = 'history-cn';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);
	await session.waitFor(`
		app.plugins.plugins['charted-roots'].getWorkspaceService()?.getActiveId() === 'history-cn'
		&& document.querySelector('.crc-workspace-selector')?.value === 'history-cn'
	`);

	// Close Control Center before exercising nested CRUD modals.
	await session.evalInApp(`
		document.querySelector('.crc-control-center-modal')
			?.closest('.modal-container')
			?.querySelector('.modal-close-button')
			?.click();
		return true;
	`);

	await session.evalInApp(`
		app.commands.executeCommandById('charted-roots:manage-workspaces');
		return true;
	`);
	await session.waitFor(`document.querySelector('.cr-workspace-manager__add')`);

	// Add a third Workspace through the actual modal form.
	await session.evalInApp(`
		document.querySelector('.cr-workspace-manager__add')?.click();
		return true;
	`);
	await session.waitFor(`document.querySelector('.cr-workspace-editor')`);
	await session.evalInApp(`
		const root = document.querySelector('.cr-workspace-editor');
		const setText = (label, value) => {
			const row = [...root.querySelectorAll('.setting-item')]
				.find(item => item.querySelector('.setting-item-name')?.textContent === label);
			const input = row?.querySelector('input');
			if (!input) throw new Error('Missing Workspace field: ' + label);
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		};
		setText('Name', 'Novel B');
		setText('Workspace ID', 'novel-b');
		setText('Root folder', 'Workspace-E2E/Novel-B');
		const save = [...root.querySelectorAll('button')]
			.find(button => button.textContent === 'Save');
		save?.click();
		return true;
	`);
	await session.waitFor(`
		app.plugins.plugins['charted-roots'].getWorkspaceService()
			?.getCatalog().workspaces.some(workspace => workspace.id === 'novel-b')
	`);

	let crud = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const workspace = plugin.getWorkspaceService().getCatalog().workspaces
			.find(item => item.id === 'novel-b');
		return {
			workspace,
			rootExists: await app.vault.adapter.exists('Workspace-E2E/Novel-B')
		};
	`);
	assert.equal(crud.workspace.name, 'Novel B');
	assert.equal(crud.workspace.mode, 'historical');
	assert.deepEqual(crud.workspace.enabledPacks, ['core']);
	assert.equal(crud.rootExists, true);

	// Edit it through the card action.
	await session.evalInApp(`
		const card = [...document.querySelectorAll('.cr-workspace-card')]
			.find(item => item.querySelector('strong')?.textContent === 'Novel B');
		const edit = [...(card?.querySelectorAll('button') ?? [])]
			.find(button => button.textContent === 'Edit');
		edit?.click();
		return true;
	`);
	await session.waitFor(`document.querySelector('.cr-workspace-editor')`);
	await session.evalInApp(`
		const root = document.querySelector('.cr-workspace-editor');
		const row = [...root.querySelectorAll('.setting-item')]
			.find(item => item.querySelector('.setting-item-name')?.textContent === 'Name');
		const input = row?.querySelector('input');
		input.value = 'Novel B Revised';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		const save = [...root.querySelectorAll('button')]
			.find(button => button.textContent === 'Save');
		save?.click();
		return true;
	`);
	await session.waitFor(`
		app.plugins.plugins['charted-roots'].getWorkspaceService()
			?.getCatalog().workspaces.find(workspace => workspace.id === 'novel-b')?.name === 'Novel B Revised'
	`);

	// Delete only the Workspace definition. The root folder must remain.
	await session.evalInApp(`
		const card = [...document.querySelectorAll('.cr-workspace-card')]
			.find(item => item.querySelector('strong')?.textContent === 'Novel B Revised');
		const remove = [...(card?.querySelectorAll('button') ?? [])]
			.find(button => button.textContent === 'Delete');
		remove?.click();
		return true;
	`);
	await session.waitFor(`
		[...document.querySelectorAll('.modal h2')]
			.some(el => el.textContent === 'Remove Workspace?')
	`);
	await session.evalInApp(`
		const modal = [...document.querySelectorAll('.modal')]
			.find(item => item.querySelector('h2')?.textContent === 'Remove Workspace?');
		const confirm = [...(modal?.querySelectorAll('button') ?? [])]
			.find(button => button.textContent === 'Remove Workspace');
		confirm?.click();
		return true;
	`);
	await session.waitFor(`
		!app.plugins.plugins['charted-roots'].getWorkspaceService()
			?.getCatalog().workspaces.some(workspace => workspace.id === 'novel-b')
	`);
	crud = await session.evalInApp(`
		return {
			rootStillExists: await app.vault.adapter.exists('Workspace-E2E/Novel-B'),
			active: app.plugins.plugins['charted-roots'].getWorkspaceService().getActiveId()
		};
	`);
	assert.equal(crud.rootStillExists, true);
	assert.equal(crud.active, 'history-cn');

	// Workspace is a query boundary, not an ID namespace. Duplicating cr_id
	// across two Workspace roots must still fail the vault-global v2 linter.
	const identity = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const historyPath = 'Workspace-E2E/History/People/Global-Duplicate-History.md';
		const fictionPath = 'Workspace-E2E/Shushan/People/Global-Duplicate-Fiction.md';
		const body = '---\\ncr_schema: 2\\ncr_type: person\\ncr_id: workspace-global-duplicate\\nname: Duplicate\\n---\\n';
		const historyFile = await app.vault.create(historyPath, body);
		const fictionFile = await app.vault.create(fictionPath, body);
		try {
			await new Promise(resolve => setTimeout(resolve, 500));
			const issues = plugin.getV2Linter().lint()
				.filter(issue => issue.code === 'duplicate_cr_id' && issue.crId === 'workspace-global-duplicate');
			return {
				count: issues.length,
				paths: issues.map(issue => issue.filePath),
				historyVisibleInActiveScope: plugin.getWorkspaceService().getScope()
					.getMarkdownFiles().some(file => file.path === historyPath),
				fictionVisibleInActiveScope: plugin.getWorkspaceService().getScope()
					.getMarkdownFiles().some(file => file.path === fictionPath)
			};
		} finally {
			await app.vault.delete(historyFile);
			await app.vault.delete(fictionFile);
		}
	`);
	assert.equal(identity.count, 1);
	assert.equal(identity.historyVisibleInActiveScope, true);
	assert.equal(identity.fictionVisibleInActiveScope, false);
	assert.equal(identity.paths.length, 1);

	await session.screenshot(path.join(ARTIFACTS, 'v2-workspace-ui.png'));
});
