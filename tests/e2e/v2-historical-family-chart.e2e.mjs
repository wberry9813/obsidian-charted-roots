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

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().setPoint(
			setup.point201,
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
	assert.equal(at201.rival, true);

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
			setup.allyPath,
			setup.rivalPath
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
