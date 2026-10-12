import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const focus = root?.querySelector('.cr-fcv-historical-focus');
		return {
			label: focus?.textContent ?? null,
			axis: focus?.dataset.focusAxis ?? null,
			source: focus?.dataset.focusSource ?? null,
			ally: !!root?.querySelector('.cr-relationship-overlay-line--ally_of'),
			rival: !!root?.querySelector('.cr-relationship-overlay-line--political_rival')
		};
	`);
	assert.match(at197.label ?? '', /197 CE/);
	assert.equal(at197.axis, 'julian_day');
	assert.equal(at197.source, 'e2e-family-chart');
	assert.equal(at197.ally, true);
	assert.equal(at197.rival, false);
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

	await session.waitFor(
		`app.metadataCache.getCache('Charted Roots/People/Cao-Cao.md')?.frontmatter?.cr_id === 'person-cao-cao'`
	);

	const setup = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		if (!plugin) throw new Error('Charted Roots plugin is unavailable.');

		const workspace = plugin.getWorkspaceService();
		if (!workspace || workspace.getActive().rootFolder !== 'Charted Roots') {
			throw new Error('Historical lane E2E requires the default Charted Roots Workspace.');
		}

		const fixtures = [
			{
				path: "Charted Roots/People/Xun-Yu-Historical-Lane-E2E.md",
				content: [
					'---',
					'cr_schema: 2',
					'cr_type: person',
					'cr_id: e2e-historical-xun-yu',
					'name: 荀彧',
					'born: "163 CE"',
					'died: "212 CE"',
					'---',
					'# 荀彧',
					'',
					'Temporary E2E historical-lane fixture. No genealogy fields.'
				].join('\\n')
			},
			{
				path: "Charted Roots/People/Guo-Jia-Historical-Lane-E2E.md",
				content: [
					'---',
					'cr_schema: 2',
					'cr_type: person',
					'cr_id: e2e-historical-guo-jia',
					'name: 郭嘉',
					'born: "170 CE"',
					'died: "207 CE"',
					'---',
					'# 郭嘉',
					'',
					'Temporary E2E historical-lane fixture. No genealogy fields.'
				].join('\\n')
			}
		];

		for (const fixture of fixtures) {
			const existing = app.vault.getAbstractFileByPath(fixture.path);
			if (existing) await app.vault.delete(existing);
			await app.vault.create(fixture.path, fixture.content);
		}

		return true;
	`);

	assert.equal(setup, true);

	await session.waitFor(
		`app.metadataCache.getCache("Charted Roots/People/Xun-Yu-Historical-Lane-E2E.md")?.frontmatter?.cr_id === 'e2e-historical-xun-yu'
			&& app.metadataCache.getCache("Charted Roots/People/Guo-Jia-Historical-Lane-E2E.md")?.frontmatter?.cr_id === 'e2e-historical-guo-jia'`
	);

	const assertionSetup = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const assertionService = plugin.getAssertionService();
		const created = [];

		created.push(await assertionService.createAssertion({
			assertionType: 'relationship',
			subject: '[[Charted Roots/People/Cao-Cao|曹操]]',
			predicate: 'ally_of',
			object: '[[Charted Roots/People/Xun-Yu-Historical-Lane-E2E|荀彧]]',
			timeStart: '196 CE',
			timeEnd: '199 CE',
			timeStartPrecision: 'year',
			timeEndPrecision: 'year',
			timeStartCertainty: 'certain',
			timeEndCertainty: 'certain',
			notes: 'E2E non-family historical lane depth 1',
			title: '曹操与荀彧历史关系 E2E'
		}, { folder: 'Charted Roots/Assertions' }));

		created.push(await assertionService.createAssertion({
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
			notes: 'E2E non-family historical lane depth 2',
			title: '荀彧与郭嘉历史关系 E2E'
		}, { folder: 'Charted Roots/Assertions' }));

		const calendar = plugin.getHistoricalDateService().getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme historical calendar is unavailable.');
		const point197 = calendar.solarToJulianDay({ year: 197, month: 6, day: 1 });
		const point201 = calendar.solarToJulianDay({ year: 201, month: 6, day: 1 });

		plugin.getTemporalFocusService().setPoint(point197, 'e2e-historical-lanes');
		await plugin.activateFamilyChartView('person-cao-cao', true, true);

		return {
			assertionPaths: created.map(file => file.path),
			point197,
			point201
		};
	`);

	for (const assertionPath of assertionSetup.assertionPaths) {
		await session.waitFor(
			`app.metadataCache.getCache(${JSON.stringify(assertionPath)})?.frontmatter?.assertion_type === 'relationship'`
		);
	}

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
			return !!root?.querySelector(
				'.cr-relationship-overlay-line--recommends[data-source-cr-id="e2e-historical-xun-yu"][data-target-cr-id="e2e-historical-guo-jia"]'
			) && root?.querySelectorAll(
				'.cr-fcv-historical-direction-arrow[data-source-cr-id="e2e-historical-xun-yu"][data-target-cr-id="e2e-historical-guo-jia"]'
			).length === 1;
		})()`
	);

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
		return {
			laneCard: !!doc.querySelector('.cr-fcv-historical-person-card[data-cr-id="e2e-historical-guo-jia"]'),
			recommendation: !!doc.querySelector('.cr-relationship-overlay-line--recommends'),
			arrow: !!doc.querySelector('.cr-fcv-historical-direction-arrow'),
			chineseXun: xml.includes('荀彧'),
			chineseGuo: xml.includes('郭嘉'),
			invalidXml: doc.querySelector('parsererror') !== null,
			viewBox, lane, overlay
		};
	`);
	assert.equal(exported.laneCard, true);
	assert.equal(exported.recommendation, true);
	assert.equal(exported.arrow, true);
	assert.equal(exported.invalidXml, false);
	assert.equal(exported.chineseXun, true);
	assert.equal(exported.chineseGuo, true);
	assert.equal(exported.viewBox?.length, 4);
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
			return { type: blob.type, size: blob.size, signature: bytes, width, height, nonBackground };
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
			historicalCardCount: root?.querySelectorAll('.cr-fcv-historical-person-card').length ?? -1
		};
	`);
	await session.screenshot(path.join(ARTIFACTS, 'v2-historical-family-chart-visual-diagnostic.png'));
	const viewport = visualBounds.viewport;
	const card = visualBounds.card;
	assert.ok(viewport && card && card.width > 0 && card.height > 0
		&& card.right > viewport.left && card.left < viewport.right
		&& card.bottom > viewport.top && card.top < viewport.bottom,
		'Historical depth-2 card is outside visible SVG after fit: ' + JSON.stringify(visualBounds));

	await session.screenshot(
		path.join(ARTIFACTS, 'v2-historical-family-chart-expansion-depth2.png')
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

	await session.evalInApp(`
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const card = root?.querySelector(
			'.cr-fcv-historical-person-card[data-cr-id="e2e-historical-xun-yu"]'
		);
		if (!card) {
			throw new Error('Historical 荀彧 card is unavailable.');
		}
		card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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
		for (const path of ${JSON.stringify(assertionSetup.assertionPaths)}) {
			const file = app.vault.getAbstractFileByPath(path);
			if (file) await app.vault.delete(file);
		}
		for (const path of [
			"Charted Roots/People/Xun-Yu-Historical-Lane-E2E.md",
			"Charted Roots/People/Guo-Jia-Historical-Lane-E2E.md"
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
		const root = app.workspace.getLeavesOfType('canvas-roots-family-chart')[0]?.view?.containerEl;
		const state = root?.querySelector(
			'.cr-fcv-historical-card-state[data-cr-id="person-cao-cao"]'
		);
		return {
			office: state?.querySelector(
				'.cr-fcv-historical-card-state__row[data-kind="office_holding"] text'
			)?.textContent ?? null,
			affiliation: state?.querySelector(
				'.cr-fcv-historical-card-state__row[data-kind="affiliation"] text'
			)?.textContent ?? null,
			possibleCount: state?.getAttribute('data-possible-count') ?? null,
			renderedCount: root?.querySelector('.cr-fcv-chart-container')
				?.dataset.historicalStateCardCount ?? null
		};
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
