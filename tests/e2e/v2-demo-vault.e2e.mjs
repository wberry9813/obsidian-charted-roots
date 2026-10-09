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
	assert.equal(initial.active, 'genealogy-demo');
	assert.deepEqual(initial.workspaces, [
		{ id: 'genealogy-demo', name: '林氏家族 · 家谱研究' },
		{ id: 'history-cn-demo', name: '春秋战国 · 历史研究' },
		{ id: 'shushan-demo', name: '蜀山 · 世界观' }
	]);
	assert.ok(initial.people.includes('林晨'));
	assert.ok(initial.people.includes('林国梁'));
	assert.ok(initial.people.includes('林雨'));
	assert.ok(!initial.people.includes('齐桓公'));
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
		await app.plugins.plugins['charted-roots'].setActiveWorkspace('history-cn-demo');
		return true;
	`);
	await session.waitFor(
		`app.plugins.plugins['charted-roots'].getWorkspaceService()?.getActiveId() === 'history-cn-demo'`
	);
	const history = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		return plugin.getWorkspaceService().getScope().getMarkdownFiles()
			.filter(file => file.path.includes('/People/')).map(file => file.basename);
	`);
	assert.ok(history.includes('齐桓公'));
	assert.ok(history.includes('管仲'));
	assert.ok(!history.includes('林晨'));

	await session.evalInApp(`
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
				.find(system => system.id === 'shushan-calendar')?.name,
			dna: plugin.settings.enableDnaTracking
		};
	`);
	assert.ok(fiction.people.includes('李英琼'));
	assert.ok(!fiction.people.includes('齐桓公'));
	assert.ok(!fiction.people.includes('林晨'));
	assert.equal(fiction.calendar, '蜀山纪年');
	assert.equal(fiction.dna, true);

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		await plugin.activateMapView();
		return true;
	`);
	await session.waitFor(`
		(() => {
			const a = app.vault.getAbstractFileByPath('示例/蜀山/Maps/蜀山全图.md');
			const b = app.vault.getAbstractFileByPath('示例/蜀山/Maps/峨眉山区域.md');
			return a?.extension === 'md'
				&& b?.extension === 'md'
				&& app.metadataCache.getFileCache(a)?.frontmatter?.cr_type === 'map'
				&& app.metadataCache.getFileCache(b)?.frontmatter?.cr_type === 'map';
		})()
	`);
	await session.waitFor(`
		[...document.querySelectorAll('select.cr-map-select[aria-label="Select map"] option')]
			.some(option => option.value === 'shushan-world-map')
		&& [...document.querySelectorAll('select.cr-map-select[aria-label="Select map"] option')]
			.some(option => option.value === 'emei-region-map')
	`);
	const showcase = await session.evalInApp(`
		const mapPaths = [
			'示例/蜀山/Maps/蜀山全图.md',
			'示例/蜀山/Maps/峨眉山区域.md'
		];
		const files = mapPaths.map(path => {
			const file = app.vault.getAbstractFileByPath(path);
			const cache = file && file.extension === 'md'
				? app.metadataCache.getFileCache(file)
				: null;
			return {
				path,
				exists: !!file,
				frontmatter: cache?.frontmatter ?? null
			};
		});
		const leaves = app.workspace.getLeavesOfType('canvas-roots-map');
		const view = leaves[0]?.view;
		const controllerMaps = view?.mapController?.getCustomMaps?.().map(map => ({
			id: map.id,
			name: map.name,
			universe: map.universe,
			imagePath: map.imagePath,
			coordinateSystem: map.coordinateSystem
		})) ?? null;
		const mapSelect = document.querySelector(
			'select.cr-map-select[aria-label="Select map"]'
		);
		return {
			files,
			leafCount: leaves.length,
			controllerMaps,
			options: [...(mapSelect?.options ?? [])].map(option => ({
				value: option.value,
				text: option.textContent
			})),
			li: app.vault.getAbstractFileByPath('示例/蜀山/People/李英琼.md') !== null,
			start: app.vault.getAbstractFileByPath('00-开始这里.md') !== null
		};
	`);
	console.log('DEMO_MAP_DIAGNOSTICS', JSON.stringify(showcase));
	assert.equal(showcase.files[0]?.exists, true);
	assert.equal(showcase.files[1]?.exists, true);
	assert.equal(showcase.files[0]?.frontmatter?.cr_type, 'map');
	assert.equal(showcase.files[1]?.frontmatter?.cr_type, 'map');
	assert.ok(showcase.controllerMaps?.some(item =>
		item.id === 'shushan-world-map'
	));
	assert.ok(showcase.controllerMaps?.some(item =>
		item.id === 'emei-region-map'
	));
	assert.ok(showcase.options.some(item =>
		item.value === 'shushan-world-map'
		&& item.text?.includes('蜀山全图')
	));
	assert.ok(showcase.options.some(item =>
		item.value === 'emei-region-map'
		&& item.text?.includes('峨眉山区域')
	));
	assert.equal(showcase.li, true);
	assert.equal(showcase.start, true);
});
