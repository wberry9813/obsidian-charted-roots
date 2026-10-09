import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchObsidian } from './obsidian-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.resolve(HERE, '../../dist/Charted-Roots-Demo-Vault');

test('ready-to-open zh-CN demo vault boots with initialized Workspaces', async (t) => {
	const session = await launchObsidian({ vault: VAULT });
	t.after(async () => session.close());

	const initial = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		return {
			language: plugin.settings.uiLanguage,
			active: plugin.getWorkspaceService()?.getActiveId(),
			workspaces: plugin.getWorkspaceService()?.getCatalog().workspaces
				.map(item => ({ id: item.id, name: item.name })),
			people: plugin.getWorkspaceService()?.getScope().getMarkdownFiles()
				.filter(file => file.path.includes('/People/')).map(file => file.basename)
		};
	`);

	assert.equal(initial.language, 'zh-CN');
	assert.equal(initial.active, 'history-cn-demo');
	assert.deepEqual(initial.workspaces, [
		{ id: 'history-cn-demo', name: '春秋战国 · 历史研究' },
		{ id: 'shushan-demo', name: '蜀山 · 世界观' }
	]);
	assert.ok(initial.people.includes('齐桓公'));
	assert.ok(initial.people.includes('管仲'));
	assert.ok(!initial.people.includes('李英琼'));

	await session.evalInApp(`
		const opened = app.commands.executeCommandById('charted-roots:manage-workspaces');
		if (!opened) throw new Error('Manage Workspaces command missing');
		return true;
	`);
	await session.waitFor(
		`document.querySelector('.cr-workspace-manager__title')?.textContent === '管理工作区'`
	);

	const localized = await session.evalInApp(`
		return {
			title: document.querySelector('.cr-workspace-manager__title')?.textContent,
			manageButtons: [...document.querySelectorAll('.cr-workspace-manager button')]
				.map(button => button.textContent)
		};
	`);
	assert.equal(localized.title, '管理工作区');
	assert.ok(localized.manageButtons.includes('添加工作区'));
	assert.ok(localized.manageButtons.includes('关闭'));

	await session.evalInApp(`
		document.querySelector('.cr-workspace-manager .modal-button-container button:last-child')?.click();
		await app.plugins.plugins['charted-roots'].setActiveWorkspace('shushan-demo');
		return true;
	`);
	await session.waitFor(
		`app.plugins.plugins['charted-roots'].getWorkspaceService()?.getActiveId() === 'shushan-demo'`
	);
	const fiction = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		return {
			people: plugin.getWorkspaceService().getScope().getMarkdownFiles()
				.filter(file => file.path.includes('/People/')).map(file => file.basename),
			calendar: plugin.settings.fictionalDateSystems
				.find(system => system.id === 'shushan-calendar')?.name
		};
	`);
	assert.ok(fiction.people.includes('李英琼'));
	assert.ok(!fiction.people.includes('齐桓公'));
	assert.equal(fiction.calendar, '蜀山纪年');
});
