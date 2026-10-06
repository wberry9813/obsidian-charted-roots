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

	// Plugin load and MetadataCache population are independent in Obsidian.
	// Wait for fixture frontmatter explicitly so startup timing cannot make the
	// E2E test read a half-populated cache.
	await session.waitFor(
		`app.metadataCache.getCache('People/Cao-Cao.md')?.frontmatter?.cr_schema === 2
			&& app.metadataCache.getCache('Offices/Chancellor.md')?.frontmatter?.cr_type === 'office'
			&& app.metadataCache.getCache('Assertions/Cao-Cao-Chancellor.md')?.frontmatter?.cr_type === 'assertion'
			&& app.metadataCache.getCache('Legacy/Aligned-Person.md')?.frontmatter?.cr_type === 'person'
			&& app.metadataCache.getCache('Legacy/Broken-Membership.md')?.frontmatter?.cr_type === 'person'
			&& app.metadataCache.getCache('Legacy/Legacy-Event.md')?.frontmatter?.cr_type === 'event'
			&& app.metadataCache.getCache('Legacy/Legacy-Organization.md')?.frontmatter?.cr_type === 'organization'`
	);

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
		const semanticAssertions = plugin.getSemanticAssertionService().getForFile(person);
		const virtualFather = semanticAssertions.find(item =>
			item.origin === 'frontmatter' && item.predicate === 'father'
		);
		const lintIssues = plugin.getV2Linter().lint();

		const legacyAligned = app.vault.getAbstractFileByPath('Legacy/Aligned-Person.md');
		if (!legacyAligned) throw new Error('Legacy aligned fixture is missing.');
		const legacyBefore = JSON.stringify(
			app.metadataCache.getFileCache(legacyAligned)?.frontmatter ?? {}
		);
		const migrationReport = plugin.getV2MigrationAnalyzer().analyze();
		const migrationPreview = plugin.buildV2MigrationPreview();
		const legacyAfter = JSON.stringify(
			app.metadataCache.getFileCache(legacyAligned)?.frontmatter ?? {}
		);
		const alignedMigration = migrationReport.files.find(
			file => file.filePath === 'Legacy/Aligned-Person.md'
		);
		const brokenMigration = migrationReport.files.find(
			file => file.filePath === 'Legacy/Broken-Membership.md'
		);
		const eventMigration = migrationReport.files.find(
			file => file.filePath === 'Legacy/Legacy-Event.md'
		);
		const orgMigration = migrationReport.files.find(
			file => file.filePath === 'Legacy/Legacy-Organization.md'
		);

		const historicalTime = plugin.getHistoricalDateService();
		const bce453 = historicalTime.parse('BCE 453');
		const bce497 = historicalTime.parse('BCE 497');
		const exactDay = historicalTime.parse('2000-01-01');
		const year453 = historicalTime.parse('453 CE');
		const day453 = historicalTime.parse('453-06-01');
		const tyme = historicalTime.getCalendarProvider('tyme');
		if (!tyme) throw new Error('Tyme calendar provider is not registered.');
		const lunarExample = tyme.solarToLunar({ year: 1986, month: 5, day: 29 });
		const solarRoundTrip = tyme.lunarToSolar(lunarExample);

		// Exercise the actual Charted Roots Profile View, not only services.
		await plugin.activateProfileView(person);

		return {
			pluginLoaded: !!plugin,
			ontology: {
				packs: registry.listPacks(),
				clanLabelZhCN: registry.getTypeLabel('organization_type', 'clan', 'zh-CN'),
				politicalRivalLabel: registry.getPredicateLabel('political_rival', 'zh-CN'),
				validationErrors: registry.validate().filter(issue => issue.severity === 'error').length
			},
			semanticAssertions: {
				touchingPersonCount: semanticAssertions.length,
				origins: semanticAssertions.map(item => item.origin),
				virtualFather: virtualFather ? {
					subject: virtualFather.subject,
					object: virtualFather.object,
					predicate: virtualFather.predicate
				} : null
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
			migration: {
				filesScanned: migrationReport.filesScanned,
				filesWithLegacyData: migrationReport.filesWithLegacyData,
				safeConversions: migrationReport.safeConversions,
				reviewItems: migrationReport.reviewItems,
				blockers: migrationReport.blockers,
				legacyUnchanged: legacyBefore === legacyAfter,
				aligned: alignedMigration ? {
					fingerprint: alignedMigration.sourceFingerprint,
					codes: alignedMigration.findings.map(item => item.code),
					membershipRecords: alignedMigration.findings.find(
						item => item.code === 'membership_parallel_arrays'
					)?.details?.records ?? [],
					relationshipRecords: alignedMigration.findings.find(
						item => item.code === 'relationship_parallel_arrays'
					)?.details?.records ?? []
				} : null,
				brokenCodes: brokenMigration?.findings.map(item => item.code) ?? [],
				eventCodes: eventMigration?.findings.map(item => item.code) ?? [],
				orgCodes: orgMigration?.findings.map(item => item.code) ?? [],
				preview: {
					readyFiles: migrationPreview.readyFiles,
					reviewFiles: migrationPreview.reviewFiles,
					blockedFiles: migrationPreview.blockedFiles,
					canRunWithoutReview: migrationPreview.canRunWithoutReview,
					alignedFingerprint: migrationPreview.files.find(
						file => file.filePath === 'Legacy/Aligned-Person.md'
					)?.sourceFingerprint ?? null
				}
			},
			historicalTime: {
				providers: historicalTime.listProviders(),
				calendarProviders: historicalTime.listCalendarProviders(),
				bce453,
				exactDay,
				bceOrder: bce497.status === 'resolved' && bce453.status === 'resolved'
					? historicalTime.compare(bce497.value, bce453.value)
					: null,
				mixedPrecisionSameYear: year453.status === 'resolved' && day453.status === 'resolved'
					? historicalTime.compare(year453.value, day453.value)
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

	// Persist the service-layer snapshot before assertions so failures still
	// leave useful diagnostics in the workflow artifact.
	await writeFile(
		path.join(ARTIFACTS, 'v2-foundation-smoke.json'),
		JSON.stringify(summary, null, 2)
	);

	assert.equal(summary.pluginLoaded, true);
	assert.deepEqual(summary.ontology.packs.sort(), ['chinese-history', 'core']);
	assert.equal(summary.ontology.clanLabelZhCN, '宗族');
	assert.equal(summary.ontology.politicalRivalLabel, '政治竞争');
	assert.equal(summary.ontology.validationErrors, 0);
	assert.equal(summary.semanticAssertions.touchingPersonCount, 3);
	assert.deepEqual(summary.semanticAssertions.origins.sort(), ['assertion_note', 'assertion_note', 'frontmatter']);
	assert.equal(summary.semanticAssertions.virtualFather.predicate, 'father');
	assert.equal(summary.semanticAssertions.virtualFather.object, '[[People/Cao-Song|曹嵩]]');
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
	assert.equal(summary.migration.filesWithLegacyData, 4);
	assert.equal(summary.migration.safeConversions, 4);
	assert.equal(summary.migration.reviewItems, 2);
	assert.equal(summary.migration.blockers, 1);
	assert.equal(summary.migration.legacyUnchanged, true);
	assert.match(summary.migration.aligned.fingerprint, /^fnv1a32:/);
	assert.deepEqual(summary.migration.aligned.membershipRecords, [
		{
			org: '[[Legacy/Org-A|Org A]]',
			orgId: 'org-a',
			role: 'Ruler',
			from: '200',
			to: '209',
			notes: 'first'
		},
		{
			org: '[[Legacy/Org-B|Org B]]',
			orgId: 'org-b',
			role: 'Advisor',
			from: '210',
			notes: 'second'
		}
	]);
	assert.equal(summary.migration.aligned.relationshipRecords.length, 1);
	assert.equal(summary.migration.aligned.relationshipRecords[0].target, '[[People/Cao-Song|曹嵩]]');
	assert.ok(summary.migration.brokenCodes.includes('parallel_array_misaligned'));
	assert.ok(summary.migration.eventCodes.includes('legacy_date_precision'));
	assert.ok(summary.migration.orgCodes.includes('organization_members_mirror'));
	assert.deepEqual(summary.migration.preview, {
		readyFiles: 1,
		reviewFiles: 2,
		blockedFiles: 1,
		canRunWithoutReview: false,
		alignedFingerprint: summary.migration.aligned.fingerprint
	});
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
	assert.equal(summary.historicalTime.mixedPrecisionSameYear, 0);
	assert.equal(summary.person.cr_schema, 2);
	assert.equal(summary.person.cr_type, 'person');
	assert.equal(summary.person.cr_id, 'person-cao-cao');
	assert.equal(summary.office.cr_type, 'office');
	assert.equal(summary.assertion.cr_type, 'assertion');
	assert.equal(summary.assertion.assertion_type, 'office_holding');
	assert.equal(summary.assertion.predicate, 'holds_office');
	assert.equal(summary.assertion.time_start, '建安十三年');

	await session.waitFor(
		`[...document.querySelectorAll('.cr-profile__section-title')]
			.some(el => el.textContent === 'Structured assertions')`
	);
	const profileAssertionUi = await session.evalInApp(`
		const title = [...document.querySelectorAll('.cr-profile__section-title')]
			.find(el => el.textContent === 'Structured assertions');
		const section = title?.closest('.cr-profile__section');
		return {
			title: title?.textContent ?? null,
			text: section?.textContent ?? '',
			materializedRows: section?.querySelectorAll('.cr-profile__assertion-item').length ?? 0,
			virtualFatherRows: [...(section?.querySelectorAll('.cr-profile__assertion-predicate') ?? [])]
				.filter(el => el.textContent?.includes('Father')).length
		};
	`);
	assert.equal(profileAssertionUi.title, 'Structured assertions');
	assert.equal(profileAssertionUi.materializedRows, 2);
	assert.match(profileAssertionUi.text, /Holds office/i);
	assert.match(profileAssertionUi.text, /丞相/);
	assert.match(profileAssertionUi.text, /建安十三年/);
	assert.match(profileAssertionUi.text, /建安十四年/);
	assert.equal(profileAssertionUi.virtualFatherRows, 0);

	await session.screenshot(path.join(ARTIFACTS, 'v2-person-profile.png'));

	// Navigate the same real Profile View to the Office entity and verify that
	// incoming office-holding Assertions are projected back onto the Office.
	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const office = app.vault.getAbstractFileByPath('Offices/Chancellor.md');
		if (!office) throw new Error('Office fixture is missing.');
		await plugin.activateProfileView(office);
		return true;
	`);

	await session.waitFor(
		`document.querySelector('.cr-profile__type-badge')?.textContent === 'Office'
			&& document.querySelector('.cr-profile__header-name')?.textContent?.includes('丞相')
			&& [...document.querySelectorAll('.cr-profile__section-title')]
				.some(el => el.textContent === 'Structured assertions')`
	);

	const officeProfileUi = await session.evalInApp(`
		const title = [...document.querySelectorAll('.cr-profile__section-title')]
			.find(el => el.textContent === 'Structured assertions');
		const section = title?.closest('.cr-profile__section');
		return {
			typeBadge: document.querySelector('.cr-profile__type-badge')?.textContent ?? null,
			name: document.querySelector('.cr-profile__header-name')?.textContent ?? '',
			meta: document.querySelector('.cr-profile__header-meta')?.textContent ?? '',
			assertionText: section?.textContent ?? '',
			materializedRows: section?.querySelectorAll('.cr-profile__assertion-item').length ?? 0,
			predicates: [...(section?.querySelectorAll('.cr-profile__assertion-predicate') ?? [])]
				.map(el => el.textContent ?? ''),
			targets: [...(section?.querySelectorAll('.cr-profile__assertion-target') ?? [])]
				.map(el => el.textContent ?? '')
		};
	`);

	assert.equal(officeProfileUi.typeBadge, 'Office');
	assert.match(officeProfileUi.name, /丞相/);
	assert.match(officeProfileUi.meta, /Central government/i);
	assert.equal(officeProfileUi.materializedRows, 2);
	assert.equal(officeProfileUi.predicates.filter(text => /Holds office/i.test(text)).length, 2);
	assert.deepEqual(officeProfileUi.targets, ['曹操', '曹操']);
	assert.match(officeProfileUi.assertionText, /建安十三年/);
	assert.match(officeProfileUi.assertionText, /建安十四年/);

	await session.screenshot(path.join(ARTIFACTS, 'v2-office-profile.png'));
});
