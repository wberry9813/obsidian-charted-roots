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
		`app.metadataCache.getCache('Charted Roots/People/Cao-Cao.md')?.frontmatter?.cr_schema === 2
			&& app.metadataCache.getCache('Charted Roots/Offices/Chancellor.md')?.frontmatter?.cr_type === 'office'
			&& app.metadataCache.getCache('Charted Roots/Assertions/Cao-Cao-Chancellor.md')?.frontmatter?.cr_type === 'assertion'
			&& app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.cr_type === 'person'
			&& app.metadataCache.getCache('Charted Roots/Legacy/Broken-Membership.md')?.frontmatter?.cr_type === 'person'
			&& app.metadataCache.getCache('Charted Roots/Legacy/Legacy-Event.md')?.frontmatter?.cr_type === 'event'
			&& app.metadataCache.getCache('Charted Roots/Legacy/Legacy-Organization.md')?.frontmatter?.cr_type === 'organization'`
	);

	const summary = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const person = app.vault.getAbstractFileByPath('Charted Roots/People/Cao-Cao.md');
		const office = app.vault.getAbstractFileByPath('Charted Roots/Offices/Chancellor.md');
		const assertion = app.vault.getAbstractFileByPath('Charted Roots/Assertions/Cao-Cao-Chancellor.md');

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
		});
		const createdFm = app.metadataCache.getFileCache(createdAssertion)?.frontmatter ?? {};
		const assertions = assertionService.getAll();
		const invalidAssertions = assertionService.getInvalid();
		const touchingPerson = assertionService.getForFile(person);
		const semanticAssertions = plugin.getSemanticAssertionService().getForFile(person);
		const virtualFather = semanticAssertions.find(item =>
			item.origin === 'frontmatter' && item.predicate === 'father'
		);
		const lintIssues = plugin.getV2Linter().lint();

		const legacyAligned = app.vault.getAbstractFileByPath('Charted Roots/Legacy/Aligned-Person.md');
		if (!legacyAligned) throw new Error('Legacy aligned fixture is missing.');
		const legacyBefore = JSON.stringify(
			app.metadataCache.getFileCache(legacyAligned)?.frontmatter ?? {}
		);
		const migrationReport = plugin.getV2MigrationAnalyzer().analyze();
		const migrationPreview = plugin.buildV2MigrationPreview();
		const migrationPlan = plugin.buildV2MigrationPlan();
		const legacyAfter = JSON.stringify(
			app.metadataCache.getFileCache(legacyAligned)?.frontmatter ?? {}
		);
		const alignedMigration = migrationReport.files.find(
			file => file.filePath === 'Charted Roots/Legacy/Aligned-Person.md'
		);
		const brokenMigration = migrationReport.files.find(
			file => file.filePath === 'Charted Roots/Legacy/Broken-Membership.md'
		);
		const eventMigration = migrationReport.files.find(
			file => file.filePath === 'Charted Roots/Legacy/Legacy-Event.md'
		);
		const orgMigration = migrationReport.files.find(
			file => file.filePath === 'Charted Roots/Legacy/Legacy-Organization.md'
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
						file => file.filePath === 'Charted Roots/Legacy/Aligned-Person.md'
					)?.sourceFingerprint ?? null
				},
				plan: {
					executableFiles: migrationPlan.executableFiles,
					reviewFiles: migrationPlan.reviewFiles,
					blockedFiles: migrationPlan.blockedFiles,
					operationCount: migrationPlan.operationCount,
					aligned: migrationPlan.files.find(
						file => file.filePath === 'Charted Roots/Legacy/Aligned-Person.md'
					) ?? null
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
	assert.equal(summary.semanticAssertions.virtualFather.object, '[[Charted Roots/People/Cao-Song|曹嵩]]');
	assert.equal(summary.assertionService.validCount, 2);
	assert.equal(summary.assertionService.invalidCount, 0);
	assert.deepEqual(summary.assertionService.predicates, ['holds_office', 'holds_office']);
	assert.equal(summary.assertionService.touchingPersonCount, 2);
	assert.match(summary.assertionService.createdPath, /^Charted Roots\/Assertions\/曹操任丞相 E2E/);
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
			org: '[[Charted Roots/Legacy/Org-A|Org A]]',
			orgId: 'org-a',
			role: 'Ruler',
			from: '200',
			to: '209',
			notes: 'first'
		},
		{
			org: '[[Charted Roots/Legacy/Org-B|Org B]]',
			orgId: 'org-b',
			role: 'Advisor',
			from: '210',
			notes: 'second'
		}
	]);
	assert.equal(summary.migration.aligned.relationshipRecords.length, 1);
	assert.equal(summary.migration.aligned.relationshipRecords[0].target, '[[Charted Roots/People/Cao-Song|曹嵩]]');
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
	assert.equal(summary.migration.plan.executableFiles, 1);
	assert.equal(summary.migration.plan.reviewFiles, 2);
	assert.equal(summary.migration.plan.blockedFiles, 1);
	assert.equal(summary.migration.plan.operationCount, 4);
	assert.equal(summary.migration.plan.aligned.status, 'ready');
	assert.equal(
		summary.migration.plan.aligned.operations.filter(operation => operation.kind === 'create_assertion').length,
		3
	);
	assert.equal(
		summary.migration.plan.aligned.operations.find(
			operation => operation.kind === 'create_assertion' && operation.draft.predicate === 'mentor'
		)?.draft.object,
		'[[Charted Roots/People/Cao-Song|曹嵩]]'
	);
	assert.equal(
		summary.migration.plan.aligned.operations.at(-1).kind,
		'rewrite_frontmatter'
	);
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
		const office = app.vault.getAbstractFileByPath('Charted Roots/Offices/Chancellor.md');
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

	// Exercise the user-visible read-only migration preview command.
	await session.evalInApp(`
		const ok = app.commands.executeCommandById('charted-roots:preview-v2-migration');
		if (!ok) throw new Error('Migration preview command was not registered.');
		return true;
	`);

	await session.waitFor(
		`document.querySelector('.cr-v2-migration-preview__title')?.textContent
			=== 'Schema v2 migration preview'`
	);

	const migrationPreviewUi = await session.evalInApp(`
		const root = document.querySelector('.cr-v2-migration-preview');
		return {
			text: root?.textContent ?? '',
			paths: [...(root?.querySelectorAll('.cr-v2-migration-preview__file-path') ?? [])]
				.map(el => el.textContent ?? ''),
			statuses: [...(root?.querySelectorAll('.cr-v2-migration-preview__status') ?? [])]
				.map(el => el.textContent ?? ''),
			buttons: [...(root?.querySelectorAll('button') ?? [])]
				.map(el => el.textContent ?? '')
		};
	`);

	assert.deepEqual(migrationPreviewUi.paths, [
		'Charted Roots/Legacy/Broken-Membership.md',
		'Charted Roots/Legacy/Legacy-Event.md',
		'Charted Roots/Legacy/Legacy-Organization.md',
		'Charted Roots/Legacy/Aligned-Person.md'
	]);
	assert.deepEqual(migrationPreviewUi.statuses, [
		'Blocked',
		'Review required',
		'Review required',
		'Ready'
	]);
	assert.match(migrationPreviewUi.text, /Preview only\. Nothing changes until you explicitly confirm migration of Ready files\./);
	assert.match(migrationPreviewUi.text, /Parallel fields for "membership_orgs" are misaligned/);
	assert.match(migrationPreviewUi.text, /Legacy date_precision mixes precision/);
	assert.deepEqual(migrationPreviewUi.buttons, ['Migrate 1 ready file…', 'Close']);

	await session.screenshot(path.join(ARTIFACTS, 'v2-migration-preview.png'));

	// Enter the second confirmation step but cancel before execution. The
	// legacy source must remain untouched until the explicit execute click.
	await session.evalInApp(`
		document.querySelector('.cr-v2-migration-preview__migrate')?.click();
		return true;
	`);
	await session.waitFor(
		`document.querySelector('.cr-v2-migration-confirm__title')?.textContent
			=== 'Confirm Schema v2 migration'`
	);

	const migrationConfirmUi = await session.evalInApp(`
		const root = document.querySelector('.cr-v2-migration-confirm');
		return {
			text: root?.textContent ?? '',
			buttons: [...(root?.querySelectorAll('button') ?? [])]
				.map(el => el.textContent ?? ''),
			sourceStillLegacy:
				app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.membership_orgs?.length === 2
		};
	`);
	assert.match(migrationConfirmUi.text, /This will migrate 1 Ready file\./);
	assert.match(migrationConfirmUi.text, /3 Review\/Blocked files will remain unchanged\./);
	assert.match(migrationConfirmUi.text, /Exact source Markdown is backed up before any mutation\./);
	assert.match(migrationConfirmUi.text, /\.charted-roots\/migration\//);
	assert.deepEqual(migrationConfirmUi.buttons, ['Cancel', 'Migrate 1 ready file']);
	assert.equal(migrationConfirmUi.sourceStillLegacy, true);

	await session.screenshot(path.join(ARTIFACTS, 'v2-migration-confirm.png'));
	await session.evalInApp(`
		document.querySelector('.cr-v2-migration-confirm__cancel')?.click();
		return true;
	`);

	// Validate the stale-plan guard against live Markdown rather than metadata
	// cache state. The same frozen plan must become invalid immediately after
	// a source edit, then the fixture is restored for artifact cleanliness.
	const staleGuard = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const plan = plugin.buildV2MigrationPlan();
		const fresh = await plugin.validateV2MigrationPlan(plan);
		const file = app.vault.getAbstractFileByPath('Charted Roots/Legacy/Aligned-Person.md');
		if (!file) throw new Error('Aligned legacy fixture is missing.');

		await app.fileManager.processFrontMatter(file, fm => {
			fm.__e2e_stale_marker = 'changed-after-plan';
		});
		const stale = await plugin.validateV2MigrationPlan(plan);

		await app.fileManager.processFrontMatter(file, fm => {
			delete fm.__e2e_stale_marker;
		});

		return { fresh, stale };
	`);

	assert.deepEqual(staleGuard.fresh, {
		valid: true,
		checkedFiles: 1,
		issues: []
	});
	assert.equal(staleGuard.stale.valid, false);
	assert.equal(staleGuard.stale.checkedFiles, 1);
	assert.equal(staleGuard.stale.issues.length, 1);
	assert.equal(staleGuard.stale.issues[0].code, 'stale_source');
	assert.equal(staleGuard.stale.issues[0].filePath, 'Charted Roots/Legacy/Aligned-Person.md');
	assert.match(staleGuard.stale.issues[0].expectedFingerprint, /^fnv1a32:/);
	assert.match(staleGuard.stale.issues[0].actualFingerprint, /^fnv1a32:/);
	assert.notEqual(
		staleGuard.stale.issues[0].expectedFingerprint,
		staleGuard.stale.issues[0].actualFingerprint
	);

	// Wait until MetadataCache catches up with the restored source before
	// building the next plan.
	await session.waitFor(
		`app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.membership_orgs?.length === 2
			&& app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.cr_schema !== 2
			&& !('__e2e_stale_marker' in (app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter ?? {}))`
	);

	// Inject a failure only when the executor tries to mark the migration
	// manifest completed. This happens after Assertions and source rewrites,
	// so a successful rollback proves both sides of the transaction recover.
	const rollbackRun = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const plan = plugin.buildV2MigrationPlan();
		const source = app.vault.getAbstractFileByPath('Charted Roots/Legacy/Aligned-Person.md');
		if (!source) throw new Error('Aligned legacy fixture is missing.');
		const originalSource = await app.vault.read(source);
		const adapter = app.vault.adapter;
		const originalWrite = adapter.write.bind(adapter);

		adapter.write = async (path, data, options) => {
			if (
				path.endsWith('/manifest.json')
				&& typeof data === 'string'
				&& data.includes('"status": "completed"')
			) {
				throw new Error('E2E injected completion-manifest failure');
			}
			return originalWrite(path, data, options);
		};

		let result;
		try {
			result = await plugin.executeV2MigrationReady(plan, {
				runId: 'e2e-rollback',
				assertionFolder: 'Charted Roots/Assertions/Rollback-E2E',
				backupRoot: '.charted-roots/e2e-migration'
			});
		} finally {
			adapter.write = originalWrite;
		}

		const restoredSource = await app.vault.read(source);
		const remainingAssertions = app.vault.getMarkdownFiles()
			.filter(file => file.path.startsWith('Charted Roots/Assertions/Rollback-E2E/'))
			.map(file => file.path);
		const manifest = JSON.parse(await adapter.read(
			'.charted-roots/e2e-migration/e2e-rollback/manifest.json'
		));
		const backupSource = await adapter.read(
			'.charted-roots/e2e-migration/e2e-rollback/originals/Charted Roots/Legacy/Aligned-Person.md'
		);

		return {
			result,
			sourceRestoredExactly: originalSource === restoredSource,
			backupMatchesOriginal: backupSource === originalSource,
			remainingAssertions,
			manifestStatus: manifest.status,
			manifestCreatedAssertions: manifest.createdAssertionPaths
		};
	`);

	assert.equal(rollbackRun.result.success, false);
	assert.equal(rollbackRun.result.rolledBack, true);
	assert.equal(rollbackRun.result.filesMigrated, 0);
	assert.equal(rollbackRun.result.assertionsCreated, 0);
	assert.equal(rollbackRun.result.rewrittenFiles, 0);
	assert.deepEqual(rollbackRun.result.createdAssertionPaths, []);
	assert.match(
		rollbackRun.result.errors.map(error => error.message).join(' '),
		/E2E injected completion-manifest failure/
	);
	assert.equal(rollbackRun.sourceRestoredExactly, true);
	assert.equal(rollbackRun.backupMatchesOriginal, true);
	assert.deepEqual(rollbackRun.remainingAssertions, []);
	assert.equal(rollbackRun.manifestStatus, 'rolled_back');
	assert.equal(rollbackRun.manifestCreatedAssertions.length, 3);

	await session.waitFor(
		`app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.membership_orgs?.length === 2
			&& app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.mentor?.length === 1
			&& app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.cr_schema !== 2`
	);

	// Execute the same ready migration normally.
	const successRun = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const plan = plugin.buildV2MigrationPlan();
		const source = app.vault.getAbstractFileByPath('Charted Roots/Legacy/Aligned-Person.md');
		if (!source) throw new Error('Aligned legacy fixture is missing.');
		const originalSource = await app.vault.read(source);

		const result = await plugin.executeV2MigrationReady(plan, {
			runId: 'e2e-success',
			assertionFolder: 'Charted Roots/Assertions/Migrated-E2E',
			backupRoot: '.charted-roots/e2e-migration'
		});

		const adapter = app.vault.adapter;
		const manifest = JSON.parse(await adapter.read(
			'.charted-roots/e2e-migration/e2e-success/manifest.json'
		));
		const backupSource = await adapter.read(
			'.charted-roots/e2e-migration/e2e-success/originals/Charted Roots/Legacy/Aligned-Person.md'
		);

		return {
			result,
			backupMatchesOriginal: backupSource === originalSource,
			manifestStatus: manifest.status,
			manifestCreatedAssertions: manifest.createdAssertionPaths
		};
	`);

	assert.equal(successRun.result.success, true);
	assert.equal(successRun.result.rolledBack, false);
	assert.equal(successRun.result.filesMigrated, 1);
	assert.equal(successRun.result.assertionsCreated, 3);
	assert.equal(successRun.result.rewrittenFiles, 1);
	assert.equal(successRun.result.createdAssertionPaths.length, 3);
	assert.equal(successRun.backupMatchesOriginal, true);
	assert.equal(successRun.manifestStatus, 'completed');
	assert.equal(successRun.manifestCreatedAssertions.length, 3);

	await session.waitFor(
		`app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.cr_schema === 2
			&& !app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.membership_orgs
			&& !app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter?.mentor`
	);

	const migratedState = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const sourceFm = app.metadataCache.getCache('Charted Roots/Legacy/Aligned-Person.md')?.frontmatter ?? {};
		const migrated = plugin.getAssertionService().getAll()
			.filter(record => record.filePath.startsWith('Charted Roots/Assertions/Migrated-E2E/'))
			.map(record => ({
				path: record.filePath,
				type: record.assertion.assertion_type,
				predicate: record.assertion.predicate,
				subject: record.assertion.subject,
				object: record.assertion.object,
				role: record.raw.role,
				start: record.assertion.time_start,
				end: record.assertion.time_end
			}))
			.sort((a, b) => a.predicate.localeCompare(b.predicate) || (a.object ?? '').localeCompare(b.object ?? ''));

		const remainingReport = plugin.getV2MigrationAnalyzer().analyze();
		return {
			source: {
				cr_schema: sourceFm.cr_schema,
				cr_type: sourceFm.cr_type,
				cr_id: sourceFm.cr_id,
				name: sourceFm.name,
				hasMembership: !!sourceFm.membership_orgs,
				hasMentor: !!sourceFm.mentor
			},
			migrated,
			remainingLegacyPaths: remainingReport.files.map(file => file.filePath).sort(),
			blockedStillUntouched:
				app.metadataCache.getCache('Charted Roots/Legacy/Broken-Membership.md')?.frontmatter?.membership_orgs?.length === 3,
			reviewEventStillUntouched:
				app.metadataCache.getCache('Charted Roots/Legacy/Legacy-Event.md')?.frontmatter?.date_precision === 'exact'
		};
	`);

	assert.deepEqual(migratedState.source, {
		cr_schema: 2,
		cr_type: 'person',
		cr_id: 'legacy-aligned-person',
		name: 'Legacy Aligned Person',
		hasMembership: false,
		hasMentor: false
	});
	assert.equal(migratedState.migrated.length, 3);
	assert.deepEqual(
		migratedState.migrated.filter(item => item.predicate === 'member_of').map(item => ({
			type: item.type,
			object: item.object,
			role: item.role,
			start: item.start,
			end: item.end
		})),
		[
			{
				type: 'affiliation',
				object: '[[Charted Roots/Legacy/Org-A|Org A]]',
				role: 'Ruler',
				start: '200',
				end: '209'
			},
			{
				type: 'affiliation',
				object: '[[Charted Roots/Legacy/Org-B|Org B]]',
				role: 'Advisor',
				start: '210',
				end: undefined
			}
		]
	);
	const migratedMentor = migratedState.migrated.find(item => item.predicate === 'mentor');
	assert.ok(migratedMentor);
	assert.equal(migratedMentor.type, 'relationship');
	assert.equal(migratedMentor.predicate, 'mentor');
	assert.equal(migratedMentor.subject, '[[Charted Roots/Legacy/Aligned-Person]]');
	assert.equal(migratedMentor.object, '[[Charted Roots/People/Cao-Song|曹嵩]]');
	assert.equal(migratedMentor.start, '205');
	assert.equal(migratedMentor.end, '215');
	assert.deepEqual(migratedState.remainingLegacyPaths, [
		'Charted Roots/Legacy/Broken-Membership.md',
		'Charted Roots/Legacy/Legacy-Event.md',
		'Charted Roots/Legacy/Legacy-Organization.md'
	]);
	assert.equal(migratedState.blockedStillUntouched, true);
	assert.equal(migratedState.reviewEventStillUntouched, true);

	await session.screenshot(path.join(ARTIFACTS, 'v2-migration-executed.png'));

	// Finally exercise the complete user-facing execution path on a fresh
	// dynamically-created legacy note: Command -> Preview -> Confirm -> Execute.
	await session.evalInApp(`
		const existing = app.vault.getAbstractFileByPath('Charted Roots/Legacy/Ui-Ready.md');
		if (existing) await app.vault.delete(existing);
		await app.vault.create('Charted Roots/Legacy/Ui-Ready.md', [
			'---',
			'cr_type: person',
			'cr_id: legacy-ui-ready',
			'name: UI Ready Person',
			'membership_orgs:',
			'  - "[[Charted Roots/Legacy/Org-A|Org A]]"',
			'membership_org_ids:',
			'  - org-a',
			'membership_roles:',
			'  - Tester',
			'---',
			'',
			'# UI Ready Person',
			''
		].join('\\n'));
		return true;
	`);

	await session.waitFor(
		`app.metadataCache.getCache('Charted Roots/Legacy/Ui-Ready.md')?.frontmatter?.membership_orgs?.length === 1`
	);

	await session.evalInApp(`
		const ok = app.commands.executeCommandById('charted-roots:preview-v2-migration');
		if (!ok) throw new Error('Migration preview command was not registered.');
		return true;
	`);
	await session.waitFor(
		`document.querySelector('.cr-v2-migration-preview__migrate')?.textContent
			=== 'Migrate 1 ready file…'`
	);

	await session.evalInApp(`
		document.querySelector('.cr-v2-migration-preview__migrate')?.click();
		return true;
	`);
	await session.waitFor(
		`document.querySelector('.cr-v2-migration-confirm__execute')?.textContent
			=== 'Migrate 1 ready file'`
	);

	await session.evalInApp(`
		document.querySelector('.cr-v2-migration-confirm__execute')?.click();
		return true;
	`);

	await session.waitFor(
		`app.metadataCache.getCache('Charted Roots/Legacy/Ui-Ready.md')?.frontmatter?.cr_schema === 2
			&& !app.metadataCache.getCache('Charted Roots/Legacy/Ui-Ready.md')?.frontmatter?.membership_orgs
			&& document.querySelector('.cr-v2-migration-preview__title')?.textContent
				=== 'Schema v2 migration preview'
			&& document.querySelector('.cr-v2-migration-preview')?.textContent?.includes('0 Ready')
			&& !document.querySelector('.cr-v2-migration-preview__migrate')`,
		{ timeout: 90000 }
	);

	const uiExecution = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const sourceFm = app.metadataCache.getCache('Charted Roots/Legacy/Ui-Ready.md')?.frontmatter ?? {};
		const assertions = plugin.getAssertionService().getAll()
			.filter(record => record.assertion.subject === '[[Charted Roots/Legacy/Ui-Ready]]')
			.map(record => ({
				path: record.filePath,
				type: record.assertion.assertion_type,
				predicate: record.assertion.predicate,
				object: record.assertion.object,
				role: record.raw.role
			}));

		const adapter = app.vault.adapter;
		const backupListing = await adapter.list('.charted-roots/migration');
		const runFolders = backupListing.folders ?? [];
		if (runFolders.length !== 1) {
			throw new Error('Expected exactly one default UI migration backup folder, got ' + runFolders.length);
		}
		const runFolder = runFolders[0];
		const manifest = JSON.parse(await adapter.read(runFolder + '/manifest.json'));
		const backup = await adapter.read(
			runFolder + '/originals/Charted Roots/Legacy/Ui-Ready.md'
		);

		const previewRoot = document.querySelector('.cr-v2-migration-preview');
		return {
			source: {
				cr_schema: sourceFm.cr_schema,
				cr_type: sourceFm.cr_type,
				cr_id: sourceFm.cr_id,
				name: sourceFm.name,
				hasMembership: !!sourceFm.membership_orgs
			},
			assertions,
			backup: {
				runFolder,
				manifestStatus: manifest.status,
				sourcePath: manifest.sourceBackups?.[0]?.filePath ?? null,
				createdCount: manifest.createdAssertionPaths?.length ?? 0,
				containsLegacyMembership: backup.includes('membership_orgs:')
			},
			preview: {
				text: previewRoot?.textContent ?? '',
				hasMigrateButton: !!previewRoot?.querySelector('.cr-v2-migration-preview__migrate'),
				buttons: [...(previewRoot?.querySelectorAll('button') ?? [])]
					.map(el => el.textContent ?? '')
			}
		};
	`);

	assert.deepEqual(uiExecution.source, {
		cr_schema: 2,
		cr_type: 'person',
		cr_id: 'legacy-ui-ready',
		name: 'UI Ready Person',
		hasMembership: false
	});
	assert.equal(uiExecution.assertions.length, 1);
	assert.deepEqual(uiExecution.assertions[0], {
		path: uiExecution.assertions[0].path,
		type: 'affiliation',
		predicate: 'member_of',
		object: '[[Charted Roots/Legacy/Org-A|Org A]]',
		role: 'Tester'
	});
	assert.match(uiExecution.backup.runFolder, /^\.charted-roots\/migration\//);
	assert.equal(uiExecution.backup.manifestStatus, 'completed');
	assert.equal(uiExecution.backup.sourcePath, 'Charted Roots/Legacy/Ui-Ready.md');
	assert.equal(uiExecution.backup.createdCount, 1);
	assert.equal(uiExecution.backup.containsLegacyMembership, true);
	assert.match(uiExecution.preview.text, /0 Ready/);
	assert.match(uiExecution.preview.text, /2 Review required/);
	assert.match(uiExecution.preview.text, /1 Blocked/);
	assert.equal(uiExecution.preview.hasMigrateButton, false);
	assert.deepEqual(uiExecution.preview.buttons, ['Close']);

	await session.screenshot(path.join(ARTIFACTS, 'v2-migration-ui-executed.png'));

	// Multi-Workspace Foundation: verify the startup-derived Default Workspace,
	// then replace it with two independent datasets and prove scope/path
	// switching in the real Obsidian host.
	await session.waitFor(
		`app.metadataCache.getCache('Workspace-E2E/History/Organizations/History-Org.md')?.frontmatter?.cr_type === 'organization'
			&& app.metadataCache.getCache('Workspace-E2E/Shushan/Organizations/Fiction-Org.md')?.frontmatter?.cr_type === 'organization'
			&& app.metadataCache.getCache('Workspace-E2E/History/Sources/History-Source.md')?.frontmatter?.cr_type === 'source'
			&& app.metadataCache.getCache('Workspace-E2E/Shushan/Sources/Fiction-Source.md')?.frontmatter?.cr_type === 'source'
			&& app.metadataCache.getCache('Workspace-E2E/History/Universes/History-Universe.md')?.frontmatter?.cr_type === 'universe'
			&& app.metadataCache.getCache('Workspace-E2E/Shushan/Universes/Fiction-Universe.md')?.frontmatter?.cr_type === 'universe'
			&& app.metadataCache.getCache('Workspace-E2E/Shushan/Events/Fiction-Event.md')?.frontmatter?.cr_type === 'event'
			&& app.metadataCache.getCache('Workspace-E2E/History/Places/History-Place.md')?.frontmatter?.cr_type === 'place'
			&& app.metadataCache.getCache('Workspace-E2E/Shushan/Places/Fiction-Place.md')?.frontmatter?.cr_type === 'place'
			&& app.metadataCache.getCache('Workspace-E2E/History/Sources/Proofs/History-Proof.md')?.frontmatter?.cr_type === 'proof_summary'
			&& app.metadataCache.getCache('Workspace-E2E/Shushan/Sources/Proofs/Fiction-Proof.md')?.frontmatter?.cr_type === 'proof_summary'`
	);

	const workspaceState = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const adapter = app.vault.adapter;
		const initialCatalog = JSON.parse(
			await adapter.read('.charted-roots/workspaces.json')
		);
		const initialService = plugin.getWorkspaceService();
		if (!initialService) throw new Error('Workspace service did not bootstrap.');

		const initial = {
			active: initialService.getActiveId(),
			root: initialService.getActive().rootFolder,
			localSetting: plugin.settings.activeWorkspaceId,
			catalogHasActive: Object.prototype.hasOwnProperty.call(
				initialCatalog,
				'activeWorkspaceId'
			)
		};

		const catalog = {
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

		await plugin.replaceWorkspaceCatalog(catalog);
		const service = plugin.getWorkspaceService();
		if (!service) throw new Error('Workspace service disappeared after catalog replacement.');

		const eventService = plugin.getEventService();
		if (!eventService) throw new Error('Event service is unavailable.');
		const sourceService = plugin.getSourceService();
		const organizationService = plugin.getOrganizationService();
		const universeService = plugin.getUniverseService();
		const familyGraph = plugin.createFamilyGraphService();
		const placeGraph = plugin.createPlaceGraphService();
		const evidenceService = plugin.getEvidenceService();
		const proofService = plugin.getProofSummaryService();
		const temporalProjectionService = plugin.getTemporalProjectionService();
		const temporalAssertionStateService = plugin.getTemporalAssertionStateService();
		if (!temporalAssertionStateService) {
			throw new Error('Temporal Assertion state service is unavailable.');
		}
		const historicalCalendar = plugin.getHistoricalDateService().getCalendarProvider('tyme');
		if (!historicalCalendar) {
			throw new Error('Historical calendar provider is unavailable.');
		}
		const readTimelineView = () => {
			const leaf = app.workspace.getLeavesOfType('charted-roots-temporal-timeline')[0];
			const root = leaf?.view?.containerEl;
			return {
				workspace: root?.querySelector('.cr-v2-timeline__workspace')?.textContent ?? '',
				scale: root?.querySelector('.cr-v2-timeline__svg')?.getAttribute('data-scale') ?? null,
				spanIds: [...(root?.querySelectorAll('.cr-v2-timeline__span') ?? [])]
					.map(el => el.getAttribute('data-item-id'))
					.filter(Boolean)
					.sort(),
				windowIds: [...(root?.querySelectorAll('.cr-v2-timeline__window') ?? [])]
					.map(el => el.getAttribute('data-window-id'))
					.filter(Boolean)
					.sort(),
				kinds: [...(root?.querySelectorAll('.cr-v2-timeline__span') ?? [])]
					.map(el => el.getAttribute('data-item-kind'))
					.filter(Boolean)
					.sort(),
				tickLabels: [...(root?.querySelectorAll('.cr-v2-timeline__tick-label') ?? [])]
					.map(el => el.textContent ?? '')
					.filter(Boolean),
				laneLabels: [...(root?.querySelectorAll('.cr-v2-timeline__lane-label') ?? [])]
					.map(el => el.textContent ?? '')
					.filter(Boolean),
				groupBy: root?.querySelector('.cr-v2-timeline__group-filter')?.value ?? null,
				persistedGroupBy: leaf?.view?.getState?.().groupBy ?? null,
				focusKind: root?.querySelector(
					'.cr-v2-timeline__focus [data-focus-kind]'
				)?.getAttribute('data-focus-kind') ?? null,
				focusLabel: root?.querySelector(
					'.cr-v2-timeline__focus-label'
				)?.textContent ?? ''
			};
		};
		const readTemporalRelationships = () => {
			const leaf = app.workspace.getLeavesOfType('canvas-roots-relationships')[0];
			const root = leaf?.view?.containerEl;
			return {
				activeIds: [...(root?.querySelectorAll(
					'.cr-rv-temporal-state__item[data-temporal-state="active"]'
				) ?? [])]
					.map(el => el.getAttribute('data-assertion-id'))
					.filter(Boolean)
					.sort(),
				possibleIds: [...(root?.querySelectorAll(
					'.cr-rv-temporal-state__item[data-temporal-state="possible"]'
				) ?? [])]
					.map(el => el.getAttribute('data-assertion-id'))
					.filter(Boolean)
					.sort(),
				focusText: root?.querySelector(
					'.cr-rv-temporal-state__focus'
				)?.textContent ?? '',
				summary: root?.querySelector(
					'.cr-rv-temporal-state__summary'
				)?.textContent ?? ''
			};
		};

		const historyCreated = [
			await eventService.createEvent({
				title: 'History Created Event E2E',
				eventType: 'other',
				datePrecision: 'unknown'
			}),
			await sourceService.createSource({
				title: 'History Created Source E2E',
				sourceType: 'document'
			}),
			await organizationService.createOrganization(
				'History Created Organization E2E',
				'custom'
			),
			await universeService.createUniverse({
				name: 'History Created Universe E2E',
				status: 'active'
			}),
			await proofService.createProof({
				title: 'History Created Proof E2E',
				subjectPerson: '[[Workspace-E2E/History/People/History-Person|History Person]]',
				factType: 'birth_date',
				conclusion: 'History created proof conclusion',
				status: 'complete',
				confidence: 'proven'
			})
		];

		const historyAssertionState = temporalAssertionStateService.getAt(
			historicalCalendar.solarToJulianDay({
				year: -456,
				month: 6,
				day: 1
			})
		);

		const history = {
			active: service.getActiveId(),
			files: service.getScope().getMarkdownFiles()
				.filter(file => !historyCreated.some(created => created.path === file.path))
				.map(file => file.path)
				.sort(),
			assertionPath: service.resolvePath('assertions', 'New.md'),
			outsideWorkspace: service.getScope().getWorkspaceForPath(
				'Charted Roots/Legacy/Broken-Membership.md'
			) ?? null,
			services: {
				events: eventService.getAllEvents()
					.filter(event => !event.title.includes('Created Event E2E'))
					.map(event => event.title)
					.sort(),
				sources: sourceService.getAllSources()
					.filter(source => !source.title.includes('Created Source E2E'))
					.map(source => source.title)
					.sort(),
				organizations: organizationService.getAllOrganizations()
					.filter(org => !org.name.includes('Created Organization E2E'))
					.map(org => org.name)
					.sort(),
				universes: universeService.getAllUniverses()
					.filter(universe => !universe.name.includes('Created Universe E2E'))
					.map(universe => universe.name)
					.sort()
			},
			personIndex: {
				history: plugin.personIndex?.getFileByCrId('workspace-history-person')?.path ?? null,
				shushan: plugin.personIndex?.getFileByCrId('workspace-shushan-person')?.path ?? null
			},
			familyPeople: familyGraph.getAllPeople().map(person => person.name).sort(),
			places: placeGraph.getAllPlaces().map(place => place.name).sort(),
			evidence: {
				history: evidenceService.getFactCoverage('workspace-history-person')?.filePath ?? null,
				shushan: evidenceService.getFactCoverage('workspace-shushan-person')?.filePath ?? null
			},
			proofs: proofService.getAllProofs()
				.filter(proof => !proof.title.includes('Created Proof E2E'))
				.map(proof => proof.title)
				.sort(),
			temporalAssertionState: {
				active: historyAssertionState.active.map(entry => entry.id).sort(),
				possible: historyAssertionState.possible.map(entry => entry.id).sort()
			},
			temporalItems: temporalProjectionService.getAll()
				.filter(item => !historyCreated.some(created => created.path === item.filePath))
				.map(item => ({
					id: item.id,
					kind: item.kind,
					status: item.status,
					source: item.source,
					start: item.start?.expression ?? null,
					end: item.end?.expression ?? null
				}))
				.sort((a, b) => a.id.localeCompare(b.id)),
			createdPaths: historyCreated.map(file => file.path)
		};

		for (const file of historyCreated) {
			const current = app.vault.getFileByPath(file.path);
			if (current) await app.vault.delete(current);
		}

		await plugin.activateTemporalTimelineView();
		await new Promise(resolve => window.setTimeout(resolve, 100));
		history.timeline = readTimelineView();

		const timelineLeaf = app.workspace.getLeavesOfType('charted-roots-temporal-timeline')[0];
		const timelineRoot = timelineLeaf?.view?.containerEl;
		const timelineSearch = timelineRoot?.querySelector('.cr-v2-timeline__search');
		if (!(timelineSearch instanceof HTMLInputElement)) {
			throw new Error('Temporal Timeline search input is unavailable.');
		}
		timelineSearch.value = 'Process';
		timelineSearch.dispatchEvent(new Event('input', { bubbles: true }));
		history.timelineSearch = readTimelineView();

		const clearedSearch = timelineRoot?.querySelector('.cr-v2-timeline__search');
		if (!(clearedSearch instanceof HTMLInputElement)) {
			throw new Error('Temporal Timeline search input disappeared after filtering.');
		}
		clearedSearch.value = '';
		clearedSearch.dispatchEvent(new Event('input', { bubbles: true }));

		const timelineKind = timelineRoot?.querySelector('.cr-v2-timeline__kind-filter');
		if (!(timelineKind instanceof HTMLSelectElement)) {
			throw new Error('Temporal Timeline kind filter is unavailable.');
		}
		timelineKind.value = 'period';
		timelineKind.dispatchEvent(new Event('change', { bubbles: true }));
		history.timelinePeriodFilter = readTimelineView();

		timelineKind.value = 'all';
		timelineKind.dispatchEvent(new Event('change', { bubbles: true }));

		const timelineGroup = timelineRoot?.querySelector('.cr-v2-timeline__group-filter');
		if (!(timelineGroup instanceof HTMLSelectElement)) {
			throw new Error('Temporal Timeline group selector is unavailable.');
		}
		timelineGroup.value = 'person';
		timelineGroup.dispatchEvent(new Event('change', { bubbles: true }));
		history.timelinePersonGroup = readTimelineView();

		const timelineSvg = timelineRoot?.querySelector('.cr-v2-timeline__svg');
		if (!(timelineSvg instanceof SVGSVGElement)) {
			throw new Error('Temporal Timeline SVG is unavailable.');
		}
		const timelineBounds = timelineSvg.getBoundingClientRect();
		timelineSvg.dispatchEvent(new MouseEvent('click', {
			bubbles: true,
			clientX: timelineBounds.left + timelineBounds.width * 0.6,
			clientY: timelineBounds.top + 60
		}));
		await new Promise(resolve => window.setTimeout(resolve, 20));
		const clickedFocus = plugin.getTemporalFocusService().get();
		history.timelineClickedFocus = {
			kind: clickedFocus?.kind ?? null,
			source: clickedFocus?.source ?? null,
			hasFinitePosition: clickedFocus?.kind === 'point'
				? Number.isFinite(clickedFocus.position)
				: false,
			view: readTimelineView()
		};

		plugin.getTemporalFocusService().setPoint(
			historicalCalendar.solarToJulianDay({
				year: -456,
				month: 6,
				day: 1
			}),
			'e2e-history'
		);
		await plugin.activateRelationshipsView();
		await new Promise(resolve => window.setTimeout(resolve, 100));
		history.relationshipTemporal = readTemporalRelationships();

		await plugin.setActiveWorkspace('shushan');
		await new Promise(resolve => window.setTimeout(resolve, 50));
		const shushanTimeline = readTimelineView();

		plugin.getTemporalFocusService().setPoint(
			historicalCalendar.solarToJulianDay({
				year: 115,
				month: 6,
				day: 1
			}),
			'e2e-shushan'
		);
		await new Promise(resolve => window.setTimeout(resolve, 50));
		const shushanRelationshipTemporal = readTemporalRelationships();

		const shushanAssertionState = temporalAssertionStateService.getAt(
			historicalCalendar.solarToJulianDay({
				year: 115,
				month: 6,
				day: 1
			})
		);

		const shushanCreated = [
			await eventService.createEvent({
				title: 'Shushan Created Event E2E',
				eventType: 'other',
				datePrecision: 'unknown'
			}),
			await sourceService.createSource({
				title: 'Shushan Created Source E2E',
				sourceType: 'document'
			}),
			await organizationService.createOrganization(
				'Shushan Created Organization E2E',
				'custom'
			),
			await universeService.createUniverse({
				name: 'Shushan Created Universe E2E',
				status: 'active'
			}),
			await proofService.createProof({
				title: 'Shushan Created Proof E2E',
				subjectPerson: '[[Workspace-E2E/Shushan/People/Fiction-Person|Fiction Person]]',
				factType: 'birth_date',
				conclusion: 'Shushan created proof conclusion',
				status: 'complete',
				confidence: 'proven'
			})
		];

		const shushan = {
			active: service.getActiveId(),
			files: service.getScope().getMarkdownFiles()
				.filter(file => !shushanCreated.some(created => created.path === file.path))
				.map(file => file.path)
				.sort(),
			personPath: service.resolvePath('people', 'Li-Yingqiong.md'),
			localSetting: plugin.settings.activeWorkspaceId,
			services: {
				events: eventService.getAllEvents()
					.filter(event => !event.title.includes('Created Event E2E'))
					.map(event => event.title)
					.sort(),
				sources: sourceService.getAllSources()
					.filter(source => !source.title.includes('Created Source E2E'))
					.map(source => source.title)
					.sort(),
				organizations: organizationService.getAllOrganizations()
					.filter(org => !org.name.includes('Created Organization E2E'))
					.map(org => org.name)
					.sort(),
				universes: universeService.getAllUniverses()
					.filter(universe => !universe.name.includes('Created Universe E2E'))
					.map(universe => universe.name)
					.sort()
			},
			personIndex: {
				history: plugin.personIndex?.getFileByCrId('workspace-history-person')?.path ?? null,
				shushan: plugin.personIndex?.getFileByCrId('workspace-shushan-person')?.path ?? null
			},
			familyPeople: familyGraph.getAllPeople().map(person => person.name).sort(),
			places: placeGraph.getAllPlaces().map(place => place.name).sort(),
			evidence: {
				history: evidenceService.getFactCoverage('workspace-history-person')?.filePath ?? null,
				shushan: evidenceService.getFactCoverage('workspace-shushan-person')?.filePath ?? null
			},
			proofs: proofService.getAllProofs()
				.filter(proof => !proof.title.includes('Created Proof E2E'))
				.map(proof => proof.title)
				.sort(),
			temporalAssertionState: {
				active: shushanAssertionState.active.map(entry => entry.id).sort(),
				possible: shushanAssertionState.possible.map(entry => entry.id).sort()
			},
			temporalItems: temporalProjectionService.getAll()
				.filter(item => !shushanCreated.some(created => created.path === item.filePath))
				.map(item => ({
					id: item.id,
					kind: item.kind,
					status: item.status,
					source: item.source,
					start: item.start?.expression ?? null,
					end: item.end?.expression ?? null
				}))
				.sort((a, b) => a.id.localeCompare(b.id)),
			timeline: shushanTimeline,
			relationshipTemporal: shushanRelationshipTemporal,
			createdPaths: shushanCreated.map(file => file.path)
		};

		for (const file of shushanCreated) {
			const current = app.vault.getFileByPath(file.path);
			if (current) await app.vault.delete(current);
		}

		const persisted = JSON.parse(
			await adapter.read('.charted-roots/workspaces.json')
		);

		let overlapRejected = false;
		let overlapMessage = '';
		try {
			await plugin.replaceWorkspaceCatalog({
				version: 1,
				workspaces: [
					catalog.workspaces[0],
					{
						...catalog.workspaces[1],
						rootFolder: 'Workspace-E2E/History/Nested'
					}
				]
			});
		} catch (error) {
			overlapRejected = true;
			overlapMessage = error instanceof Error ? error.message : String(error);
		}

		const persistedAfterRejected = JSON.parse(
			await adapter.read('.charted-roots/workspaces.json')
		);

		await plugin.setActiveWorkspace('history-cn');

		return {
			initial,
			history,
			shushan,
			persisted,
			overlapRejected,
			overlapMessage,
			persistedAfterRejected,
			finalActive: service.getActiveId(),
			finalLocalSetting: plugin.settings.activeWorkspaceId
		};
	`);

	assert.deepEqual(workspaceState.initial, {
		active: 'default',
		root: 'Charted Roots',
		localSetting: 'default',
		catalogHasActive: false
	});
	assert.equal(workspaceState.history.active, 'history-cn');
	assert.deepEqual(workspaceState.history.files, [
		'Workspace-E2E/History/Assertions/History-Assertion.md',
		'Workspace-E2E/History/Events/History-Event.md',
		'Workspace-E2E/History/Events/History-Service-Event.md',
		'Workspace-E2E/History/Organizations/History-Org.md',
		'Workspace-E2E/History/People/History-Person.md',
		'Workspace-E2E/History/Periods/History-Bounded.md',
		'Workspace-E2E/History/Periods/History-Period.md',
		'Workspace-E2E/History/Places/History-Place.md',
		'Workspace-E2E/History/Processes/History-Process.md',
		'Workspace-E2E/History/Schemas/History-Schema.md',
		'Workspace-E2E/History/Sources/History-Source.md',
		'Workspace-E2E/History/Sources/Proofs/History-Proof.md',
		'Workspace-E2E/History/Universes/History-Universe.md'
	]);
	assert.equal(
		workspaceState.history.assertionPath,
		'Workspace-E2E/History/Assertions/New.md'
	);
	assert.equal(workspaceState.history.outsideWorkspace, null);
	assert.deepEqual(workspaceState.history.services, {
		events: ['History Event', 'History Service Event'],
		sources: ['History Source'],
		organizations: ['History Organization'],
		universes: ['History Universe']
	});
	assert.deepEqual(workspaceState.history.personIndex, {
		history: 'Workspace-E2E/History/People/History-Person.md',
		shushan: null
	});
	assert.deepEqual(workspaceState.history.familyPeople, ['History Person']);
	assert.deepEqual(workspaceState.history.places, ['History Place']);
	assert.deepEqual(workspaceState.history.evidence, {
		history: 'Workspace-E2E/History/People/History-Person.md',
		shushan: null
	});
	assert.deepEqual(workspaceState.history.proofs, ['History Proof']);
	assert.deepEqual(workspaceState.history.temporalAssertionState, {
		active: ['workspace-history-assertion'],
		possible: []
	});
	assert.deepEqual(workspaceState.history.temporalItems, [
		{
			id: 'history-event',
			kind: 'event',
			status: 'resolved',
			source: 'v2',
			start: 'BCE 453',
			end: null
		},
		{
			id: 'history-service-event',
			kind: 'event',
			status: 'resolved',
			source: 'legacy_event',
			start: 'BCE 450',
			end: null
		},
		{
			id: 'workspace-history-assertion',
			kind: 'assertion',
			status: 'resolved',
			source: 'v2',
			start: 'BCE 460',
			end: 'BCE 455'
		},
		{
			id: 'workspace-history-bounded-period',
			kind: 'period',
			status: 'resolved',
			source: 'v2',
			start: null,
			end: null
		},
		{
			id: 'workspace-history-period',
			kind: 'period',
			status: 'resolved',
			source: 'v2',
			start: 'BCE 475',
			end: 'BCE 221'
		},
		{
			id: 'workspace-history-process',
			kind: 'process',
			status: 'resolved',
			source: 'v2',
			start: 'BCE 500',
			end: 'BCE 450'
		}
	]);
	assert.equal(workspaceState.history.timeline.workspace, '中国历史');
	assert.equal(workspaceState.history.timeline.scale, 'julian-day');
	assert.deepEqual(workspaceState.history.timeline.spanIds, [
		'history-event',
		'history-service-event',
		'workspace-history-assertion',
		'workspace-history-period',
		'workspace-history-process'
	]);
	assert.deepEqual(workspaceState.history.timeline.windowIds, [
		'workspace-history-bounded-period'
	]);
	assert.deepEqual(workspaceState.history.timeline.kinds, [
		'assertion',
		'event',
		'event',
		'period',
		'process'
	]);
	assert.ok(workspaceState.history.timeline.tickLabels.length > 0);
	assert.ok(
		workspaceState.history.timeline.tickLabels.every(label => / BCE$/.test(label))
	);
	assert.ok(
		workspaceState.history.timeline.tickLabels.every(label => !/\b0\b/.test(label))
	);
	assert.deepEqual(workspaceState.history.timelineSearch.spanIds, [
		'workspace-history-process'
	]);
	assert.deepEqual(workspaceState.history.timelineSearch.windowIds, []);
	assert.deepEqual(workspaceState.history.timelinePeriodFilter.spanIds, [
		'workspace-history-period'
	]);
	assert.deepEqual(workspaceState.history.timelinePeriodFilter.windowIds, [
		'workspace-history-bounded-period'
	]);
	assert.equal(workspaceState.history.timelinePersonGroup.groupBy, 'person');
	assert.equal(workspaceState.history.timelinePersonGroup.persistedGroupBy, 'person');
	assert.deepEqual(workspaceState.history.timelinePersonGroup.laneLabels, [
		'History Person',
		'Ungrouped'
	]);
	assert.deepEqual(workspaceState.history.timelineClickedFocus, {
		kind: 'point',
		source: 'timeline',
		hasFinitePosition: true,
		view: {
			...workspaceState.history.timelineClickedFocus.view,
			focusKind: 'point'
		}
	});
	assert.ok(workspaceState.history.timelineClickedFocus.view.focusLabel.length > 0);
	assert.deepEqual(workspaceState.history.relationshipTemporal.activeIds, [
		'workspace-history-assertion'
	]);
	assert.deepEqual(workspaceState.history.relationshipTemporal.possibleIds, []);
	assert.match(workspaceState.history.relationshipTemporal.focusText, /BCE/);
	assert.equal(
		workspaceState.history.relationshipTemporal.summary,
		'1 active · 0 possible'
	);
	assert.deepEqual(workspaceState.history.createdPaths.sort(), [
		'Workspace-E2E/History/Events/History Created Event E2E.md',
		'Workspace-E2E/History/Organizations/History Created Organization E2E.md',
		'Workspace-E2E/History/Sources/History Created Source E2E.md',
		'Workspace-E2E/History/Sources/Proofs/History Created Proof E2E.md',
		'Workspace-E2E/History/Universes/History Created Universe E2E.md'
	]);

	assert.equal(workspaceState.shushan.active, 'shushan');
	assert.deepEqual(workspaceState.shushan.files, [
		'Workspace-E2E/Shushan/Assertions/Fiction-Assertion.md',
		'Workspace-E2E/Shushan/Events/Fiction-Event.md',
		'Workspace-E2E/Shushan/Organizations/Fiction-Org.md',
		'Workspace-E2E/Shushan/People/Fiction-Person.md',
		'Workspace-E2E/Shushan/Periods/Fiction-Period.md',
		'Workspace-E2E/Shushan/Places/Fiction-Place.md',
		'Workspace-E2E/Shushan/Processes/Fiction-Process.md',
		'Workspace-E2E/Shushan/Schemas/Fiction-Schema.md',
		'Workspace-E2E/Shushan/Sources/Fiction-Source.md',
		'Workspace-E2E/Shushan/Sources/Proofs/Fiction-Proof.md',
		'Workspace-E2E/Shushan/Universes/Fiction-Universe.md'
	]);
	assert.equal(
		workspaceState.shushan.personPath,
		'Workspace-E2E/Shushan/People/Li-Yingqiong.md'
	);
	assert.equal(workspaceState.shushan.localSetting, 'shushan');
	assert.deepEqual(workspaceState.shushan.services, {
		events: ['Fiction Event'],
		sources: ['Fiction Source'],
		organizations: ['Fiction Organization'],
		universes: ['Fiction Universe']
	});
	assert.deepEqual(workspaceState.shushan.personIndex, {
		history: null,
		shushan: 'Workspace-E2E/Shushan/People/Fiction-Person.md'
	});
	assert.deepEqual(workspaceState.shushan.familyPeople, ['Fiction Person']);
	assert.deepEqual(workspaceState.shushan.places, ['Fiction Place']);
	assert.deepEqual(workspaceState.shushan.evidence, {
		history: null,
		shushan: 'Workspace-E2E/Shushan/People/Fiction-Person.md'
	});
	assert.deepEqual(workspaceState.shushan.proofs, ['Fiction Proof']);
	assert.deepEqual(workspaceState.shushan.temporalAssertionState, {
		active: ['workspace-shushan-assertion'],
		possible: []
	});
	assert.deepEqual(workspaceState.shushan.temporalItems, [
		{
			id: 'fiction-event',
			kind: 'event',
			status: 'resolved',
			source: 'v2',
			start: '100 CE',
			end: null
		},
		{
			id: 'workspace-shushan-assertion',
			kind: 'assertion',
			status: 'resolved',
			source: 'v2',
			start: '110 CE',
			end: '120 CE'
		},
		{
			id: 'workspace-shushan-period',
			kind: 'period',
			status: 'resolved',
			source: 'v2',
			start: '80 CE',
			end: '200 CE'
		},
		{
			id: 'workspace-shushan-process',
			kind: 'process',
			status: 'resolved',
			source: 'v2',
			start: '90 CE',
			end: '140 CE'
		}
	]);
	assert.equal(workspaceState.shushan.timeline.workspace, '蜀山');
	assert.equal(workspaceState.shushan.timeline.scale, 'julian-day');
	assert.deepEqual(workspaceState.shushan.timeline.spanIds, [
		'fiction-event',
		'workspace-shushan-assertion',
		'workspace-shushan-period',
		'workspace-shushan-process'
	]);
	assert.deepEqual(workspaceState.shushan.timeline.windowIds, []);
	assert.deepEqual(workspaceState.shushan.timeline.kinds, [
		'assertion',
		'event',
		'period',
		'process'
	]);
	assert.ok(workspaceState.shushan.timeline.tickLabels.length > 0);
	assert.ok(
		workspaceState.shushan.timeline.tickLabels.every(label => / CE$/.test(label))
	);
	assert.ok(
		workspaceState.shushan.timeline.tickLabels.every(label => !/\b0\b/.test(label))
	);
	assert.equal(workspaceState.shushan.timeline.groupBy, 'person');
	assert.equal(workspaceState.shushan.timeline.persistedGroupBy, 'person');
	assert.deepEqual(workspaceState.shushan.timeline.laneLabels, [
		'Fiction Person',
		'Ungrouped'
	]);
	assert.deepEqual(workspaceState.shushan.relationshipTemporal.activeIds, [
		'workspace-shushan-assertion'
	]);
	assert.deepEqual(workspaceState.shushan.relationshipTemporal.possibleIds, []);
	assert.match(workspaceState.shushan.relationshipTemporal.focusText, /CE/);
	assert.equal(
		workspaceState.shushan.relationshipTemporal.summary,
		'1 active · 0 possible'
	);
	assert.deepEqual(workspaceState.shushan.createdPaths.sort(), [
		'Workspace-E2E/Shushan/Events/Shushan Created Event E2E.md',
		'Workspace-E2E/Shushan/Organizations/Shushan Created Organization E2E.md',
		'Workspace-E2E/Shushan/Sources/Proofs/Shushan Created Proof E2E.md',
		'Workspace-E2E/Shushan/Sources/Shushan Created Source E2E.md',
		'Workspace-E2E/Shushan/Universes/Shushan Created Universe E2E.md'
	]);

	assert.equal(workspaceState.persisted.version, 1);
	assert.equal(workspaceState.persisted.workspaces.length, 2);
	assert.equal(
		Object.prototype.hasOwnProperty.call(
			workspaceState.persisted,
			'activeWorkspaceId'
		),
		false
	);
	assert.equal(workspaceState.overlapRejected, true);
	assert.match(workspaceState.overlapMessage, /overlap/i);
	assert.deepEqual(
		workspaceState.persistedAfterRejected,
		workspaceState.persisted
	);
	assert.equal(workspaceState.finalActive, 'history-cn');
	assert.equal(workspaceState.finalLocalSetting, 'history-cn');

	await session.screenshot(path.join(ARTIFACTS, 'v2-workspaces-foundation.png'));
});
