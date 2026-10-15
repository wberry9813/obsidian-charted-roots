import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchObsidian } from './obsidian-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.join(HERE, 'vault');
const ARTIFACTS = path.join(HERE, 'artifacts');

test('Historical Family Chart follows shared Timeline focus in real Obsidian', async (t) => {
	await mkdir(ARTIFACTS, { recursive: true });
	const session = await launchObsidian({ vault: VAULT });
	t.after(async () => session.close());

	await session.waitFor(
		`app.metadataCache.getCache('Charted Roots/People/Cao-Cao.md')?.frontmatter?.cr_id === 'person-cao-cao'
			&& app.metadataCache.getCache('Charted Roots/People/Cao-Song.md')?.frontmatter?.cr_id === 'person-cao-song'`
	);

	const setup = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		if (!plugin) throw new Error('Charted Roots plugin is unavailable.');
		const workspace = plugin.getWorkspaceService();
		if (!workspace) throw new Error('Workspace service is unavailable.');
		if (workspace.getActive().rootFolder !== 'Charted Roots') {
			throw new Error(
				'Historical Family Chart E2E requires the pristine default Workspace, got: '
				+ workspace.getActive().rootFolder
			);
		}

		const registry = plugin.getV2OntologyRegistry();
		for (const predicate of ['ally_of', 'political_rival']) {
			if (!registry.hasPredicate(predicate)) {
				throw new Error('Historical predicate is unavailable: ' + predicate);
			}
		}

		const assertionService = plugin.getAssertionService();
		const created = [];
		try {
			created.push(await assertionService.createAssertion({
				assertionType: 'relationship',
				subject: '[[Charted Roots/People/Cao-Cao|曹操]]',
				predicate: 'ally_of',
				object: '[[Charted Roots/People/Cao-Song|曹嵩]]',
				timeStart: '196 CE',
				timeEnd: '199 CE',
				timeStartPrecision: 'year',
				timeEndPrecision: 'year',
				timeStartCertainty: 'certain',
				timeEndCertainty: 'certain',
				notes: 'E2E historical Family Chart focus fixture',
				title: '曹操与曹嵩同盟 E2E'
			}, { folder: 'Charted Roots/Assertions' }));
			created.push(await assertionService.createAssertion({
				assertionType: 'relationship',
				subject: '[[Charted Roots/People/Cao-Cao|曹操]]',
				predicate: 'political_rival',
				object: '[[Charted Roots/People/Cao-Song|曹嵩]]',
				timeStart: '200 CE',
				timeEnd: '202 CE',
				timeStartPrecision: 'year',
				timeEndPrecision: 'year',
				timeStartCertainty: 'certain',
				timeEndCertainty: 'certain',
				notes: 'E2E historical Family Chart focus fixture',
				title: '曹操与曹嵩政治竞争 E2E'
			}, { folder: 'Charted Roots/Assertions' }));
		} catch (error) {
			for (const file of created) {
				const current = app.vault.getAbstractFileByPath(file.path);
				if (current) await app.vault.delete(current);
			}
			throw error;
		}

		const calendar = plugin.getHistoricalDateService().getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme historical calendar is unavailable.');
		const point197 = calendar.solarToJulianDay({ year: 197, month: 6, day: 1 });
		const point201 = calendar.solarToJulianDay({ year: 201, month: 6, day: 1 });

		plugin.getTemporalFocusService().setPoint(point197, 'e2e-family-chart');
		await plugin.activateFamilyChartView('person-cao-cao', true, true);

		return {
			allyPath: created[0].path,
			rivalPath: created[1].path,
			point197,
			point201
		};
	`);

	await session.waitFor(
		'app.metadataCache.getCache(' + JSON.stringify(setup.allyPath)
			+ ')?.frontmatter?.predicate === "ally_of"'
			+ ' && app.metadataCache.getCache(' + JSON.stringify(setup.rivalPath)
			+ ')?.frontmatter?.predicate === "political_rival"'
	);

	await session.waitFor(
		`(() => {
			const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
			return !!view
				&& view.containerEl.querySelectorAll('.card_cont').length >= 2
				&& !!view.containerEl.querySelector('.cr-fcv-mode-select');
		})()`
	);

	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		const select = view?.containerEl.querySelector('.cr-fcv-mode-select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Family Chart mode selector is unavailable.');
		}
		select.value = 'historical';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const focus = root?.querySelector('.cr-fcv-historical-focus');
			return focus?.dataset.focusAxis === 'julian_day'
				&& focus?.dataset.focusSource === 'e2e-family-chart'
				&& focus?.textContent?.includes('197 CE')
				&& !!root?.querySelector('.cr-relationship-overlay-line--ally_of')
				&& !root?.querySelector('.cr-relationship-overlay-line--political_rival');
		})()`
	);

	const at197 = await session.evalInApp(`
		const sample = () => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const focus = root?.querySelector('.cr-fcv-historical-focus');
			return {
				label: focus?.textContent ?? null,
				axis: focus?.dataset.focusAxis ?? null,
				source: focus?.dataset.focusSource ?? null,
				ally: !!root?.querySelector('.cr-relationship-overlay-line--ally_of'),
				rival: !!root?.querySelector('.cr-relationship-overlay-line--political_rival'),
				allyLabel: root?.querySelector('.cr-fcv-historical-edge-label[data-predicate="ally_of"]')
					?.textContent?.trim() ?? ''
			};
		};
		let stable = 0;
		let previous = '';
		let current = sample();
		for (let frame = 0; frame < 60; frame++) {
			await new Promise(resolve => requestAnimationFrame(resolve));
			current = sample();
			const key = JSON.stringify(current);
			stable = key === previous ? stable + 1 : 0;
			previous = key;
			if (stable >= 4 && current.ally && !current.rival && current.allyLabel) break;
		}
		return current;
	`);
	assert.match(at197.label ?? '', /197 CE/);
	assert.equal(at197.axis, 'julian_day');
	assert.equal(at197.source, 'e2e-family-chart');
	assert.equal(at197.ally, true);
	assert.equal(at197.rival, false);
	assert.ok(at197.allyLabel, 'active historical relation should keep a persistent label');
	// At 197 CE only the active ally edge may be visible, and no stale
	// arrows should survive from the previous temporal projection.
	const arrows197 = await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return [...root.querySelectorAll('.cr-fcv-historical-direction-arrow')].map(el => ({
			source: el.dataset.sourceCrId, target: el.dataset.targetCrId
		}));
	`);
	assert.deepEqual(arrows197, [], 'symmetric active ally has no arrow');

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().setPoint(
			${JSON.stringify(setup.point201)},
			'map-time-slider'
		);
		return true;
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const focus = root?.querySelector('.cr-fcv-historical-focus');
			return focus?.dataset.focusSource === 'map-time-slider'
				&& focus?.textContent?.includes('201 CE')
				&& !root?.querySelector('.cr-relationship-overlay-line--ally_of')
				&& !!root?.querySelector('.cr-relationship-overlay-line--political_rival');
		})()`
	);

	const at201 = await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const focus = root?.querySelector('.cr-fcv-historical-focus');
		return {
			label: focus?.textContent ?? null,
			source: focus?.dataset.focusSource ?? null,
			ally: !!root?.querySelector('.cr-relationship-overlay-line--ally_of'),
			rival: !!root?.querySelector('.cr-relationship-overlay-line--political_rival')
		};
	`);
	assert.match(at201.label ?? '', /201 CE/);
	assert.equal(at201.source, 'map-time-slider');
	assert.equal(at201.ally, false);
	// The preceding state-based wait already verifies the active rivalry;
	// a metadata-triggered redraw can temporarily replace the overlay
	// between that wait and this diagnostic snapshot.
	assert.equal(typeof at201.rival, 'boolean');
	const arrows201 = await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return [...root.querySelectorAll('.cr-fcv-historical-direction-arrow')].map(el => ({
			source: el.dataset.sourceCrId, target: el.dataset.targetCrId
		}));
	`);
	assert.deepEqual(arrows201, [], 'symmetric active rivalry has no arrow');

	// Keep the temporal-focus screenshot meaningful without invoking the
	// manual Fit command: Historical mode should recover automatically only
	// when every chart card has drifted outside the viewport.
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const viewport = root?.querySelector('svg.main_svg')?.getBoundingClientRect();
		const cards = [...(root?.querySelectorAll('.card_cont, .cr-fcv-historical-person-card') ?? [])];
		return !!viewport && cards.some(el => {
			const card = el.getBoundingClientRect();
			const style = getComputedStyle(el);
			return card.width > 0 && card.height > 0
				&& style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01
				&& card.right > viewport.left && card.left < viewport.right
				&& card.bottom > viewport.top && card.top < viewport.bottom;
		});
	})()`);
	const focusLayout = await session.evalInApp(`
		const focus = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl
			?.querySelector('.cr-fcv-historical-focus');
		if (!focus) throw new Error('Historical focus label unavailable');
		const r = focus.getBoundingClientRect();
		const style = getComputedStyle(focus);
		return {
			width: r.width, height: r.height, text: focus.textContent ?? '',
			whiteSpace: style.whiteSpace
		};
	`);
	assert.equal(focusLayout.whiteSpace, 'nowrap');
	assert.ok(focusLayout.height < 32, 'historical focus label should not collapse into vertical wrapping');
	assert.ok(focusLayout.width > focusLayout.height,
		'historical focus label should remain horizontally readable');

	await session.screenshot(
		path.join(ARTIFACTS, 'v2-historical-family-chart-focus.png')
	);

	await session.evalInApp(`
		app.plugins.plugins['charted-roots'].getTemporalFocusService().clear();
		return true;
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const focus = root?.querySelector('.cr-fcv-historical-focus');
			return focus?.textContent === 'All time'
				&& focus?.dataset.focusKind === 'all_time'
				&& !!root?.querySelector('.cr-relationship-overlay-line--ally_of')
				&& !!root?.querySelector('.cr-relationship-overlay-line--political_rival');
		})()`
	);

	// Both Assertions are visible at All time. Their routing must remain
	// distinct even though they connect the same two Person cards.
	const parallel = await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const ally = root?.querySelector('.cr-relationship-overlay-line--ally_of');
		const rival = root?.querySelector('.cr-relationship-overlay-line--political_rival');
		return {
			allyPath: ally?.getAttribute('d') ?? null,
			rivalPath: rival?.getAttribute('d') ?? null,
			allySource: ally?.dataset.sourceCrId ?? null,
			rivalSource: rival?.dataset.sourceCrId ?? null,
			arrowCount: root?.querySelectorAll('.cr-fcv-historical-direction-arrow').length ?? -1
		};
	`);
	assert.ok(parallel.allyPath);
	assert.ok(parallel.rivalPath);
	assert.notEqual(parallel.allyPath, parallel.rivalPath,
		'parallel historical Assertions should occupy distinct curves');
	assert.equal(parallel.allySource, 'person-cao-cao');
	assert.equal(parallel.rivalSource, 'person-cao-cao');
	// Arrows are part of the semantic historical overlay, not Family links.
	// Each directed edge has exactly one arrow aimed at its Assertion object.
	const arrowState = await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return [...root.querySelectorAll('.cr-fcv-historical-direction-arrow')].map(arrow => ({
			source: arrow.dataset.sourceCrId,
			target: arrow.dataset.targetCrId,
			points: arrow.getAttribute('points')
		}));
	`);
	assert.equal(arrowState.length, parallel.arrowCount);
	assert.equal(parallel.arrowCount, 0,
		'symmetric historical relationships must not display direction arrows');


	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().setAxisRange(
			12,
			13,
			{
				kind: 'chronology_year',
				chronologyId: 'shushan-calendar',
				label: '蜀山纪年',
				universe: '蜀山世界'
			},
			'e2e-chronology'
		);
		return true;
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const focus = root?.querySelector('.cr-fcv-historical-focus');
			return focus?.dataset.focusAxis === 'chronology_year'
				&& focus?.dataset.focusSupported === 'false'
				&& focus?.textContent?.includes('chronology-local focus unsupported')
				&& !!root?.querySelector('.cr-relationship-overlay-line--ally_of')
				&& !!root?.querySelector('.cr-relationship-overlay-line--political_rival');
		})()`
	);

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().clear();
		await plugin.activateTemporalTimelineView();
		return true;
	`);

	await session.waitFor(
		`app.workspace.getLeavesOfType('charted-roots-temporal-timeline')[0]
			?.view?.containerEl?.querySelector('.cr-v2-timeline__svg') instanceof SVGSVGElement`
	);

	await session.evalInApp(`
		const svg = app.workspace
			.getLeavesOfType('charted-roots-temporal-timeline')[0]
			?.view?.containerEl?.querySelector('.cr-v2-timeline__svg');
		if (!(svg instanceof SVGSVGElement)) {
			throw new Error('Temporal Timeline SVG is unavailable.');
		}
		const bounds = svg.getBoundingClientRect();
		svg.dispatchEvent(new MouseEvent('click', {
			bubbles: true,
			clientX: bounds.left + bounds.width * 0.55,
			clientY: bounds.top + 60
		}));
		return true;
	`);

	await session.waitFor(
		`(() => {
			const focus = app.workspace
				.getLeavesOfType('canvas-roots-family-chart')[0]
				?.view?.containerEl?.querySelector('.cr-fcv-historical-focus');
			return focus?.dataset.focusSource === 'timeline'
				&& focus?.dataset.focusAxis === 'julian_day'
				&& focus?.dataset.focusSupported === 'true';
		})()`
	);

	const fromTimeline = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const shared = plugin.getTemporalFocusService().get();
		const focus = app.workspace
			.getLeavesOfType('canvas-roots-family-chart')[0]
			?.view?.containerEl?.querySelector('.cr-fcv-historical-focus');
		return {
			shared,
			label: focus?.textContent ?? null,
			source: focus?.dataset.focusSource ?? null,
			axis: focus?.dataset.focusAxis ?? null
		};
	`);
	assert.equal(fromTimeline.shared?.kind, 'point');
	assert.equal(fromTimeline.shared?.source, 'timeline');
	assert.equal(fromTimeline.source, 'timeline');
	assert.equal(fromTimeline.axis, 'julian_day');
	assert.ok(typeof fromTimeline.label === 'string' && fromTimeline.label.length > 0);

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().clear();
		for (const path of [
			${JSON.stringify(setup.allyPath)},
			${JSON.stringify(setup.rivalPath)}
		]) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file) await app.vault.delete(file);
		}
		for (const leaf of app.workspace.getLeavesOfType('canvas-roots-family-chart')) {
			leaf.detach();
		}
		return true;
	`);
});


test('Historical Family Chart expands unrelated people into depth lanes', async (t) => {
	await mkdir(ARTIFACTS, { recursive: true });
	const session = await launchObsidian({ vault: VAULT });
	t.after(async () => session.close());

	const xunPath = 'Charted Roots/People/Xun-Yu-Historical-Lane-E2E.md';
	const guoPath = 'Charted Roots/People/Guo-Jia-Historical-Lane-E2E.md';
	const allyAssertionPath = 'Charted Roots/Assertions/Cao-Cao-Xun-Yu-Historical-Lane-E2E.md';
	const recommendAssertionPath = 'Charted Roots/Assertions/Xun-Yu-Guo-Jia-Historical-Lane-E2E.md';

	// These fixtures are intentionally checked into the E2E vault. Manual
	// Sandbox testing must see the exact same people/Assertions that CI sees.
	await session.waitFor(
		`app.metadataCache.getCache('Charted Roots/People/Cao-Cao.md')?.frontmatter?.cr_id === 'person-cao-cao'
			&& app.metadataCache.getCache(${JSON.stringify(xunPath)})?.frontmatter?.cr_id === 'e2e-historical-xun-yu'
			&& app.metadataCache.getCache(${JSON.stringify(guoPath)})?.frontmatter?.cr_id === 'e2e-historical-guo-jia'
			&& app.metadataCache.getCache(${JSON.stringify(allyAssertionPath)})?.frontmatter?.assertion_type === 'relationship'
			&& app.metadataCache.getCache(${JSON.stringify(recommendAssertionPath)})?.frontmatter?.assertion_type === 'relationship'`
	);

	const assertionSetup = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		if (!plugin) throw new Error('Charted Roots plugin is unavailable.');

		const workspace = plugin.getWorkspaceService();
		if (!workspace || workspace.getActive().rootFolder !== 'Charted Roots') {
			throw new Error('Historical lane E2E requires the default Charted Roots Workspace.');
		}

		const calendar = plugin.getHistoricalDateService().getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme historical calendar is unavailable.');
		const point197 = calendar.solarToJulianDay({ year: 197, month: 6, day: 1 });
		const point201 = calendar.solarToJulianDay({ year: 201, month: 6, day: 1 });

		plugin.getTemporalFocusService().setPoint(point197, 'e2e-historical-lanes');
		await plugin.activateFamilyChartView('person-cao-cao', true, true);

		return {
			assertionPaths: [
				${JSON.stringify(allyAssertionPath)},
				${JSON.stringify(recommendAssertionPath)}
			],
			point197,
			point201
		};
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			if (!root) return false;
			const structuralIds = [...root.querySelectorAll('.card_cont')]
				.map(card => card.__data__?.data?.id)
				.filter(Boolean);
			return structuralIds.includes('person-cao-cao')
				&& !structuralIds.includes('e2e-historical-xun-yu')
				&& !structuralIds.includes('e2e-historical-guo-jia');
		})()`
	);

	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		const select = view?.containerEl.querySelector('.cr-fcv-mode-select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Family Chart mode selector is unavailable.');
		}
		select.value = 'historical';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			if (!root) return false;
			const depthButtons = root.querySelectorAll('.cr-fcv-historical-depth-btn');
			const xun = root.querySelector(
				'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-xun-yu"][data-depth="1"]'
			);
			const guo = root.querySelector(
				'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]'
			);
			const edge = root.querySelector(
				'.cr-relationship-overlay-line--ally_of'
				+ '[data-source-cr-id="person-cao-cao"]'
				+ '[data-target-cr-id="e2e-historical-xun-yu"]'
			);
			return depthButtons.length === 4
				&& root.querySelector('.cr-fcv-historical-depth-btn[data-depth="1"]')?.getAttribute('aria-pressed') === 'true'
				&& !!xun
				&& !guo
				&& !!edge
				&& root.querySelector('.cr-fcv-chart-container')?.dataset.historicalExpandedCount === '1';
		})()`
	);

	// A political-only preset keeps the 曹操–荀彧 alliance but hides
	// 荀彧–郭嘉 recommendation. Restore All before depth-2 tests.
	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const select = root?.querySelector('.cr-fcv-historical-preset-select');
		if (!(select instanceof HTMLSelectElement)) throw new Error('Historical relation filter missing');
		select.value = 'political';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return root?.querySelector('.cr-fcv-historical-preset-select')?.value === 'political'
			&& !!root?.querySelector('.cr-relationship-overlay-line--ally_of')
			&& !root?.querySelector('.cr-relationship-overlay-line--recommends');
	})()`);
	const savedPoliticalState = await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		return view?.getState().historicalRelationPreset;
	`);
	assert.equal(savedPoliticalState, 'political', 'preset must persist in the view state');
	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const select = root?.querySelector('.cr-fcv-historical-preset-select');
		if (!(select instanceof HTMLSelectElement)) throw new Error('Historical relation filter missing');
		select.value = 'mentorship';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return root?.querySelector('.cr-fcv-historical-preset-select')?.value === 'mentorship'
			&& !root?.querySelector('.cr-relationship-overlay-line--ally_of')
			&& !root?.querySelector('.cr-fcv-historical-person-card[data-cr-id="e2e-historical-xun-yu"]');
	})()`);
	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const select = root?.querySelector('.cr-fcv-historical-preset-select');
		if (!(select instanceof HTMLSelectElement)) throw new Error('Historical relation filter missing');
		select.value = 'all';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return root?.querySelector('.cr-fcv-historical-preset-select')?.value === 'all'
			&& !!root?.querySelector('.cr-fcv-historical-person-card[data-cr-id="e2e-historical-xun-yu"]')
			&& !!root?.querySelector('.cr-relationship-overlay-line--ally_of');
	})()`);

	const depth1 = await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return {
			depthButtons: [...root.querySelectorAll('.cr-fcv-historical-depth-btn')]
				.map(button => ({
					depth: button.dataset.depth,
					pressed: button.getAttribute('aria-pressed')
				})),
		};
	`);
	assert.deepEqual(depth1.depthButtons.map(item => item.depth), ['1', '2', '3', '4']);

	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const button = root?.querySelector('.cr-fcv-historical-depth-btn[data-depth="2"]');
		if (!(button instanceof HTMLButtonElement)) {
			throw new Error('Historical depth 2 button is unavailable.');
		}
		button.click();
		return true;
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			return root?.querySelector('.cr-fcv-historical-depth-btn[data-depth="2"]')
					?.getAttribute('aria-pressed') === 'true'
				&& !!root?.querySelector(
					'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-xun-yu"][data-depth="1"]'
				)
				&& !!root?.querySelector(
					'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"][data-depth="2"]'
				)
				&& root?.querySelector('.cr-fcv-chart-container')
					?.dataset.historicalExpandedCount === '2';
		})()`
	);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const label = root?.querySelector(
				'.cr-fcv-historical-edge-label[data-predicate="recommends"][data-source-cr-id="e2e-historical-xun-yu"][data-target-cr-id="e2e-historical-guo-jia"]'
			);
			return !!root?.querySelector(
				'.cr-relationship-overlay-line--recommends[data-source-cr-id="e2e-historical-xun-yu"][data-target-cr-id="e2e-historical-guo-jia"]'
			) && root?.querySelectorAll(
				'.cr-fcv-historical-direction-arrow[data-source-cr-id="e2e-historical-xun-yu"][data-target-cr-id="e2e-historical-guo-jia"]'
			).length === 1
				&& !!label?.textContent?.trim();
		})()`
	);

	// Wait out the depth-change crossfade so interaction assertions target only
	// the current lane, not an outgoing copy.
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return root?.querySelectorAll('.cr-fcv-historical-expansion-layer--exiting').length === 0
			&& root?.querySelectorAll(
				'.cr-fcv-historical-expansion-layer:not(.cr-fcv-historical-expansion-layer--exiting) .cr-fcv-historical-person-card'
			).length === 2;
	})()`);

	// Historical-only cards must use the same interaction contract as Family
	// cards: body => details, top-right document button => Person note.
	const bodyClick = await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		const root = view?.containerEl;
		const card = root?.querySelector(
			'.cr-fcv-historical-expansion-layer:not(.cr-fcv-historical-expansion-layer--exiting) '
			+ '.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]'
		);
		if (!(card instanceof SVGGElement)) throw new Error('Active Guo Jia Historical card missing');
		const beforeFile = app.workspace.getActiveFile()?.path ?? null;
		card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		const panel = root?.querySelector('.cr-fcv-info-panel');
		return {
			beforeFile,
			afterFile: app.workspace.getActiveFile()?.path ?? null,
			panelVisible: !!panel && !panel.classList.contains('crc-hidden'),
			panelText: panel?.textContent ?? ''
		};
	`);
	assert.equal(bodyClick.panelVisible, true);
	assert.match(bodyClick.panelText, /郭嘉/);
	assert.equal(bodyClick.afterFile, bodyClick.beforeFile,
		'Historical card body must open details without navigating to the note');

	// The details panel has a keyboard-accessible resize handle and persists the
	// chosen width in FamilyChartView state.
	const panelResize = await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		const panel = view?.containerEl.querySelector('.cr-fcv-info-panel');
		const handle = panel?.querySelector('.cr-fcv-info-panel-resize-handle');
		if (!(panel instanceof HTMLElement) || !(handle instanceof HTMLElement)) {
			throw new Error('Resizable Person details panel unavailable');
		}
		const before = panel.getBoundingClientRect().width;
		handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
		const after = panel.getBoundingClientRect().width;
		const saved = view.getState().infoPanelWidth;
		// Restore the original width so later viewport/export assertions keep the
		// same geometry they had before this regression test.
		handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		return { before, after, saved, overflowX: getComputedStyle(view.containerEl.querySelector('.cr-fcv-info-panel-content')).overflowX };
	`);
	assert.ok(panelResize.after > panelResize.before, 'ArrowLeft should widen the right-side details panel');
	assert.ok(Math.abs(panelResize.saved - panelResize.after) < 2, 'resized details width must persist in view state');
	assert.equal(panelResize.overflowX, 'hidden', 'details use wrapping instead of a horizontal scrollbar');

	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const button = root?.querySelector(
			'.cr-fcv-historical-expansion-layer:not(.cr-fcv-historical-expansion-layer--exiting) '
			+ '.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"] '
			+ '.cr-fcv-historical-person-card__open-note'
		);
		if (!(button instanceof SVGGElement)) throw new Error('Historical open-note button missing');
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		return true;
	`);
	await session.waitFor(
		`app.workspace.getActiveFile()?.path === "Charted Roots/People/Guo-Jia-Historical-Lane-E2E.md"`
	);
	await session.evalInApp(`
		for (const leaf of app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view?.file?.path === 'Charted Roots/People/Guo-Jia-Historical-Lane-E2E.md') leaf.detach();
		}
		const familyLeaf = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0];
		if (familyLeaf) app.workspace.setActiveLeaf(familyLeaf, { focus: true });
		return true;
	`);

	// Card display changes must never blank the Historical lane while f3 updates
	// the structural cards, and enabled fields must actually appear on Historical
	// cards.郭嘉 has a permanent 207 CE death-date fixture.
	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		const root = view?.containerEl;
		if (!view || !root) throw new Error('Historical view unavailable for Card display test');
		window.__crHistoricalDisplayZeroCount = 0;
		const count = () => root.querySelectorAll(
			'.cr-fcv-historical-expansion-layer:not(.cr-fcv-historical-expansion-layer--exiting) .cr-fcv-historical-person-card'
		).length;
		window.__crHistoricalDisplayObserver = new MutationObserver(() => {
			if (count() === 0) window.__crHistoricalDisplayZeroCount++;
		});
		window.__crHistoricalDisplayObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
		view.toggleDeathDates();
		return true;
	`);
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const card = root?.querySelector(
			'.cr-fcv-historical-expansion-layer:not(.cr-fcv-historical-expansion-layer--exiting) '
			+ '.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]'
		);
		return [...(card?.querySelectorAll('.cr-fcv-historical-person-card__detail') ?? [])]
			.some(el => el.textContent?.includes('207 CE'));
	})()`);
	const displayGapCount = await session.evalInApp(`
		window.__crHistoricalDisplayObserver?.disconnect();
		const value = window.__crHistoricalDisplayZeroCount ?? -1;
		delete window.__crHistoricalDisplayObserver;
		delete window.__crHistoricalDisplayZeroCount;
		return value;
	`);
	assert.equal(displayGapCount, 0, 'Card display update must not remove every active Historical card');

	// Restore the default death-date toggle before the export assertions below.
	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		view.toggleDeathDates();
		return true;
	`);
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const card = root?.querySelector(
			'.cr-fcv-historical-expansion-layer:not(.cr-fcv-historical-expansion-layer--exiting) '
			+ '.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]'
		);
		return !!card && ![...(card.querySelectorAll('.cr-fcv-historical-person-card__detail'))]
			.some(el => el.textContent?.includes('207 CE'));
	})()`);

	// Temporal focus changes use a real 800ms Historical enter/exit transition,
	// matching the Family chart instead of deleting the lane synchronously.
	const exitTransition = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().setPoint(${assertionSetup.point201}, 'e2e-historical-transition');
		await new Promise(resolve => requestAnimationFrame(resolve));
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const exiting = root?.querySelector('.cr-fcv-historical-expansion-layer--exiting');
		return {
			state: exiting?.dataset.transitionState ?? null,
			cards: exiting?.querySelectorAll('.cr-fcv-historical-person-card').length ?? 0,
			animations: exiting?.getAnimations().length ?? 0,
			expanded: root?.querySelector('.cr-fcv-chart-container')?.dataset.historicalExpandedCount ?? null
		};
	`);
	assert.equal(exitTransition.state, 'exit');
	assert.equal(exitTransition.cards, 2);
	assert.ok(exitTransition.animations > 0, 'Historical cards should fade out when the temporal slice removes them');
	assert.equal(exitTransition.expanded, '0');
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return root?.querySelectorAll('.cr-fcv-historical-expansion-layer').length === 0;
	})()`);

	const enterTransition = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().setPoint(${assertionSetup.point197}, 'e2e-historical-transition');
		await new Promise(resolve => requestAnimationFrame(resolve));
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const layer = root?.querySelector(
			'.cr-fcv-historical-expansion-layer:not(.cr-fcv-historical-expansion-layer--exiting)'
		);
		return {
			state: layer?.dataset.transitionState ?? null,
			cards: layer?.querySelectorAll('.cr-fcv-historical-person-card').length ?? 0,
			animations: layer?.getAnimations().length ?? 0
		};
	`);
	assert.equal(enterTransition.state, 'enter');
	assert.equal(enterTransition.cards, 2);
	assert.ok(enterTransition.animations > 0, 'Historical cards should fade in when the temporal slice restores them');
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const layer = root?.querySelector(
			'.cr-fcv-historical-expansion-layer:not(.cr-fcv-historical-expansion-layer--exiting)'
		);
		return !!layer
			&& !layer.dataset.transitionState
			&& layer.querySelectorAll('.cr-fcv-historical-person-card').length === 2;
	})()`);

	// Verify the directed arrow tip lies at the semantic target card's
	// boundary, not merely that an arrow polygon was created somewhere.
	const arrowPlacement = await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const arrow = root?.querySelector(
			'.cr-fcv-historical-direction-arrow[data-source-cr-id="e2e-historical-xun-yu"][data-target-cr-id="e2e-historical-guo-jia"]'
		);
		const target = root?.querySelector(
			'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]'
		);
		if (!arrow || !target) throw new Error('Directed arrow or target card unavailable');
		const tip = arrow.points.getItem(0);
		const ctm = arrow.getScreenCTM();
		if (!ctm) throw new Error('Arrow SVG matrix unavailable');
		const screenTip = new DOMPoint(tip.x, tip.y).matrixTransform(ctm);
		const rect = target.getBoundingClientRect();
		const nearestX = Math.max(rect.left, Math.min(rect.right, screenTip.x));
		const nearestY = Math.max(rect.top, Math.min(rect.bottom, screenTip.y));
		return {
			distanceToTarget: Math.hypot(screenTip.x - nearestX, screenTip.y - nearestY),
			visible: rect.width > 0 && rect.height > 0
		};
	`);
	assert.equal(arrowPlacement.visible, true);
	assert.ok(arrowPlacement.distanceToTarget <= 45,
		'Historical arrow tip should terminate near its semantic target card');

	// Capture the actual SVG export payload without triggering a download.
	// Assert that the serialized output retains historical lanes and arrows,
	// and that its viewBox contains both SVG layer bounding boxes.
	const exported = await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		const svg = view?.containerEl.querySelector('svg.main_svg');
		if (!view || !svg) throw new Error('Historical chart SVG missing for export');
		const boxFor = selector => {
			const el = svg.querySelector(selector);
			if (!el) throw new Error('Missing historical SVG layer: ' + selector);
			const b = el.getBBox();
			return { x: b.x, y: b.y, width: b.width, height: b.height };
		};
		const lane = boxFor('.cr-fcv-historical-expansion-layer');
		const overlay = boxFor('.cr-relationship-overlay');
		const originalUrl = URL.createObjectURL;
		const originalClick = HTMLAnchorElement.prototype.click;
		let blob;
		try {
			URL.createObjectURL = object => { blob = object; return 'blob:e2e-export'; };
			HTMLAnchorElement.prototype.click = function () {};
			await view.exportWithOptions({
				format: 'svg', filename: 'historical-e2e.svg', includeAvatars: false
			});
		} finally {
			URL.createObjectURL = originalUrl;
			HTMLAnchorElement.prototype.click = originalClick;
		}
		if (!(blob instanceof Blob)) throw new Error('SVG export blob was not generated');
		const xml = await blob.text();
		const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
		const outputSvg = doc.documentElement;
		const viewBox = outputSvg.getAttribute('viewBox')?.split(/\\s+/).map(Number);
		const historicalBody = doc.querySelector(
			'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"] .cr-fcv-historical-person-card__body'
		);
		const historicalName = doc.querySelector(
			'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"] .cr-fcv-historical-person-card__name'
		);
		const presentationElements = [...doc.querySelectorAll('[fill], [stroke]')];
		const presentationVarCount = presentationElements
			.filter(el =>
				(el.getAttribute('fill') ?? '').includes('var(')
				|| (el.getAttribute('stroke') ?? '').includes('var(')
			).length;
		const rgbaPresentationCount = presentationElements
			.filter(el =>
				(el.getAttribute('fill') ?? '').toLowerCase().includes('rgba(')
				|| (el.getAttribute('stroke') ?? '').toLowerCase().includes('rgba(')
			).length;
		const exportBackground = doc.querySelector('.cr-export-background');
		const recommendationLine = doc.querySelector('.cr-relationship-overlay-line--recommends');
		const structuralCards = [...doc.querySelectorAll('.card_cont')].map(el => {
			const style = el.getAttribute('style') ?? '';
			const opacityMatch = style.match(/opacity:\\s*([0-9.]+)/i);
			return {
				text: el.textContent?.trim() ?? '',
				transform: el.getAttribute('transform') ?? '',
				opacity: opacityMatch ? Number(opacityMatch[1]) : 1
			};
		});
		return {
			xml,
			laneCard: !!doc.querySelector('.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]'),
			recommendation: !!doc.querySelector('.cr-relationship-overlay-line--recommends'),
			persistentLabel: doc.querySelector('.cr-fcv-historical-edge-label[data-predicate="recommends"]')?.textContent?.trim() ?? '',
			arrow: !!doc.querySelector('.cr-fcv-historical-direction-arrow'),
			chineseXun: xml.includes('荀彧'),
			chineseGuo: xml.includes('郭嘉'),
			invalidXml: doc.querySelector('parsererror') !== null,
			historicalBodyFill: historicalBody?.getAttribute('fill') ?? '',
			historicalNameFill: historicalName?.getAttribute('fill') ?? '',
			presentationVarCount,
			rgbaPresentationCount,
			backgroundFill: exportBackground?.getAttribute('fill') ?? '',
			backgroundOpacity: exportBackground?.getAttribute('opacity') ?? '',
			historicalBodyOpacity: historicalBody?.getAttribute('opacity') ?? '',
			historicalBodyFillOpacity: historicalBody?.getAttribute('fill-opacity') ?? '',
			recommendationStroke: recommendationLine?.getAttribute('stroke') ?? '',
			recommendationOpacity: recommendationLine?.getAttribute('opacity') ?? '',
			structuralCards,
			viewBox, lane, overlay
		};
	`);
	assert.equal(exported.laneCard, true);
	assert.equal(exported.recommendation, true);
	assert.ok(exported.persistentLabel, 'SVG export should retain persistent historical edge label');
	assert.equal(exported.arrow, true);
	assert.equal(exported.invalidXml, false);
	assert.equal(exported.chineseXun, true);
	assert.equal(exported.chineseGuo, true);
	assert.equal(exported.presentationVarCount, 0,
		'standalone SVG presentation attributes must not depend on Obsidian CSS variables');
	assert.equal(exported.rgbaPresentationCount, 0,
		'standalone SVG presentation attributes should use portable rgb + opacity instead of rgba()');
	assert.ok(exported.historicalBodyFill,
		'Historical card body should have a resolved standalone fill');
	assert.ok(exported.historicalNameFill,
		'Historical card name should have a resolved standalone fill');
	assert.notEqual(exported.historicalBodyFill, exported.historicalNameFill,
		'Historical card body and text should retain contrasting resolved colors');
	assert.ok(exported.backgroundFill && exported.backgroundOpacity !== '0',
		'standalone export should include an opaque chart background');
	assert.notEqual(exported.historicalBodyOpacity, '0',
		'Historical card body must not inherit transient zero opacity');
	assert.notEqual(exported.historicalBodyFillOpacity, '0',
		'Historical card body fill must remain visible');
	assert.ok(exported.recommendationStroke && exported.recommendationStroke !== 'none',
		'Historical relationship route should retain a visible stroke');
	assert.notEqual(exported.recommendationOpacity, '0',
		'Historical relationship route must not inherit transient zero opacity');
	const structuralCaoCao = exported.structuralCards.find(card => card.text.includes('曹操'));
	const structuralCaoSong = exported.structuralCards.find(card => card.text.includes('曹嵩'));
	assert.ok(structuralCaoCao, 'SVG export should retain structural 曹操 card');
	assert.ok(structuralCaoSong, 'SVG export should retain structural 曹嵩 card');
	assert.notEqual(structuralCaoCao.transform, structuralCaoSong.transform,
		'structural cards must export from distinct settled positions');
	assert.ok(structuralCaoCao.opacity >= 0.95 && structuralCaoSong.opacity >= 0.95,
		'structural cards must not export transient entrance-animation opacity');
	assert.equal(exported.viewBox?.length, 4);
	await writeFile(
		path.join(ARTIFACTS, 'v2-historical-family-chart-export.svg'),
		exported.xml,
		'utf8'
	);
	for (const box of [exported.lane, exported.overlay]) {
		assert.ok(box.x >= exported.viewBox[0] - 0.01);
		assert.ok(box.y >= exported.viewBox[1] - 0.01);
		assert.ok(box.x + box.width <= exported.viewBox[0] + exported.viewBox[2] + 0.01);
		assert.ok(box.y + box.height <= exported.viewBox[1] + exported.viewBox[3] + 0.01);
	}

	// Exercise the real PNG export path. Preserve actual blob: URLs for
	// SVG-to-canvas rendering; intercept only the final download.
	const pngExport = await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		if (!view) throw new Error('Historical chart view missing for PNG export');
		const originalUrl = URL.createObjectURL;
		const originalClick = HTMLAnchorElement.prototype.click;
		let accept;
		const producedPng = new Promise(resolve => { accept = resolve; });
		try {
			URL.createObjectURL = function (blob) {
				if (blob?.type === 'image/png') accept(blob);
				return originalUrl.call(URL, blob);
			};
			HTMLAnchorElement.prototype.click = function () {};
			await view.exportWithOptions({
				format: 'png', filename: 'historical-e2e.png',
				includeAvatars: false, scale: 1
			});
			const blob = await Promise.race([
				producedPng,
				new Promise((_, reject) => setTimeout(() => reject(new Error('PNG export timed out')), 10000))
			]);
			const header = new DataView(await blob.slice(0, 24).arrayBuffer());
			const bytes = Array.from(new Uint8Array(await blob.slice(0, 8).arrayBuffer()));
			const width = header.getUint32(16, false);
			const height = header.getUint32(20, false);
			const image = await createImageBitmap(blob);
			const canvas = document.createElement('canvas');
			canvas.width = image.width;
			canvas.height = image.height;
			const context = canvas.getContext('2d');
			if (!context) throw new Error('PNG verification canvas missing');
			context.drawImage(image, 0, 0);
			const pixels = context.getImageData(0, 0, width, height).data;
			let nonBackground = 0;
			const base = pixels.slice(0, 3);
			for (let i = 0; i < pixels.length; i += 4) {
				if (Math.abs(pixels[i] - base[0]) + Math.abs(pixels[i + 1] - base[1]) + Math.abs(pixels[i + 2] - base[2]) > 45) nonBackground++;
			}
			image.close();
			const raw = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			const chunk = 0x8000;
			for (let i = 0; i < raw.length; i += chunk) {
				binary += String.fromCharCode(...raw.subarray(i, Math.min(i + chunk, raw.length)));
			}
			return {
				type: blob.type, size: blob.size, signature: bytes, width, height,
				nonBackground, base64: btoa(binary)
			};
		} finally {
			URL.createObjectURL = originalUrl;
			HTMLAnchorElement.prototype.click = originalClick;
		}
	`);
	assert.equal(pngExport.type, 'image/png');
	assert.ok(pngExport.size > 8);
	assert.deepEqual(pngExport.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
	assert.ok(pngExport.width > 100 && pngExport.height > 100);
	assert.ok(pngExport.nonBackground > 200, 'PNG export should contain rendered chart pixels');
	await writeFile(
		path.join(ARTIFACTS, 'v2-historical-family-chart-export.png'),
		Buffer.from(pngExport.base64, 'base64')
	);
	assert.equal(
		Buffer.from(pngExport.base64, 'base64').length,
		pngExport.size,
		'persisted PNG artifact should match the real exported blob'
	);

	// Exercise the real PDF export path and persist the actual PDF blob.
	const pdfExport = await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		if (!view) throw new Error('Historical chart view missing for PDF export');
		const originalUrl = URL.createObjectURL;
		const originalClick = HTMLAnchorElement.prototype.click;
		let accept;
		const produced = new Promise(resolve => { accept = resolve; });
		try {
			URL.createObjectURL = function (blob) {
				if (blob?.type === 'application/pdf') accept(blob);
				return originalUrl.call(URL, blob);
			};
			HTMLAnchorElement.prototype.click = function () {};
			await view.exportWithOptions({
				format: 'pdf', filename: 'historical-e2e.pdf',
				includeAvatars: false, scale: 1, pageSize: 'fit',
				layout: 'single', orientation: 'auto', includeCoverPage: false
			});
			const blob = await Promise.race([
				produced,
				new Promise((_, reject) => setTimeout(() => reject(new Error('PDF export timed out')), 15000))
			]);
			const raw = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			const chunk = 0x8000;
			for (let i = 0; i < raw.length; i += chunk) {
				binary += String.fromCharCode(...raw.subarray(i, Math.min(i + chunk, raw.length)));
			}
			return {
				type: blob.type,
				size: blob.size,
				signature: Array.from(raw.slice(0, 5)),
				base64: btoa(binary)
			};
		} finally {
			URL.createObjectURL = originalUrl;
			HTMLAnchorElement.prototype.click = originalClick;
		}
	`);
	assert.equal(pdfExport.type, 'application/pdf');
	assert.deepEqual(pdfExport.signature, [37, 80, 68, 70, 45]);
	assert.ok(pdfExport.size > 1000, 'PDF export should contain a rendered chart');
	await writeFile(
		path.join(ARTIFACTS, 'v2-historical-family-chart-export.pdf'),
		Buffer.from(pdfExport.base64, 'base64')
	);

	// Exercise the real ODT export path and persist the actual ODF container.
	const odtExport = await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		if (!view) throw new Error('Historical chart view missing for ODT export');
		const originalUrl = URL.createObjectURL;
		const originalClick = HTMLAnchorElement.prototype.click;
		let accept;
		const produced = new Promise(resolve => { accept = resolve; });
		try {
			URL.createObjectURL = function (blob) {
				if (blob?.type === 'application/vnd.oasis.opendocument.text') accept(blob);
				return originalUrl.call(URL, blob);
			};
			HTMLAnchorElement.prototype.click = function () {};
			await view.exportWithOptions({
				format: 'odt', filename: 'historical-e2e.odt',
				includeAvatars: false, scale: 1, includeCoverPage: false
			});
			const blob = await Promise.race([
				produced,
				new Promise((_, reject) => setTimeout(() => reject(new Error('ODT export timed out')), 15000))
			]);
			const raw = new Uint8Array(await blob.arrayBuffer());
			let binary = '';
			const chunk = 0x8000;
			for (let i = 0; i < raw.length; i += chunk) {
				binary += String.fromCharCode(...raw.subarray(i, Math.min(i + chunk, raw.length)));
			}
			return {
				type: blob.type,
				size: blob.size,
				signature: Array.from(raw.slice(0, 4)),
				base64: btoa(binary)
			};
		} finally {
			URL.createObjectURL = originalUrl;
			HTMLAnchorElement.prototype.click = originalClick;
		}
	`);
	assert.equal(odtExport.type, 'application/vnd.oasis.opendocument.text');
	assert.deepEqual(odtExport.signature, [80, 75, 3, 4]);
	assert.ok(odtExport.size > 1000, 'ODT export should contain a rendered chart');
	await writeFile(
		path.join(ARTIFACTS, 'v2-historical-family-chart-export.odt'),
		Buffer.from(odtExport.base64, 'base64')
	);

	// Fit the chart before capturing the visual artifact: successful DOM
	// assertions alone do not guarantee cards are actually in the viewport.
	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		if (!view) throw new Error('Family Chart unavailable for visual acceptance');
		view.fitToView();
		return true;
	`);
	// F3's fit animation can rebuild the chart and temporarily discard
	// historical lane DOM. Wait for the projected lane to reappear before
	// diagnosing its actual viewport coordinates.
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		return root?.querySelector('.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]')
			&& root?.querySelector('.cr-fcv-chart-container')?.dataset.historicalExpandedCount === '2';
	})()`);
	// Historical fitting runs after f3's asynchronous position-stability
	// callback. Wait for the actual visible result before collecting the
	// geometry diagnostic; an immediate read samples f3's old fit transform.
	let visibleAfterFit = true;
	try {
		await session.waitFor(`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const viewport = root?.querySelector('svg.main_svg')?.getBoundingClientRect();
			const card = root?.querySelector('.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]')?.getBoundingClientRect();
			return !!viewport && !!card && card.width > 0 && card.height > 0
				&& card.right > viewport.left && card.left < viewport.right
				&& card.bottom > viewport.top && card.top < viewport.bottom;
		})()`);
	} catch {
		visibleAfterFit = false;
	}
	const visualBounds = await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const svg = root?.querySelector('svg.main_svg');
		const card = root?.querySelector('.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]');
		const rect = el => {
			if (!el) return null;
			const r = el.getBoundingClientRect();
			return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
		};
		return {
			viewport: rect(svg),
			card: rect(card),
			chartContainer: rect(root?.querySelector('.cr-fcv-chart-container')),
			viewTransform: svg?.querySelector('.view')?.getAttribute('transform') ?? null,
			historicalCardCount: root?.querySelectorAll('.cr-fcv-historical-person-card').length ?? -1,
			cardGeometry: (() => {
				const group = root?.querySelector('.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]');
				if (!group) return null;
				const matrix = group.getScreenCTM();
				return {
					x: group.getAttribute('data-x'), y: group.getAttribute('data-y'),
					transform: group.getAttribute('transform'),
					parent: group.parentElement?.getAttribute('class'),
					parentTransform: group.parentElement?.getAttribute('transform'),
					ownerView: group.closest('.view')?.getAttribute('transform'),
					ownerViewStyle: group.closest('.view')?.getAttribute('style'),
					matrix: matrix ? { a: matrix.a, d: matrix.d, e: matrix.e, f: matrix.f } : null
				};
			})()
		};
	`);
	await session.screenshot(path.join(ARTIFACTS, 'v2-historical-family-chart-visual-diagnostic.png'));
	const viewport = visualBounds.viewport;
	const card = visualBounds.card;
	assert.ok(viewport && card && card.width > 0 && card.height > 0
		&& card.right > viewport.left && card.left < viewport.right
		&& card.bottom > viewport.top && card.top < viewport.bottom,
		'Historical depth-2 card is outside visible SVG after fit (wait passed: ' + visibleAfterFit + '): ' + JSON.stringify(visualBounds));

	await session.screenshot(
		path.join(ARTIFACTS, 'v2-historical-family-chart-expansion-depth2.png')
	);

	// Dense real-Obsidian acceptance: add eleven more active directed
	// recommendations between the same pair. The original edge plus these
	// fixtures must all remain rendered, while persistent labels are sampled.
	const denseAssertionPaths = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const assertionService = plugin.getAssertionService();
		const created = [];
		for (let i = 0; i < 11; i++) {
			const file = await assertionService.createAssertion({
				assertionType: 'relationship',
				subject: '[[Charted Roots/People/Xun-Yu-Historical-Lane-E2E|荀彧]]',
				predicate: 'recommends',
				object: '[[Charted Roots/People/Guo-Jia-Historical-Lane-E2E|郭嘉]]',
				timeStart: '196 CE',
				timeEnd: '199 CE',
				timeStartPrecision: 'year',
				timeEndPrecision: 'year',
				timeStartCertainty: 'certain',
				timeEndCertainty: 'certain',
				notes: 'E2E dense historical route ' + (i + 1),
				title: '荀彧举荐郭嘉 Dense E2E ' + (i + 1)
			}, { folder: 'Charted Roots/Assertions' });
			created.push(file.path);
		}
		return created;
	`);
	for (const assertionPath of denseAssertionPaths) {
		await session.waitFor(
			`app.metadataCache.getCache(${JSON.stringify(assertionPath)})?.frontmatter?.predicate === "recommends"`
		);
	}
	await session.waitFor(`(() => {
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const edgeSelector = '.cr-relationship-overlay-line--recommends'
			+ '[data-source-cr-id="e2e-historical-xun-yu"]'
			+ '[data-target-cr-id="e2e-historical-guo-jia"]';
		const labelSelector = '.cr-fcv-historical-edge-label[data-predicate="recommends"]'
			+ '[data-source-cr-id="e2e-historical-xun-yu"]'
			+ '[data-target-cr-id="e2e-historical-guo-jia"]';
		return root?.querySelectorAll(edgeSelector).length === 12
			&& root?.querySelectorAll(labelSelector).length === 4;
	})()`);

	// Dense fixture creation can trigger metadata redraws that leave the depth-2
	// lane outside the viewport. Fit the complete Historical surface and require
	// the actual dense routes and labels to be visible before taking the artifact.
	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		if (!view) throw new Error('Family Chart unavailable for dense acceptance');
		view.fitToView();
		return true;
	`);
	const denseVisibility = await session.evalInApp(`
		const snapshot = () => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const svg = root?.querySelector('svg.main_svg');
			const view = svg?.querySelector('.view');
			const viewport = svg?.getBoundingClientRect();
			const guoEl = root?.querySelector(
				'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]'
			);
			const guo = guoEl?.getBoundingClientRect();
			const labelEls = [...(root?.querySelectorAll(
				'.cr-fcv-historical-edge-label[data-predicate="recommends"]'
				+ '[data-source-cr-id="e2e-historical-xun-yu"]'
				+ '[data-target-cr-id="e2e-historical-guo-jia"]'
			) ?? [])];
			const labels = labelEls.map(el => {
				const r = el.getBoundingClientRect();
				return { left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,text:el.textContent };
			});
			const margin = 8;
			const visible = !!viewport && !!guo && labels.length === 4
				&& guo.left >= viewport.left + margin
				&& guo.right <= viewport.right - margin
				&& guo.top >= viewport.top + margin
				&& guo.bottom <= viewport.bottom - margin
				&& labels.every(label =>
					label.left >= viewport.left + margin
					&& label.right <= viewport.right - margin
					&& label.top >= viewport.top + margin
					&& label.bottom <= viewport.bottom - margin
				);
			let overlayBox = null;
			try {
				const b = view?.querySelector('.cr-relationship-overlay')?.getBBox();
				if (b) overlayBox = { x:b.x,y:b.y,width:b.width,height:b.height };
			} catch {}
			return {
				visible,
				viewport: viewport ? {left:viewport.left,right:viewport.right,top:viewport.top,bottom:viewport.bottom,width:viewport.width,height:viewport.height} : null,
				guo: guo ? {left:guo.left,right:guo.right,top:guo.top,bottom:guo.bottom,width:guo.width,height:guo.height} : null,
				labels,
				overlayBox,
				viewTransform: view?.getAttribute('transform') ?? null,
				viewStyle: view?.getAttribute('style') ?? null,
			};
		};
		let current = snapshot();
		for (let frame = 0; frame < 300 && !current.visible; frame++) {
			await new Promise(resolve => requestAnimationFrame(resolve));
			current = snapshot();
		}
		return current;
	`);
	assert.equal(denseVisibility.visible, true,
		'dense Historical content failed to fit visibly: ' + JSON.stringify(denseVisibility));

	const denseLayout = await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const labels = [...root.querySelectorAll(
			'.cr-fcv-historical-edge-label[data-predicate="recommends"]'
			+ '[data-source-cr-id="e2e-historical-xun-yu"]'
			+ '[data-target-cr-id="e2e-historical-guo-jia"]'
		)].map(el => el.getBoundingClientRect());
		const cards = [...root.querySelectorAll('.card_cont, .cr-fcv-historical-person-card')]
			.map(el => el.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
		const overlapsCard = labels.some(label => cards.some(card =>
			label.right > card.left && label.left < card.right
			&& label.bottom > card.top && label.top < card.bottom
		));
		let labelOverlapPairs = 0;
		for (let i = 0; i < labels.length; i++) {
			for (let j = i + 1; j < labels.length; j++) {
				const a = labels[i], b = labels[j];
				if (a.right > b.left && a.left < b.right
					&& a.bottom > b.top && a.top < b.bottom) labelOverlapPairs++;
			}
		}
		return { labels: labels.length, overlapsCard, labelOverlapPairs };
	`);
	assert.equal(denseLayout.labels, 4);
	assert.equal(denseLayout.overlapsCard, false,
		'dense persistent labels should not cover person cards');
	assert.equal(denseLayout.labelOverlapPairs, 0,
		'dense persistent labels should remain spatially distinct');
	await session.screenshot(
		path.join(ARTIFACTS, 'v2-historical-family-chart-dense-parallel.png')
	);

	// Metadata/index refreshes can legitimately rebuild the Family Chart after
	// the depth-2 state has already been observed. Re-assert the actual target
	// immediately before interaction so the acceptance test never clicks during
	// the transient teardown/rebuild window. This is state-based, not a sleep:
	// the historical card still has to be genuinely present at depth 1.
	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			return !!root?.querySelector(
				'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-xun-yu"][data-depth="1"]'
			);
		})()`
	);

	// Body-click semantics are covered above as Person-details navigation. The
	// original acceptance used the card body to open the note; after aligning
	// Historical cards with Family cards, note navigation belongs to the
	// top-right document button instead.
	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const button = root?.querySelector(
			'.cr-fcv-historical-expansion-layer:not(.cr-fcv-historical-expansion-layer--exiting) '
			+ '.cr-fcv-historical-person-card[data-cr-id="e2e-historical-xun-yu"] '
			+ '.cr-fcv-historical-person-card__open-note'
		);
		if (!button) {
			throw new Error('Historical 荀彧 open-note button is unavailable.');
		}
		button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		return true;
	`);

	await session.waitFor(
		`app.workspace.getActiveFile()?.path === "Charted Roots/People/Xun-Yu-Historical-Lane-E2E.md"`
	);

	await session.evalInApp(`
		for (const leaf of app.workspace.getLeavesOfType('markdown')) {
			const path = leaf.view?.file?.path;
			if (
				path === 'Charted Roots/People/Xun-Yu-Historical-Lane-E2E.md'
				|| path === 'Charted Roots/People/Guo-Jia-Historical-Lane-E2E.md'
			) {
				leaf.detach();
			}
		}
		return true;
	`);

	await session.evalInApp(`
		app.plugins.plugins['charted-roots'].getTemporalFocusService().setPoint(
			${JSON.stringify(assertionSetup.point201)},
			'e2e-historical-lanes-201'
		);
		return true;
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			if (!root) return false;
			return !root.querySelector(
					'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-xun-yu"]'
				)
				&& !root.querySelector(
					'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]'
				)
				&& root.querySelector('.cr-fcv-chart-container')
					?.dataset.historicalExpandedCount === '0'
				&& !root.querySelector(
					'.cr-relationship-overlay-line--ally_of'
					+ '[data-source-cr-id="person-cao-cao"]'
					+ '[data-target-cr-id="e2e-historical-xun-yu"]'
				)
				&& !root.querySelector(
					'.cr-relationship-overlay-line--recommends'
					+ '[data-source-cr-id="e2e-historical-xun-yu"]'
					+ '[data-target-cr-id="e2e-historical-guo-jia"]'
				)
				&& !root.querySelector(
					'.cr-fcv-historical-direction-arrow'
					+ '[data-source-cr-id="e2e-historical-xun-yu"]'
					+ '[data-target-cr-id="e2e-historical-guo-jia"]'
				);
		})()`
	);

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().clear();
		for (const path of ${JSON.stringify(denseAssertionPaths)}) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file) await app.vault.delete(file);
		}
		for (const leaf of app.workspace.getLeavesOfType('canvas-roots-family-chart')) {
			leaf.detach();
		}
		return true;
	`);
});


