import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchObsidian } from './obsidian-harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VAULT = path.join(HERE, 'vault');
const ARTIFACTS = path.join(HERE, 'artifacts');

test('Charted Roots v2 foundation loads in real Obsidian', async (t) => {
	await mkdir(ARTIFACTS, { recursive: true });
	const session = await launchObsidian({ vault: VAULT });
	t.after(async () => session.close());

	const summary = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const person = app.vault.getAbstractFileByPath('People/Cao-Cao.md');
		const office = app.vault.getAbstractFileByPath('Offices/Chancellor.md');
		const assertion = app.vault.getAbstractFileByPath('Assertions/Cao-Cao-Chancellor.md');

		if (!person || !office || !assertion) {
			throw new Error('One or more v2 fixture notes are missing from the vault.');
		}

		const personFm = app.metadataCache.getFileCache(person)?.frontmatter ?? {};
		const officeFm = app.metadataCache.getFileCache(office)?.frontmatter ?? {};
		const assertionFm = app.metadataCache.getFileCache(assertion)?.frontmatter ?? {};

		await app.workspace.getLeaf(false).openFile(person);

		const registry = plugin.getV2OntologyRegistry();
		const assertionService = plugin.getAssertionService();
		const createdAssertion = await assertionService.createAssertion({
			assertionType: 'office_holding',
			subject: '[[People/Cao-Cao|曹操]]',
			predicate: 'holds_office',
			object: '[[Offices/Chancellor|丞相]]',
			timeStart: '建安十四年',
			timeStartPrecision: 'year',
			timeStartCertainty: 'certain',
			qualifiers: {
				organization: '[[汉朝廷]]'
			},
			title: '曹操任丞相 E2E'
		}, { folder: 'GeneratedAssertions' });
		const createdFm = app.metadataCache.getFileCache(createdAssertion)?.frontmatter ?? {};
		const assertions = assertionService.getAll();
		const invalidAssertions = assertionService.getInvalid();
		const touchingPerson = assertionService.getForFile(person);
		const lintIssues = plugin.getV2Linter().lint();
		const historicalTime = plugin.getHistoricalDateService();
		const bce453 = historicalTime.parse('BCE 453');
		const bce497 = historicalTime.parse('BCE 497');
		const exactDay = historicalTime.parse('2000-01-01');
		const tyme = historicalTime.getCalendarProvider('tyme');
		if (!tyme) throw new Error('Tyme calendar provider is not registered.');
		const lunarExample = tyme.solarToLunar({ year: 1986, month: 5, day: 29 });
		const solarRoundTrip = tyme.lunarToSolar(lunarExample);

		return {
			pluginLoaded: !!plugin,
			ontology: {
				packs: registry.listPacks(),
				clanLabelZhCN: registry.getTypeLabel('organization_type', 'clan', 'zh-CN'),
				politicalRivalLabel: registry.getPredicateLabel('political_rival', 'zh-CN'),
				validationErrors: registry.validate().filter(issue => issue.severity === 'error').length
			},
			assertionService: {
				validCount: assertions.length,
				invalidCount: invalidAssertions.length,
				predicates: assertions.map(record => record.assertion.predicate),
				touchingPersonCount: touchingPerson.length,
				createdPath: createdAssertion.path,
				createdFrontmatter: {
					cr_schema: createdFm.cr_schema,
					cr_type: createdFm.cr_type,
					assertion_type: createdFm.assertion_type,
					predicate: createdFm.predicate,
					time_start: createdFm.time_start,
					organization: createdFm.organization
				}
			},
			linter: {
				errorCount: lintIssues.filter(issue => issue.severity === 'error').length,
				warningCount: lintIssues.filter(issue => issue.severity === 'warning').length,
				issues: lintIssues
			},
			historicalTime: {
				providers: historicalTime.listProviders(),
				calendarProviders: historicalTime.listCalendarProviders(),
				bce453,
				exactDay,
				bceOrder: bce497.status === 'resolved' && bce453.status === 'resolved'
					? historicalTime.compare(bce497.value, bce453.value)
					: null,
				lunarExample,
				solarRoundTrip
			},
			fileCount: app.vault.getMarkdownFiles().length,
			person: {
				cr_schema: personFm.cr_schema,
				cr_type: personFm.cr_type,
				cr_id: personFm.cr_id,
				name: personFm.name
			},
			office: {
				cr_schema: officeFm.cr_schema,
				cr_type: officeFm.cr_type,
				cr_id: officeFm.cr_id,
				name: officeFm.name
			},
			assertion: {
				cr_schema: assertionFm.cr_schema,
				cr_type: assertionFm.cr_type,
				assertion_type: assertionFm.assertion_type,
				predicate: assertionFm.predicate,
				time_start: assertionFm.time_start
			}
		};
	`);

	assert.equal(summary.pluginLoaded, true);
	assert.deepEqual(summary.ontology.packs.sort(), ['chinese-history', 'core']);
	assert.equal(summary.ontology.clanLabelZhCN, '宗族');
	assert.equal(summary.ontology.politicalRivalLabel, '政治竞争');
	assert.equal(summary.ontology.validationErrors, 0);
	assert.equal(summary.assertionService.validCount, 2);
	assert.equal(summary.assertionService.invalidCount, 0);
	assert.deepEqual(summary.assertionService.predicates, ['holds_office', 'holds_office']);
	assert.equal(summary.assertionService.touchingPersonCount, 2);
	assert.match(summary.assertionService.createdPath, /^GeneratedAssertions\/曹操任丞相 E2E/);
	assert.equal(summary.assertionService.createdFrontmatter.cr_schema, 2);
	assert.equal(summary.assertionService.createdFrontmatter.cr_type, 'assertion');
	assert.equal(summary.assertionService.createdFrontmatter.assertion_type, 'office_holding');
	assert.equal(summary.assertionService.createdFrontmatter.predicate, 'holds_office');
	assert.equal(summary.assertionService.createdFrontmatter.time_start, '建安十四年');
	assert.equal(summary.assertionService.createdFrontmatter.organization, '[[汉朝廷]]');
	assert.equal(summary.linter.errorCount, 0);
	assert.equal(summary.linter.warningCount, 0);
	assert.deepEqual(summary.historicalTime.providers, ['bce-ce-year', 'solar-day']);
	assert.deepEqual(summary.historicalTime.calendarProviders, ['tyme']);
	assert.deepEqual(summary.historicalTime.lunarExample, {
		year: 1986,
		month: 4,
		day: 21,
		leapMonth: false
	});
	assert.deepEqual(summary.historicalTime.solarRoundTrip, {
		year: 1986,
		month: 5,
		day: 29
	});
	assert.equal(summary.historicalTime.exactDay.status, 'resolved');
	assert.equal(summary.historicalTime.exactDay.value.canonical.scale, 'julian_day');
	assert.equal(summary.historicalTime.exactDay.value.canonical.start, 2451544.5);
	assert.equal(summary.historicalTime.bce453.status, 'resolved');
	assert.equal(summary.historicalTime.bce453.value.canonical.start, -452);
	assert.equal(summary.historicalTime.bceOrder, -1);
	assert.equal(summary.person.cr_schema, 2);
	assert.equal(summary.person.cr_type, 'person');
	assert.equal(summary.person.cr_id, 'person-cao-cao');
	assert.equal(summary.office.cr_type, 'office');
	assert.equal(summary.assertion.cr_type, 'assertion');
	assert.equal(summary.assertion.assertion_type, 'office_holding');
	assert.equal(summary.assertion.predicate, 'holds_office');
	assert.equal(summary.assertion.time_start, '建安十三年');

	await session.screenshot(path.join(ARTIFACTS, 'v2-foundation-smoke.png'));
	await writeFile(
		path.join(ARTIFACTS, 'v2-foundation-smoke.json'),
		JSON.stringify(summary, null, 2)
	);
});
