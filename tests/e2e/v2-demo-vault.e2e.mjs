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
			basemap: plugin.settings.geographicBasemapId,
			workspaces: plugin.getWorkspaceService()?.getCatalog().workspaces
				.map(item => ({ id: item.id, name: item.name })),
			people: plugin.getWorkspaceService()?.getScope().getMarkdownFiles()
				.filter(file => file.path.includes('/People/')).map(file => file.basename)
		};
	`);

	assert.equal(initial.language, 'zh-CN');
	assert.equal(initial.active, 'history-cn-demo');
	assert.equal(initial.basemap, 'openstreetmap-standard');
	assert.deepEqual(initial.workspaces, [
		{ id: 'genealogy-demo', name: '林氏家族 · 家谱研究' },
		{ id: 'history-cn-demo', name: '三国·赤壁专题 · 历史研究' },
		{ id: 'shushan-demo', name: '蜀山 · 世界观' }
	]);
	assert.ok(initial.people.includes('曹操'));
	assert.ok(initial.people.includes('刘备'));
	assert.ok(initial.people.includes('孙权'));
	assert.ok(initial.people.includes('周瑜'));
	assert.ok(!initial.people.includes('林晨'));
	assert.ok(!initial.people.includes('李英琼'));

	// Historical raster stack: create temporary Workspace-scoped manifests
	// without shipping fake historical imagery in the user-facing Demo Vault.
	const historyRaster = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const service = plugin.getWorkspaceService();
		const root = service.getActive().rootFolder;
		const folder = root + '/Layers';
		if (!app.vault.getAbstractFileByPath(folder)) {
			await app.vault.createFolder(folder);
		}
		const terrainPath = folder + '/__E2E-Terrain-Raster.md';
		const historicalPath = folder + '/__E2E-Historical-Raster.md';
		const terrain = [
			'---',
			'cr_schema: 2',
			'cr_type: raster_layer',
			'cr_id: e2e-history-terrain',
			'name: E2E Terrain',
			'role: terrain',
			'tile_url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"',
			'attribution: "E2E only"',
			'---',
			'# E2E Terrain'
		].join('\\n');
		const historical = [
			'---',
			'cr_schema: 2',
			'cr_type: raster_layer',
			'cr_id: e2e-history-raster',
			'name: E2E Historical Raster',
			'role: historical',
			'tile_url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"',
			'opacity: 0.6',
			'time_start: "BCE 700"',
			'time_end: "BCE 600"',
			'attribution: "E2E only"',
			'---',
			'# E2E Historical Raster'
		].join('\\n');
		for (const [target, body] of [[terrainPath, terrain], [historicalPath, historical]]) {
			const existing = app.vault.getAbstractFileByPath(target);
			if (existing) await app.vault.delete(existing);
			await app.vault.create(target, body);
		}
		plugin.getTemporalFocusService().clear();
		await plugin.activateMapView();
		const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
		if (!view?.refreshHistoricalRasterLayers) {
			throw new Error('Historical raster runtime is unavailable.');
		}
		await view.refreshHistoricalRasterLayers();
		return { terrainPath, historicalPath };
	`);
	await session.waitFor(`
		app.metadataCache.getCache('${historyRaster.terrainPath}')?.frontmatter?.cr_type === 'raster_layer'
		&& app.metadataCache.getCache('${historyRaster.historicalPath}')?.frontmatter?.cr_type === 'raster_layer'
	`);
	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
		await view.refreshHistoricalRasterLayers();
		return true;
	`);
	await session.waitFor(`
		(() => {
			const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
			const ids = (view?.mapContainerEl?.dataset?.rasterLayerActiveIds ?? '')
				.split(',').filter(Boolean);
			return ids.length === 1 && ids.includes('e2e-history-terrain')
				&& view?.mapContainerEl?.dataset?.rasterLayerPossibleCount === '0';
		})()
	`);
	const rasterWithoutFocus = await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
		return {
			active: view.mapContainerEl.dataset.rasterLayerActiveIds,
			possible: view.mapContainerEl.dataset.rasterLayerPossibleIds,
			issues: view.mapContainerEl.dataset.rasterLayerIssueCount
		};
	`);
	assert.equal(rasterWithoutFocus.active, 'e2e-history-terrain');
	assert.equal(rasterWithoutFocus.possible, '');
	assert.equal(rasterWithoutFocus.issues, '0');

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const calendar = plugin.getHistoricalDateService().getCalendarProvider('tyme');
		if (!calendar) throw new Error('Historical calendar unavailable.');
		plugin.getTemporalFocusService().setPoint(
			calendar.solarToJulianDay({ year: -649, month: 6, day: 1 }),
			'e2e-raster'
		);
		return true;
	`);
	await session.waitFor(`
		(() => {
			const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
			const ids = (view?.mapContainerEl?.dataset?.rasterLayerActiveIds ?? '')
				.split(',').filter(Boolean);
			return ids.includes('e2e-history-terrain')
				&& ids.includes('e2e-history-raster')
				&& ids.length === 2;
		})()
	`);

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
		await app.plugins.plugins['charted-roots'].setActiveWorkspace('genealogy-demo');
		return true;
	`);
	await session.waitFor(
		`app.plugins.plugins['charted-roots'].getWorkspaceService()?.getActiveId() === 'genealogy-demo'`
	);
	const genealogy = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		return plugin.getWorkspaceService().getScope().getMarkdownFiles()
			.filter(file => file.path.includes('/People/')).map(file => file.basename);
	`);
	assert.ok(genealogy.includes('林晨'));
	assert.ok(genealogy.includes('林国梁'));
	assert.ok(!genealogy.includes('曹操'));
	await session.waitFor(`
		app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view
			?.mapContainerEl?.dataset?.rasterLayerActiveCount === '0'
	`);

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
	assert.ok(!fiction.people.includes('曹操'));
	assert.ok(!fiction.people.includes('林晨'));
	assert.equal(fiction.calendar, '蜀山纪年');
	assert.equal(fiction.dna, true);

	const shushanRasterPath = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const root = plugin.getWorkspaceService().getActive().rootFolder;
		const folder = root + '/Layers';
		if (!app.vault.getAbstractFileByPath(folder)) {
			await app.vault.createFolder(folder);
		}
		const target = folder + '/__E2E-Shushan-Terrain.md';
		const existing = app.vault.getAbstractFileByPath(target);
		if (existing) await app.vault.delete(existing);
		await app.vault.create(target, [
			'---',
			'cr_schema: 2',
			'cr_type: raster_layer',
			'cr_id: e2e-shushan-terrain',
			'name: E2E Shushan Terrain',
			'role: terrain',
			'tile_url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png"',
			'attribution: "E2E only"',
			'---',
			'# E2E Shushan Terrain'
		].join('\\n'));
		plugin.getTemporalFocusService().clear();
		await plugin.activateMapView();
		return target;
	`);
	await session.waitFor(
		`app.metadataCache.getCache('${shushanRasterPath}')?.frontmatter?.cr_type === 'raster_layer'`
	);
	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
		await view.refreshHistoricalRasterLayers();
		return true;
	`);
	await session.waitFor(`
		app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view
			?.mapContainerEl?.dataset?.rasterLayerActiveIds === 'e2e-shushan-terrain'
	`);

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
			return { path, exists: !!file, frontmatter: cache?.frontmatter ?? null };
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
			controllerMaps,
			options: [...(mapSelect?.options ?? [])].map(option => ({
				value: option.value,
				text: option.textContent
			})),
			li: app.vault.getAbstractFileByPath('示例/蜀山/People/李英琼.md') !== null,
			start: app.vault.getAbstractFileByPath('00-开始这里.md') !== null
		};
	`);
	assert.equal(showcase.files[0]?.frontmatter?.cr_type, 'map');
	assert.equal(showcase.files[1]?.frontmatter?.cr_type, 'map');
	assert.ok(showcase.controllerMaps?.some(item => item.id === 'shushan-world-map'));
	assert.ok(showcase.controllerMaps?.some(item => item.id === 'emei-region-map'));
	assert.ok(showcase.options.some(item =>
		item.value === 'shushan-world-map' && item.text?.includes('蜀山全图')
	));
	assert.ok(showcase.options.some(item =>
		item.value === 'emei-region-map' && item.text?.includes('峨眉山区域')
	));
	assert.equal(showcase.li, true);
	assert.equal(showcase.start, true);

	// Switching the real-world Map to a custom image map must remove all
	// geographic historical rasters rather than leaking them across CRSs.
	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
		await view.mapController.setActiveMap('shushan-world-map');
		return true;
	`);
	await session.waitFor(`
		(() => {
			const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
			return view?.mapController?.getActiveMapId?.() === 'shushan-world-map'
				&& view?.mapContainerEl?.dataset?.rasterLayerActiveCount === '0';
		})()
	`);

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().clear();
		for (const target of [
			'${historyRaster.terrainPath}',
			'${historyRaster.historicalPath}',
			'${shushanRasterPath}'
		]) {
			const file = app.vault.getAbstractFileByPath(target);
			if (file) await app.vault.delete(file);
		}
		return true;
	`);
});