test('Historical Family Chart enriches Person cards with temporal institutional state', async (t) => {
	await mkdir(ARTIFACTS, { recursive: true });
	const session = await launchObsidian({ vault: VAULT });
	t.after(async () => session.close());

	const hanCourtPath = 'Charted Roots/Organizations/Han-Court-Historical-Card-E2E.md';
	const caoGroupPath = 'Charted Roots/Organizations/Cao-Group-Historical-Card-E2E.md';

	await session.waitFor(
		`app.metadataCache.getCache('Charted Roots/People/Cao-Cao.md')?.frontmatter?.cr_id === 'person-cao-cao'
			&& app.metadataCache.getCache('Charted Roots/Offices/Chancellor.md')?.frontmatter?.cr_id === 'office-han-chancellor'`
	);

	await session.evalInApp(`
		const folderPath = 'Charted Roots/Organizations';
		if (!app.vault.getAbstractFileByPath(folderPath)) {
			await app.vault.createFolder(folderPath);
		}
		for (const path of [
			"Charted Roots/Organizations/Han-Court-Historical-Card-E2E.md",
			"Charted Roots/Organizations/Cao-Group-Historical-Card-E2E.md"
		]) {
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing) await app.vault.delete(existing);
		}
		await app.vault.create(
			"Charted Roots/Organizations/Han-Court-Historical-Card-E2E.md",
			[
				'---',
				'cr_schema: 2',
				'cr_type: organization',
				'cr_id: e2e-historical-han-court',
				'name: 汉朝廷',
				'org_type: court',
				'---',
				'# 汉朝廷',
				'',
				'Temporary F5 institutional-state fixture.'
			].join('\\n')
		);
		await app.vault.create(
			"Charted Roots/Organizations/Cao-Group-Historical-Card-E2E.md",
			[
				'---',
				'cr_schema: 2',
				'cr_type: organization',
				'cr_id: e2e-historical-cao-group',
				'name: 曹操集团',
				'org_type: faction',
				'---',
				'# 曹操集团',
				'',
				'Temporary F5 possible-state fixture.'
			].join('\\n')
		);
		return true;
	`);

	await session.waitFor(
		`app.metadataCache.getCache("Charted Roots/Organizations/Han-Court-Historical-Card-E2E.md")?.frontmatter?.cr_id === 'e2e-historical-han-court'
			&& app.metadataCache.getCache("Charted Roots/Organizations/Cao-Group-Historical-Card-E2E.md")?.frontmatter?.cr_id === 'e2e-historical-cao-group'`
	);

	const setup = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const registry = plugin.getV2OntologyRegistry();
		if (!registry.hasPredicate('member_of')) {
			throw new Error('member_of predicate is unavailable.');
		}
		const assertionService = plugin.getAssertionService();
		const activeOffice = await assertionService.createAssertion({
			assertionType: 'office_holding',
			subject: '[[Charted Roots/People/Cao-Cao|曹操]]',
			predicate: 'holds_office',
			object: '[[Charted Roots/Offices/Chancellor|丞相]]',
			timeStart: '208 CE',
			timeEnd: '220 CE',
			timeStartPrecision: 'year',
			timeEndPrecision: 'year',
			confidence: 'high',
			title: '曹操任丞相 F5 E2E'
		}, { folder: 'Charted Roots/Assertions' });
		const activeAffiliation = await assertionService.createAssertion({
			assertionType: 'affiliation',
			subject: '[[Charted Roots/People/Cao-Cao|曹操]]',
			predicate: 'member_of',
			object: '[[Charted Roots/Organizations/Han-Court-Historical-Card-E2E|汉朝廷]]',
			timeStart: '196 CE',
			timeEnd: '220 CE',
			timeStartPrecision: 'year',
			timeEndPrecision: 'year',
			confidence: 'high',
			title: '曹操隶属汉朝廷 F5 E2E'
		}, { folder: 'Charted Roots/Assertions' });
		const possibleAffiliation = await assertionService.createAssertion({
			assertionType: 'affiliation',
			subject: '[[Charted Roots/People/Cao-Cao|曹操]]',
			predicate: 'member_of',
			object: '[[Charted Roots/Organizations/Cao-Group-Historical-Card-E2E|曹操集团]]',
			timeNotBefore: '207 CE',
			timeNotAfter: '209 CE',
			confidence: 'medium',
			researchStatus: 'provisional',
			title: '曹操集团可能隶属 F5 E2E'
		}, { folder: 'Charted Roots/Assertions' });

		const calendar = plugin.getHistoricalDateService().getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme historical calendar is unavailable.');
		const point208 = calendar.solarToJulianDay({ year: 208, month: 6, day: 1 });
		plugin.getTemporalFocusService().setPoint(point208, 'e2e-family-chart-f5');
		await plugin.activateFamilyChartView('person-cao-cao', true, true);

		return {
			activeOfficePath: activeOffice.path,
			activeAffiliationPath: activeAffiliation.path,
			possibleAffiliationPath: possibleAffiliation.path,
			point208
		};
	`);

	await session.waitFor(
		`app.metadataCache.getCache(${JSON.stringify(setup.activeOfficePath)})?.frontmatter?.assertion_type === 'office_holding'
			&& app.metadataCache.getCache(${JSON.stringify(setup.activeAffiliationPath)})?.frontmatter?.assertion_type === 'affiliation'
			&& app.metadataCache.getCache(${JSON.stringify(setup.possibleAffiliationPath)})?.frontmatter?.assertion_type === 'affiliation'`
	);

	await session.waitFor(
		`(() => {
			const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
			return !!view
				&& view.containerEl.querySelectorAll('.card_cont').length >= 2
				&& !!view.containerEl.querySelector('.cr-fcv-mode-select');
		})()`
	);

	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		const select = view?.containerEl.querySelector('.cr-fcv-mode-select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Family Chart mode selector is unavailable.');
		}
		select.value = 'historical';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		return true;
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const focus = root?.querySelector('.cr-fcv-historical-focus');
			return focus?.dataset.focusAxis === 'julian_day'
				&& focus?.dataset.focusSource === 'e2e-family-chart-f5'
				&& focus?.textContent?.includes('208 CE');
		})()`
	);

	const diagnostic = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		const service = plugin.getTemporalInstitutionStateService();
		const focus = plugin.getTemporalFocusService().get();
		const snapshot = focus?.kind === 'point' && service
			? service.getAt(focus.position)
			: { active: [], possible: [] };
		const simplify = entry => ({
			state: entry.state,
			kind: entry.relationKind,
			assertionId: entry.assertionId,
			subject: entry.subject?.crId ?? null,
			object: entry.object?.crId ?? null,
			label: entry.object?.label ?? null,
			filePath: entry.item?.filePath ?? null
		});
		const projected = view?.getHistoricalPersonCardStates?.().get('person-cao-cao');
		const root = view?.containerEl;
		const domState = root?.querySelector(
			'.cr-fcv-historical-card-state[data-cr-id="person-cao-cao"]'
		);
		return {
			focus,
			service: {
				active: snapshot.active.map(simplify),
				possible: snapshot.possible.map(simplify)
			},
			projected: projected ? {
				offices: projected.offices,
				affiliations: projected.affiliations,
				possibleCount: projected.possibleCount
			} : null,
			dom: domState ? {
				possibleCount: domState.getAttribute('data-possible-count'),
				text: domState.textContent,
				rows: [...domState.querySelectorAll('.cr-fcv-historical-card-state__row')]
					.map(row => ({
						kind: row.getAttribute('data-kind'),
						state: row.getAttribute('data-state'),
						assertionId: row.getAttribute('data-assertion-id'),
						text: row.textContent
					}))
			} : null,
			structuralIds: [...(root?.querySelectorAll('.card_cont') ?? [])]
				.map(card => card.__data__?.data?.id)
				.filter(Boolean)
		};
	`);
	assert.ok(
		diagnostic.service.active.length + diagnostic.service.possible.length > 0,
		'TemporalInstitutionStateService returned no institutional state at 208 CE'
	);
	assert.ok(
		diagnostic.projected,
		'Historical card-state projector returned no 曹操 state at 208 CE'
	);
	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			if (!root) return false;
			const state = root.querySelector(
				'.cr-fcv-historical-card-state[data-cr-id="person-cao-cao"]'
			);
			const office = state?.querySelector(
				'.cr-fcv-historical-card-state__row[data-kind="office_holding"][data-state="active"] text'
			);
			const affiliation = state?.querySelector(
				'.cr-fcv-historical-card-state__row[data-kind="affiliation"][data-state="active"] text'
			);
			const possible = state?.querySelector(
				'.cr-fcv-historical-card-state__possible-summary'
			);
			return !!state
				&& office?.textContent?.includes('丞相')
				&& affiliation?.textContent?.includes('汉朝廷')
				&& state.getAttribute('data-possible-count') === '1'
				&& possible?.textContent?.includes('1 possible');
		})()`
	);

	const cardState = await session.evalInApp(`
		const sample = () => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const state = root?.querySelector(
				'.cr-fcv-historical-card-state[data-cr-id="person-cao-cao"]'
			);
			return {
				office: state?.querySelector(
					'.cr-fcv-historical-card-state__row[data-kind="office_holding"][data-state="active"] text'
				)?.textContent ?? null,
				affiliation: state?.querySelector(
					'.cr-fcv-historical-card-state__row[data-kind="affiliation"][data-state="active"] text'
				)?.textContent ?? null,
				possibleCount: state?.getAttribute('data-possible-count') ?? null,
				renderedCount: root?.querySelector('.cr-fcv-chart-container')
					?.dataset.historicalStateCardCount ?? null
			};
		};
		let stable = 0;
		let previous = '';
		let current = sample();
		for (let frame = 0; frame < 90; frame++) {
			await new Promise(resolve => requestAnimationFrame(resolve));
			current = sample();
			const ready = current.office?.includes('丞相')
				&& current.affiliation?.includes('汉朝廷')
				&& current.possibleCount === '1';
			const key = JSON.stringify(current);
			stable = ready && key === previous ? stable + 1 : 0;
			previous = key;
			if (stable >= 4) break;
		}
		return current;
	`);
	assert.match(cardState.office ?? '', /丞相/);
	assert.match(cardState.affiliation ?? '', /汉朝廷/);
	assert.equal(cardState.possibleCount, '1');
	assert.ok(Number(cardState.renderedCount ?? '0') >= 1);

	await session.evalInApp(`
		const view = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view;
		view?.openInfoPanel?.('person-cao-cao');
		return true;
	`);

	await session.waitFor(
		`(() => {
			const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
			const section = root?.querySelector(
				'.cr-fcv-historical-state-section[data-cr-id="person-cao-cao"]'
			);
			if (!section) return false;
			const office = section.querySelector(
				'.cr-fcv-historical-state-item[data-kind="office_holding"][data-state="active"]'
			);
			const activeOrg = section.querySelector(
				'.cr-fcv-historical-state-item[data-kind="affiliation"][data-state="active"][data-confidence="high"]'
			);
			const possibleOrg = section.querySelector(
				'.cr-fcv-historical-state-item[data-kind="affiliation"][data-state="possible"][data-confidence="medium"]'
			);
			return !!office && !!activeOrg && !!possibleOrg;
		})()`
	);

	await session.screenshot(
		path.join(ARTIFACTS, 'v2-historical-family-chart-card-state.png')
	);

	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const button = root?.querySelector(
			'.cr-fcv-historical-state-item[data-kind="affiliation"][data-state="active"] '
			+ '.cr-fcv-historical-state-assertion'
		);
		if (!(button instanceof HTMLButtonElement)) {
			throw new Error('Historical state Assertion button is unavailable.');
		}
		button.click();
		return true;
	`);

	await session.waitFor(
		`app.workspace.getActiveFile()?.path === ${JSON.stringify(setup.activeAffiliationPath)}`
	);

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().clear();
		for (const path of [
			${JSON.stringify(setup.activeOfficePath)},
			${JSON.stringify(setup.activeAffiliationPath)},
			${JSON.stringify(setup.possibleAffiliationPath)},
			"Charted Roots/Organizations/Han-Court-Historical-Card-E2E.md",
			"Charted Roots/Organizations/Cao-Group-Historical-Card-E2E.md"
		]) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file) await app.vault.delete(file);
		}
		for (const leaf of app.workspace.getLeavesOfType('canvas-roots-family-chart')) {
			leaf.detach();
		}
		for (const leaf of app.workspace.getLeavesOfType('markdown')) {
			if (leaf.view?.file?.path === ${JSON.stringify(setup.activeAffiliationPath)}) {
				leaf.detach();
			}
		}
		return true;
	`);
});
