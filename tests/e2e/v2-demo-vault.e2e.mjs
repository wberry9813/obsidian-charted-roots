import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { launchObsidian } from './obsidian-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.resolve(HERE, '../../dist/Charted-Roots-Demo-Vault');
const ARTIFACTS = path.resolve(HERE, 'artifacts');

test('ready-to-open zh-CN demo vault boots with initialized Workspaces', async (t) => {
	await mkdir(ARTIFACTS, { recursive: true });
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
	assert.ok(initial.people.includes('曹嵩'));
	assert.ok(initial.people.includes('荀彧'));
	assert.ok(initial.people.includes('郭嘉'));
	assert.ok(!initial.people.includes('林晨'));
	assert.ok(!initial.people.includes('李英琼'));

	// Permanent Historical Family Chart showcase: the demo vault itself must
	// visibly demonstrate structural genealogy + time-varying Historical lanes.
	const historicalPoints = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const calendar = plugin.getHistoricalDateService().getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar unavailable in demo vault');
		const point197 = calendar.solarToJulianDay({ year: 197, month: 6, day: 1 });
		const point201 = calendar.solarToJulianDay({ year: 201, month: 6, day: 1 });
		const point208 = calendar.solarToJulianDay({ year: 208, month: 6, day: 1 });
		// Do not seed TemporalFocus through the internal API here. The user-facing
		// Historical time control below must establish the 197 CE focus itself.
		// Deliberately open on Cao Song first. The user-facing search flow below
		// must promote Cao Cao to the actual persisted/semantic root before
		// Historical expansion runs.
		await plugin.activateFamilyChartView('demo-3k-caosong', true, true);
		return { point197, point201, point208 };
	`);

	await session.waitFor(`
		(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			return !!root
				&& root.querySelectorAll('.card_cont').length >= 2
				&& !!root.querySelector('.cr-fcv-mode-select');
		})()
	`);

	// Reproduce the real manual path: use the Family Chart search button to
	// move from the initially-opened Cao Song to Cao Cao. Before the production
	// fix this only changed f3's visual main person; rootPersonId remained Cao
	// Song, so Historical mode later expanded from the wrong person.
	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const search = root?.querySelector('button[aria-label="Search for person"]');
		if (!(search instanceof HTMLButtonElement)) throw new Error('Family Chart search button missing');
		search.click();
		return true;
	`);
	await session.waitFor(
		`document.querySelector('.crc-person-picker-modal input[placeholder="Search by name..."]') instanceof HTMLInputElement`
	);
	await session.evalInApp(`
		const input = document.querySelector('.crc-person-picker-modal input[placeholder="Search by name..."]');
		if (!(input instanceof HTMLInputElement)) throw new Error('Person search input missing');
		input.value = '曹操';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		return true;
	`);
	await session.waitFor(`
		[...document.querySelectorAll('.crc-person-picker-modal .crc-picker-item')]
			.some(card => card.querySelector('.crc-picker-item__name')?.textContent?.trim() === '曹操')
	`);
	await session.evalInApp(`
		const card = [...document.querySelectorAll('.crc-person-picker-modal .crc-picker-item')]
			.find(item => item.querySelector('.crc-picker-item__name')?.textContent?.trim() === '曹操');
		if (!(card instanceof HTMLElement)) throw new Error('Cao Cao search result missing');
		card.click();
		return true;
	`);
	await session.waitFor(`
		!document.querySelector('.crc-person-picker-modal')
			&& app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.getState?.().rootPersonId === 'demo-3k-caocao'
	`);

	// Reproduce the startup/index race seen in a real user vault: a materialized
	// Assertion cache may have been built before Obsidian finished indexing the
	// permanent demo Assertion notes. Historical redraw must recover from that
	// stale empty snapshot on its own.
	const poisonedAssertionCache = await session.evalInApp(`
		const service = app.plugins.plugins['charted-roots'].getAssertionService();
		service.cache = {
			valid: [],
			invalid: [],
			bySubject: new Map(),
			byObject: new Map(),
			byPredicate: new Map(),
			byAssertionType: new Map()
		};
		return service.getAll().length;
	`);
	assert.equal(poisonedAssertionCache, 0,
		'test precondition: materialized Assertion cache should be stale and empty');

	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const mode = root?.querySelector('.cr-fcv-mode-select');
		if (!(mode instanceof HTMLSelectElement)) throw new Error('Historical mode selector missing');
		mode.value = 'historical';
		mode.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);

	await session.waitFor(`
		(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			return root?.querySelector('.cr-fcv-mode-select')?.value === 'historical'
				&& root.querySelectorAll('.cr-fcv-historical-depth-btn').length === 4
				&& root.querySelector('.cr-fcv-historical-focus-input') instanceof HTMLInputElement
				&& !root.querySelector('.cr-fcv-as-of-date');
		})()
	`);

	// Set the shared Historical focus through the same visible control a user
	// has in Family Chart. This replaces the old test-only internal setPoint().
	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const input = root?.querySelector('.cr-fcv-historical-focus-input');
		if (!(input instanceof HTMLInputElement)) throw new Error('Historical focus input missing');
		input.value = '197 CE';
		input.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);
	await session.waitFor(`
		(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const focus = app.plugins.plugins['charted-roots'].getTemporalFocusService().get();
			return root?.querySelector('.cr-fcv-historical-focus')?.textContent?.includes('197 CE')
				&& focus?.source === 'historical-family-chart';
		})()
	`);

	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const depth = root?.querySelector('.cr-fcv-historical-depth-btn[data-depth="2"]');
		if (!(depth instanceof HTMLButtonElement)) throw new Error('Historical depth 2 control missing');
		depth.click();
		return true;
	`);

	await session.waitFor(`
		(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			if (!root) return false;
			const structural = [...root.querySelectorAll('.card_cont')]
				.map(card => card.__data__?.data?.id).filter(Boolean);
			const focus = root.querySelector('.cr-fcv-historical-focus');
			return structural.includes('demo-3k-caocao')
				&& structural.includes('demo-3k-caosong')
				&& !!root.querySelector('.cr-fcv-historical-person-card[data-cr-id="demo-3k-xunyu"][data-depth="1"]')
				&& !!root.querySelector('.cr-fcv-historical-person-card[data-cr-id="demo-3k-guojia"][data-depth="2"]')
				&& !!root.querySelector('.cr-relationship-overlay-line--ally_of[data-source-cr-id="demo-3k-caocao"][data-target-cr-id="demo-3k-xunyu"]')
				&& !!root.querySelector('.cr-relationship-overlay-line--recommends[data-source-cr-id="demo-3k-xunyu"][data-target-cr-id="demo-3k-guojia"]')
				&& root.querySelectorAll('.cr-fcv-historical-direction-arrow[data-source-cr-id="demo-3k-xunyu"][data-target-cr-id="demo-3k-guojia"]').length === 1
				&& !!root.querySelector('.cr-fcv-historical-edge-label[data-predicate="recommends"]')?.textContent?.trim()
				&& focus?.textContent?.includes('197 CE');
		})()
	`);
	await session.waitFor(`
		(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const svg = root?.querySelector('svg.main_svg');
			if (!root || !svg) return false;
			const viewport = svg.getBoundingClientRect();
			const structuralById = id => [...root.querySelectorAll('.card_cont')]
				.find(card => card.__data__?.data?.id === id);
			const cards = [
				structuralById('demo-3k-caosong'),
				structuralById('demo-3k-caocao'),
				root.querySelector('.cr-fcv-historical-person-card[data-cr-id="demo-3k-xunyu"]'),
				root.querySelector('.cr-fcv-historical-person-card[data-cr-id="demo-3k-guojia"]')
			];
			return cards.every(card => {
				if (!card) return false;
				const r = card.getBoundingClientRect();
				return r.width > 0 && r.height > 0
					&& r.left >= viewport.left - 8
					&& r.right <= viewport.right + 8
					&& r.top >= viewport.top - 8
					&& r.bottom <= viewport.bottom + 8;
			});
		})()
	`, { timeout: 15000, interval: 100 });
	await session.screenshot(path.join(ARTIFACTS, 'demo-historical-family-chart-197.png'));

	await session.evalInApp(`
		app.plugins.plugins['charted-roots'].getTemporalFocusService().setPoint(
			${JSON.stringify(historicalPoints.point201)},
			'demo-family-chart-201'
		);
		return true;
	`);
	await session.waitFor(`
		(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			if (!root) return false;
			const structural = [...root.querySelectorAll('.card_cont')]
				.map(card => card.__data__?.data?.id).filter(Boolean);
			return structural.includes('demo-3k-caocao')
				&& structural.includes('demo-3k-caosong')
				&& !root.querySelector('.cr-fcv-historical-person-card[data-cr-id="demo-3k-xunyu"]')
				&& !root.querySelector('.cr-fcv-historical-person-card[data-cr-id="demo-3k-guojia"]')
				&& root.querySelector('.cr-fcv-historical-focus')?.textContent?.includes('201 CE');
		})()
	`);
	await session.waitFor(`
		(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const svg = root?.querySelector('svg.main_svg');
			if (!root || !svg) return false;
			const viewport = svg.getBoundingClientRect();
			const cards = [...root.querySelectorAll('.card_cont')].filter(card =>
				['demo-3k-caosong', 'demo-3k-caocao'].includes(card.__data__?.data?.id)
			);
			return cards.length === 2 && cards.every(card => {
				const r = card.getBoundingClientRect();
				return r.width > 0 && r.height > 0
					&& r.left >= viewport.left - 8
					&& r.right <= viewport.right + 8
					&& r.top >= viewport.top - 8
					&& r.bottom <= viewport.bottom + 8;
			});
		})()
	`, { timeout: 15000, interval: 100 });
	await session.screenshot(path.join(ARTIFACTS, 'demo-historical-family-chart-201.png'));

	await session.evalInApp(`
		app.plugins.plugins['charted-roots'].getTemporalFocusService().setPoint(
			${JSON.stringify(historicalPoints.point208)},
			'demo-family-chart-208'
		);
		return true;
	`);
	await session.waitFor(`
		(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const state = root?.querySelector('.cr-fcv-historical-card-state[data-cr-id="demo-3k-caocao"]');
			const office = state?.querySelector('.cr-fcv-historical-card-state__row[data-kind="office_holding"][data-state="active"] text');
			const affiliation = state?.querySelector('.cr-fcv-historical-card-state__row[data-kind="affiliation"][data-state="active"] text');
			return office?.textContent?.includes('丞相')
				&& affiliation?.textContent?.includes('汉朝廷')
				&& state?.getAttribute('data-possible-count') === '1'
				&& root?.querySelector('.cr-fcv-historical-focus')?.textContent?.includes('208 CE');
		})()
	`);
	await session.waitFor(`
		(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const svg = root?.querySelector('svg.main_svg');
			if (!root || !svg) return false;
			const viewport = svg.getBoundingClientRect();
			const cao = [...root.querySelectorAll('.card_cont')]
				.find(card => card.__data__?.data?.id === 'demo-3k-caocao');
			if (!cao) return false;
			const r = cao.getBoundingClientRect();
			return r.width > 0 && r.height > 0
				&& r.left >= viewport.left - 8
				&& r.right <= viewport.right + 8
				&& r.top >= viewport.top - 8
				&& r.bottom <= viewport.bottom + 8;
		})()
	`, { timeout: 15000, interval: 100 });
	await session.screenshot(path.join(ARTIFACTS, 'demo-historical-family-chart-208.png'));

	await session.evalInApp(`
		app.plugins.plugins['charted-roots'].getTemporalFocusService().clear();
		for (const leaf of app.workspace.getLeavesOfType('canvas-roots-family-chart')) leaf.detach();
		return true;
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
});
