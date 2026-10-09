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
		`app.workspace.getLeavesOfType('charted-roots-entity-profile')
			.some(leaf => {
				const root = leaf.view?.containerEl;
				return root?.querySelector('.cr-profile__type-badge')?.textContent === 'Office'
					&& root?.querySelector('.cr-profile__header-name')?.textContent?.includes('丞相')
					&& [...(root?.querySelectorAll('.cr-profile__section-title') ?? [])]
						.some(el => el.textContent === 'Structured assertions');
			})`
	);

	const officeProfileUi = await session.evalInApp(`
		const leaf = app.workspace.getLeavesOfType('charted-roots-entity-profile')
			.find(candidate => {
				const root = candidate.view?.containerEl;
				return root?.querySelector('.cr-profile__type-badge')?.textContent === 'Office'
					&& root?.querySelector('.cr-profile__header-name')?.textContent?.includes('丞相');
			});
		const root = leaf?.view?.containerEl;
		const title = [...(root?.querySelectorAll('.cr-profile__section-title') ?? [])]
			.find(el => el.textContent === 'Structured assertions');
		const section = title?.closest('.cr-profile__section');
		return {
			typeBadge: root?.querySelector('.cr-profile__type-badge')?.textContent ?? null,
			name: root?.querySelector('.cr-profile__header-name')?.textContent ?? '',
			meta: root?.querySelector('.cr-profile__header-meta')?.textContent ?? '',
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

	// Exercise the real Create Place modal CRS boundary. Switching the display
	// CRS must preserve the represented location, while saved frontmatter must
	// remain canonical WGS84 and carry no transient source-CRS marker.
	await session.evalInApp(`
		const ok = app.commands.executeCommandById('charted-roots:create-place-note');
		if (!ok) throw new Error('Create Place command was not registered.');
		return true;
	`);
	await session.waitFor(
		`document.querySelector('.crc-create-place-modal .crc-coordinate-crs')
			&& document.querySelector('.crc-create-place-modal [aria-label="Latitude"]')
			&& document.querySelector('.crc-create-place-modal [aria-label="Longitude"]')`
	);

	const coordinateCrsSwitch = await session.evalInApp(`
		const modal = document.querySelector('.crc-create-place-modal');
		if (!modal) throw new Error('Create Place modal is unavailable.');

		const nameSetting = [...modal.querySelectorAll('.setting-item')]
			.find(el => el.querySelector('.setting-item-name')?.textContent === 'Name');
		const nameInput = nameSetting?.querySelector('input');
		const lat = modal.querySelector('[aria-label="Latitude"]');
		const long = modal.querySelector('[aria-label="Longitude"]');
		const crs = modal.querySelector('.crc-coordinate-crs');
		if (
			!(nameInput instanceof HTMLInputElement)
			|| !(lat instanceof HTMLInputElement)
			|| !(long instanceof HTMLInputElement)
			|| !(crs instanceof HTMLSelectElement)
		) {
			throw new Error('Create Place coordinate controls are incomplete.');
		}

		nameInput.value = 'M6 GCJ Input E2E';
		nameInput.dispatchEvent(new Event('input', { bubbles: true }));
		lat.value = '34.7478004';
		lat.dispatchEvent(new Event('input', { bubbles: true }));
		long.value = '113.6192856';
		long.dispatchEvent(new Event('input', { bubbles: true }));

		crs.value = 'gcj02';
		crs.dispatchEvent(new Event('change', { bubbles: true }));

		return {
			crs: crs.value,
			lat: Number(lat.value),
			long: Number(long.value)
		};
	`);

	assert.equal(coordinateCrsSwitch.crs, 'gcj02');
	assert.ok(Math.abs(coordinateCrsSwitch.lat - 34.7466173) <= 1e-5);
	assert.ok(Math.abs(coordinateCrsSwitch.long - 113.6253334) <= 1e-5);

	await session.evalInApp(`
		const modal = document.querySelector('.crc-create-place-modal');
		const lat = modal?.querySelector('[aria-label="Latitude"]');
		const long = modal?.querySelector('[aria-label="Longitude"]');
		if (!(lat instanceof HTMLInputElement) || !(long instanceof HTMLInputElement)) {
			throw new Error('Create Place coordinate inputs are unavailable.');
		}

		// Enter the known GCJ-02 golden fixture as if copied from Amap/Gaode.
		lat.value = '34.7466173';
		lat.dispatchEvent(new Event('input', { bubbles: true }));
		long.value = '113.6253334';
		long.dispatchEvent(new Event('input', { bubbles: true }));

		const createButton = [...(modal?.querySelectorAll('button') ?? [])]
			.find(button => button.textContent?.trim() === 'Create place');
		if (!(createButton instanceof HTMLButtonElement)) {
			throw new Error('Create Place submit button is unavailable.');
		}
		createButton.click();
		return true;
	`);

	await session.waitFor(
		`(() => {
			const file = app.vault.getMarkdownFiles()
				.find(file => file.basename === 'M6 GCJ Input E2E');
			if (!file) return false;
			const fm = app.metadataCache.getFileCache(file)?.frontmatter;
			return !!fm
				&& typeof fm.coordinates_lat === 'number'
				&& typeof fm.coordinates_long === 'number';
		})()`
	);

	const coordinateCrsStorage = await session.evalInApp(`
		const file = app.vault.getMarkdownFiles()
			.find(file => file.basename === 'M6 GCJ Input E2E');
		if (!file) throw new Error('M6 CRS test Place was not created.');
		const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
		const result = {
			lat: fm.coordinates_lat,
			long: fm.coordinates_long,
			hasSourceCrs:
				Object.prototype.hasOwnProperty.call(fm, 'coordinateCRS')
				|| Object.prototype.hasOwnProperty.call(fm, 'coordinate_crs')
		};
		await app.vault.delete(file);
		return result;
	`);

	assert.ok(Math.abs(coordinateCrsStorage.lat - 34.7478004) <= 1e-5);
	assert.ok(Math.abs(coordinateCrsStorage.long - 113.6192856) <= 1e-5);
	assert.equal(coordinateCrsStorage.hasSourceCrs, false);

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
				chronologyId: root?.querySelector('.cr-v2-timeline__svg')
					?.getAttribute('data-chronology-id') ?? null,
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
				)?.textContent ?? '',
				contextActiveIds: [...(root?.querySelectorAll(
					'.cr-v2-timeline__context-item[data-temporal-state="active"]'
				) ?? [])]
					.map(el => el.getAttribute('data-context-id'))
					.filter(Boolean)
					.sort(),
				contextPossibleIds: [...(root?.querySelectorAll(
					'.cr-v2-timeline__context-item[data-temporal-state="possible"]'
				) ?? [])]
					.map(el => el.getAttribute('data-context-id'))
					.filter(Boolean)
					.sort(),
				contextSummary: root?.querySelector(
					'.cr-v2-timeline__context-summary'
				)?.textContent ?? ''
			};
		};
		const readTemporalMap = () => {
			const leaf = app.workspace.getLeavesOfType('canvas-roots-map')[0];
			const root = leaf?.view?.containerEl;
			const mapContainer = root?.querySelector('.cr-map-container');
			return {
				focusKind: mapContainer?.getAttribute('data-temporal-focus-kind') ?? null,
				markerCount: Number(
					mapContainer?.getAttribute('data-temporal-marker-count') ?? '0'
				),
				activeCount: Number(
					mapContainer?.getAttribute('data-temporal-active-count') ?? '0'
				),
				possibleCount: Number(
					mapContainer?.getAttribute('data-temporal-possible-count') ?? '0'
				),
				markerIds: [...(root?.querySelectorAll(
					'.cr-temporal-place-marker-icon[data-temporal-place-id]'
				) ?? [])]
					.map(el => el.getAttribute('data-temporal-place-id'))
					.filter(Boolean)
					.sort(),
				states: [...(root?.querySelectorAll(
					'.cr-temporal-place-marker-icon[data-temporal-state]'
				) ?? [])]
					.map(el => el.getAttribute('data-temporal-state'))
					.filter(Boolean)
					.sort(),
				contextActiveIds: [...(root?.querySelectorAll(
					'.cr-map-temporal-context__item[data-temporal-state="active"]'
				) ?? [])]
					.map(el => el.getAttribute('data-context-id'))
					.filter(Boolean)
					.sort(),
				contextPossibleIds: [...(root?.querySelectorAll(
					'.cr-map-temporal-context__item[data-temporal-state="possible"]'
				) ?? [])]
					.map(el => el.getAttribute('data-context-id'))
					.filter(Boolean)
					.sort(),
				contextSummary: root?.querySelector(
					'.cr-map-temporal-context__summary'
				)?.textContent ?? '',
				controlActiveCount: Number(
					mapContainer?.getAttribute('data-control-layer-active-count') ?? '0'
				),
				controlPossibleCount: Number(
					mapContainer?.getAttribute('data-control-layer-possible-count') ?? '0'
				),
				controlIssueCount: Number(
					mapContainer?.getAttribute('data-control-layer-issue-count') ?? '0'
				),
				controlFeatureIds: [...(root?.querySelectorAll(
					'.cr-historical-control-feature[data-control-feature-id]'
				) ?? [])]
					.map(el => el.getAttribute('data-control-feature-id'))
					.filter(Boolean)
					.sort(),
				controlStates: [...(root?.querySelectorAll(
					'.cr-historical-control-feature[data-temporal-state]'
				) ?? [])]
					.map(el => el.getAttribute('data-temporal-state'))
					.filter(Boolean)
					.sort()
			};
		};

		const readTemporalProfile = () => {
			const leaf = app.workspace.getLeavesOfType('charted-roots-entity-profile')[0];
			const root = leaf?.view?.containerEl;
			return {
				items: [...(root?.querySelectorAll(
					'.cr-profile__temporal-institution-item'
				) ?? [])]
					.map(el => ({
						assertionId: el.getAttribute('data-assertion-id'),
						state: el.getAttribute('data-temporal-state'),
						relationKind: el.getAttribute('data-relation-kind'),
						text: el.textContent ?? ''
					}))
					.sort((a, b) => String(a.assertionId).localeCompare(String(b.assertionId)))
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
		await plugin.activateMapView();
		await new Promise(resolve => window.setTimeout(resolve, 150));
		const historyMapLeaf = app.workspace.getLeavesOfType('canvas-roots-map')[0];
		const historyMapView = historyMapLeaf?.view;
		if (
			!historyMapView?.getHistoricalControlLayers
			|| !historyMapView?.refreshHistoricalControlLayers
		) {
			throw new Error('Historical control-layer repository runtime is unavailable.');
		}
		history.controlStorage = {
			ids: historyMapView.getHistoricalControlLayers()
				.map(layer => layer.id)
				.sort()
		};

		// Exercise the user-visible C4 import flow. The source fixture is GCJ-02,
		// while the persisted GeoJSON must become canonical WGS84 inside the
		// current History Workspace.
		const importOpened = app.commands.executeCommandById(
			'charted-roots:import-historical-control-layer'
		);
		if (!importOpened) {
			throw new Error('Historical control-layer import command is unavailable.');
		}
		await new Promise(resolve => window.setTimeout(resolve, 30));
		const importModal = document.querySelector('.cr-control-layer-import-modal');
		const importName = importModal?.querySelector(
			'.cr-control-layer-import__name'
		);
		const importCrs = importModal?.querySelector(
			'.cr-control-layer-import__crs'
		);
		const importGeoJson = importModal?.querySelector(
			'.cr-control-layer-import__geojson'
		);
		const importStart = importModal?.querySelector(
			'.cr-control-layer-import__time-start'
		);
		const importEnd = importModal?.querySelector(
			'.cr-control-layer-import__time-end'
		);
		const importSubmit = importModal?.querySelector(
			'.cr-control-layer-import__submit'
		);
		if (
			!(importName instanceof HTMLInputElement)
			|| !(importCrs instanceof HTMLSelectElement)
			|| !(importGeoJson instanceof HTMLTextAreaElement)
			|| !(importStart instanceof HTMLInputElement)
			|| !(importEnd instanceof HTMLInputElement)
			|| !(importSubmit instanceof HTMLButtonElement)
		) {
			throw new Error('Historical control-layer import controls are incomplete.');
		}

		importName.value = 'M6 Imported Boundary E2E';
		importName.dispatchEvent(new Event('input', { bubbles: true }));
		importCrs.value = 'gcj02';
		importCrs.dispatchEvent(new Event('change', { bubbles: true }));
		importGeoJson.value = JSON.stringify({
			type: 'FeatureCollection',
			features: [{
				type: 'Feature',
				id: 'imported-gcj-point',
				properties: { name: 'Imported GCJ point' },
				geometry: {
					type: 'Point',
					coordinates: [113.6253334, 34.7466173]
				}
			}]
		});
		importGeoJson.dispatchEvent(new Event('input', { bubbles: true }));
		importStart.value = 'BCE 500';
		importStart.dispatchEvent(new Event('input', { bubbles: true }));
		importEnd.value = 'BCE 400';
		importEnd.dispatchEvent(new Event('input', { bubbles: true }));
		importSubmit.click();

		for (let i = 0; i < 120; i++) {
			const imported = historyMapView.getHistoricalControlLayers()
				.find(layer => layer.label === 'M6 Imported Boundary E2E');
			if (imported) break;
			await new Promise(resolve => window.setTimeout(resolve, 25));
		}
		const importedLayer = historyMapView.getHistoricalControlLayers()
			.find(layer => layer.label === 'M6 Imported Boundary E2E');
		if (!importedLayer) {
			throw new Error('Imported control layer did not reach the open Map runtime.');
		}

		const importedManifest = app.vault.getMarkdownFiles().find(file => {
			const fm = app.metadataCache.getFileCache(file)?.frontmatter;
			return fm?.cr_type === 'control_layer'
				&& fm?.name === 'M6 Imported Boundary E2E';
		});
		if (!importedManifest) {
			throw new Error('Imported control-layer manifest was not created.');
		}
		const importedFrontmatter = app.metadataCache
			.getFileCache(importedManifest)?.frontmatter ?? {};
		const importedFolder = importedManifest.path
			.split('/').slice(0, -1).join('/');
		const importedGeoJsonPath = importedFolder + '/' + importedFrontmatter.geojson_file;
		const importedGeoJsonFile = app.vault.getAbstractFileByPath(
			importedGeoJsonPath
		);
		if (!importedGeoJsonFile || !('extension' in importedGeoJsonFile)) {
			throw new Error('Imported canonical GeoJSON file was not created.');
		}
		const importedGeoJsonStored = JSON.parse(
			await app.vault.read(importedGeoJsonFile)
		);
		const importedPoint = importedGeoJsonStored.features?.[0]?.geometry?.coordinates;
		history.controlImport = {
			manifestPath: importedManifest.path,
			geojsonPath: importedGeoJsonPath,
			coordinateCrs: importedFrontmatter.coordinate_crs,
			sourceCoordinateCrs: importedFrontmatter.source_coordinate_crs,
			point: importedPoint,
			runtimeIds: historyMapView.getHistoricalControlLayers()
				.map(layer => layer.id)
				.sort(),
			rendered: readTemporalMap()
		};

		await app.vault.delete(importedManifest);
		await app.vault.delete(importedGeoJsonFile);
		for (let i = 0; i < 120; i++) {
			if (
				!historyMapView.getHistoricalControlLayers()
					.some(layer => layer.label === 'M6 Imported Boundary E2E')
			) break;
			await new Promise(resolve => window.setTimeout(resolve, 25));
		}
		history.controlImportAfterCleanup = {
			ids: historyMapView.getHistoricalControlLayers()
				.map(layer => layer.id)
				.sort(),
			rendered: readTemporalMap()
		};

		// C5: user-facing Map Timeline control publishes an entire CE year as
		// shared Julian Day focus when the bridge is unambiguous.
		const timelineToggle = historyMapView.containerEl.querySelector(
			'button[aria-label="Timeline"]'
		);
		if (!(timelineToggle instanceof HTMLButtonElement)) {
			throw new Error('Map Timeline toggle is unavailable.');
		}
		timelineToggle.click();
		await new Promise(resolve => window.setTimeout(resolve, 30));
		const mapYearSlider = historyMapView.containerEl.querySelector(
			'.cr-map-time-slider'
		);
		if (!(mapYearSlider instanceof HTMLInputElement)) {
			throw new Error('Map time slider is unavailable.');
		}
		history.mapSliderFocus = {
			sliderYear: Number(mapYearSlider.value),
			focus: plugin.getTemporalFocusService().get(),
			bridgeStatus: historyMapView.containerEl.querySelector(
				'.cr-map-container'
			)?.getAttribute('data-map-temporal-bridge-status') ?? null,
			bridgeReason: historyMapView.containerEl.querySelector(
				'.cr-map-container'
			)?.getAttribute('data-map-temporal-bridge-reason') ?? null
		};

		// C5 BCE bridge: add a temporary legacy person so the real MapData year
		// range genuinely exposes -456 on the slider. This verifies the user path
		// rather than bypassing the range input's min/max constraints.
		const bceBridgePersonPath =
			'Workspace-E2E/History/People/M6-BCE-Bridge-Person.md';
		const existingBceBridgePerson =
			app.vault.getAbstractFileByPath(bceBridgePersonPath);
		if (existingBceBridgePerson) {
			await app.vault.delete(existingBceBridgePerson);
		}
		const bceBridgePerson = await app.vault.create(
			bceBridgePersonPath,
			[
				'---',
				'cr_schema: 2',
				'cr_type: person',
				'cr_id: workspace-history-bce-bridge-person',
				'name: M6 BCE Bridge Person',
				'born: "-456"',
				'died: "-455"',
				'---',
				''
			].join('\\n')
		);
		await new Promise(resolve => window.setTimeout(resolve, 50));
		await historyMapView.refreshData();
		for (let i = 0; i < 80 && Number(mapYearSlider.min) > -456; i++) {
			await new Promise(resolve => window.setTimeout(resolve, 25));
		}

		// The default remains reject, but an explicit BCE-display interpretation
		// makes -456 mean 456 BCE (astronomical -455).
		const originalLegacyYearSemantics =
			plugin.settings.legacyNegativeYearSemantics ?? 'reject';
		const originalMapSliderYear = Number(mapYearSlider.value);
		plugin.settings.legacyNegativeYearSemantics = 'bce_display';
		mapYearSlider.value = '-456';
		mapYearSlider.dispatchEvent(new Event('input', { bubbles: true }));
		await new Promise(resolve => window.setTimeout(resolve, 30));
		history.mapSliderBceFocus = {
			sliderMin: Number(mapYearSlider.min),
			sliderYear: Number(mapYearSlider.value),
			focus: plugin.getTemporalFocusService().get(),
			bridgeStatus: historyMapView.containerEl.querySelector(
				'.cr-map-container'
			)?.getAttribute('data-map-temporal-bridge-status') ?? null,
			bridgeReason: historyMapView.containerEl.querySelector(
				'.cr-map-container'
			)?.getAttribute('data-map-temporal-bridge-reason') ?? null,
			expectedStart: historicalCalendar.solarToJulianDay({
				year: -455,
				month: 1,
				day: 1
			}),
			expectedEndExclusive: historicalCalendar.solarToJulianDay({
				year: -454,
				month: 1,
				day: 1
			})
		};

		plugin.settings.legacyNegativeYearSemantics = originalLegacyYearSemantics;
		mapYearSlider.value = String(originalMapSliderYear);
		mapYearSlider.dispatchEvent(new Event('input', { bubbles: true }));
		await app.vault.delete(bceBridgePerson);
		await historyMapView.refreshData();
		await new Promise(resolve => window.setTimeout(resolve, 30));

		timelineToggle.click();
		await new Promise(resolve => window.setTimeout(resolve, 20));
		history.mapSliderFocusAfterDisable =
			plugin.getTemporalFocusService().get();

		// Restore the historical BCE fixture focus used by the rest of this
		// scenario so the new bridge check does not disturb older assertions.
		plugin.getTemporalFocusService().setPoint(
			historicalCalendar.solarToJulianDay({
				year: -456,
				month: 6,
				day: 1
			}),
			'e2e-history'
		);
		await new Promise(resolve => window.setTimeout(resolve, 20));

		history.mapTemporal = readTemporalMap();

		// Exercise M6 C2 provider hot-switching on the already-open Map. Reuse
		// CARTO's tile URL so the test validates provider/datum plumbing without
		// depending on a separate external tile service.
		const mapLeafForBasemap = app.workspace.getLeavesOfType('canvas-roots-map')[0];
		const mapViewForBasemap = mapLeafForBasemap?.view;
		const mapControllerForBasemap = mapViewForBasemap?.mapController;
		if (!mapControllerForBasemap) {
			throw new Error('Map controller is unavailable for basemap E2E.');
		}
		const originalBasemapId = plugin.settings.geographicBasemapId;
		const originalCustomBasemaps = [
			...(plugin.settings.customGeographicBasemaps ?? [])
		];
		plugin.settings.customGeographicBasemaps = [{
			id: 'e2e-gcj',
			label: 'E2E GCJ',
			coordinateCRS: 'gcj02',
			tileUrl: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
			attribution: 'E2E',
			maxZoom: 19,
			miniMapMaxZoom: 13,
			noReferrer: true
		}];
		plugin.settings.geographicBasemapId = 'e2e-gcj';
		await plugin.saveSettings();
		await mapViewForBasemap.refreshGeographicBasemapSettings();
		const gcjDefinition = mapControllerForBasemap.getGeographicBasemapDefinition();
		const gcjDisplay = mapControllerForBasemap.canonicalGeographicToMapLatLng(
			34.7478004,
			113.6192856
		);
		history.basemapHotSwitch = {
			id: gcjDefinition.id,
			crs: gcjDefinition.coordinateCRS,
			lat: gcjDisplay.lat,
			lng: gcjDisplay.lng
		};
		history.controlAfterBasemapSwitch = readTemporalMap();

		plugin.settings.geographicBasemapId = originalBasemapId;
		plugin.settings.customGeographicBasemaps = originalCustomBasemaps;
		await plugin.saveSettings();
		await mapViewForBasemap.refreshGeographicBasemapSettings();
		const restoredDefinition = mapControllerForBasemap.getGeographicBasemapDefinition();
		const restoredDisplay = mapControllerForBasemap.canonicalGeographicToMapLatLng(
			34.7478004,
			113.6192856
		);
		history.basemapRestored = {
			id: restoredDefinition.id,
			crs: restoredDefinition.coordinateCRS,
			lat: restoredDisplay.lat,
			lng: restoredDisplay.lng
		};

		plugin.getTemporalFocusService().clear();
		await new Promise(resolve => window.setTimeout(resolve, 30));
		history.mapTemporalCleared = readTemporalMap();

		plugin.getTemporalFocusService().setPoint(
			historicalCalendar.solarToJulianDay({
				year: -456,
				month: 6,
				day: 1
			}),
			'e2e-history'
		);
		await new Promise(resolve => window.setTimeout(resolve, 30));
		history.timelineContext = readTimelineView();

		await plugin.activateRelationshipsView();
		await new Promise(resolve => window.setTimeout(resolve, 100));
		history.relationshipTemporal = readTemporalRelationships();

		await plugin.setActiveWorkspace('shushan');
		await new Promise(resolve => window.setTimeout(resolve, 80));
		const shushanTimeline = readTimelineView();
		const shushanMapAfterSwitch = readTemporalMap();

		plugin.getTemporalFocusService().setPoint(
			historicalCalendar.solarToJulianDay({
				year: 115,
				month: 6,
				day: 1
			}),
			'e2e-shushan'
		);
		await new Promise(resolve => window.setTimeout(resolve, 50));
		const shushanTimelineFocused = readTimelineView();
		const shushanMapFocused = readTemporalMap();
		const shushanRelationshipTemporal = readTemporalRelationships();

		const fictionPersonFile = app.vault.getFileByPath(
			'Workspace-E2E/Shushan/People/Fiction-Person.md'
		);
		if (!fictionPersonFile) {
			throw new Error('Fiction Person fixture is unavailable.');
		}
		await plugin.activateProfileView(fictionPersonFile);
		await new Promise(resolve => window.setTimeout(resolve, 100));
		const shushanProfileTemporal = readTemporalProfile();

		const shushanAssertionState = temporalAssertionStateService.getAt(
			historicalCalendar.solarToJulianDay({
				year: 115,
				month: 6,
				day: 1
			})
		);

		// C5 chronology-local bidirectional smoke:
		// Map fictional slider -> shared chronology focus -> Timeline axis,
		// then a real Timeline click -> shared chronology focus -> Map slider.
		const chronologyPaths = [
			'Workspace-E2E/Shushan/People/C5-Chronology-Person.md',
			'Workspace-E2E/Shushan/Events/C5-Chronology-Early.md',
			'Workspace-E2E/Shushan/Events/C5-Chronology-Late.md'
		];
		for (const path of chronologyPaths) {
			const existing = app.vault.getAbstractFileByPath(path);
			if (existing) await app.vault.delete(existing);
		}
		await app.vault.create(chronologyPaths[0], [
			'---',
			'cr_schema: 2',
			'cr_type: person',
			'cr_id: c5-chronology-person',
			'name: C5 Chronology Person',
			'universe: Star Wars',
			'born: "BBY 82"',
			'died: "BBY 78"',
			'---',
			''
		].join('\\n'));
		await app.vault.create(chronologyPaths[1], [
			'---',
			'cr_schema: 2',
			'cr_type: event',
			'cr_id: c5-chronology-early',
			'title: C5 Chronology Early',
			'event_type: other',
			'universe: Star Wars',
			'time_start: "BBY 82"',
			'---',
			''
		].join('\\n'));
		await app.vault.create(chronologyPaths[2], [
			'---',
			'cr_schema: 2',
			'cr_type: event',
			'cr_id: c5-chronology-late',
			'title: C5 Chronology Late',
			'event_type: other',
			'universe: Star Wars',
			'time_start: "BBY 79"',
			'---',
			''
		].join('\\n'));

		for (let i = 0; i < 80; i++) {
			const ready = chronologyPaths.every(path =>
				app.metadataCache.getCache(path)?.frontmatter?.cr_type
			);
			if (ready) break;
			await new Promise(resolve => window.setTimeout(resolve, 25));
		}

		historyMapView.filters.universe = 'Star Wars';
		await historyMapView.refreshData();
		const chronologyToggle = historyMapView.containerEl.querySelector(
			'button[aria-label="Timeline"]'
		);
		if (!(chronologyToggle instanceof HTMLButtonElement)) {
			throw new Error('Chronology Map Timeline toggle is unavailable.');
		}
		if (!historyMapView.timeSlider.enabled) {
			chronologyToggle.click();
		}
		await new Promise(resolve => window.setTimeout(resolve, 60));

		const chronologySlider = historyMapView.containerEl.querySelector(
			'.cr-map-time-slider'
		);
		if (!(chronologySlider instanceof HTMLInputElement)) {
			throw new Error('Chronology Map slider is unavailable.');
		}
		const chronologyFocusFromMap = plugin.getTemporalFocusService().get();
		const chronologyTimelineFromMap = readTimelineView();

		// The Timeline leaf may be hidden after Profile/Map interactions. Reveal it
		// before pointer-based clicking so getBoundingClientRect() reflects the
		// real interactive viewport instead of a zero-width hidden leaf.
		await plugin.activateTemporalTimelineView();
		await new Promise(resolve => window.setTimeout(resolve, 60));

		const chronologySvg = app.workspace
			.getLeavesOfType('charted-roots-temporal-timeline')[0]
			?.view?.containerEl?.querySelector('.cr-v2-timeline__svg');
		if (!(chronologySvg instanceof SVGSVGElement)) {
			throw new Error('Chronology Timeline SVG is unavailable.');
		}
		const chronologyBounds = chronologySvg.getBoundingClientRect();
		chronologySvg.dispatchEvent(new MouseEvent('click', {
			bubbles: true,
			clientX: chronologyBounds.left + chronologyBounds.width * 0.7,
			clientY: chronologyBounds.top + 60
		}));
		await new Promise(resolve => window.setTimeout(resolve, 60));

		const chronologyFocusFromTimeline =
			plugin.getTemporalFocusService().get();
		const chronologySync = {
			fromMap: {
				sliderYear: Number(chronologySlider.value),
				focus: chronologyFocusFromMap,
				timeline: chronologyTimelineFromMap
			},
			fromTimeline: {
				focus: chronologyFocusFromTimeline,
				sliderYear: Number(chronologySlider.value),
				followAxis: historyMapView.containerEl.querySelector(
					'.cr-map-container'
				)?.getAttribute('data-map-temporal-follow-axis') ?? null,
				followYear: Number(historyMapView.containerEl.querySelector(
					'.cr-map-container'
				)?.getAttribute('data-map-temporal-follow-year'))
			}
		};

		if (historyMapView.timeSlider.enabled) {
			chronologyToggle.click();
		}
		plugin.getTemporalFocusService().clear();
		historyMapView.filters.universe = undefined;
		for (const path of chronologyPaths) {
			const current = app.vault.getAbstractFileByPath(path);
			if (current) await app.vault.delete(current);
		}
		await historyMapView.refreshData();
		await new Promise(resolve => window.setTimeout(resolve, 40));

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
			timelineFocused: shushanTimelineFocused,
			relationshipTemporal: shushanRelationshipTemporal,
			profileTemporal: shushanProfileTemporal,
			mapAfterWorkspaceSwitch: shushanMapAfterSwitch,
			mapFocused: shushanMapFocused,
			chronologySync,
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
		'Workspace-E2E/History/Layers/History-Control-Layer.md',
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
	assert.deepEqual(workspaceState.history.timelineContext.contextActiveIds, [
		'workspace-history-period',
		'workspace-history-process'
	]);
	assert.deepEqual(workspaceState.history.timelineContext.contextPossibleIds, [
		'workspace-history-bounded-period'
	]);
	assert.equal(
		workspaceState.history.timelineContext.contextSummary,
		'2 active · 1 possible'
	);
	assert.deepEqual(workspaceState.history.relationshipTemporal.activeIds, [
		'workspace-history-assertion'
	]);
	assert.deepEqual(workspaceState.history.relationshipTemporal.possibleIds, []);
	assert.match(workspaceState.history.relationshipTemporal.focusText, /BCE/);
	assert.equal(
		workspaceState.history.relationshipTemporal.summary,
		'1 active · 0 possible'
	);
	assert.deepEqual(workspaceState.history.controlStorage, {
		ids: ['workspace-history-control-layer']
	});
	assert.match(
		workspaceState.history.controlImport.manifestPath,
		/^Workspace-E2E\/History\/Layers\//
	);
	assert.match(
		workspaceState.history.controlImport.geojsonPath,
		/^Workspace-E2E\/History\/Layers\//
	);
	assert.equal(workspaceState.history.controlImport.coordinateCrs, 'wgs84');
	assert.equal(
		workspaceState.history.controlImport.sourceCoordinateCrs,
		'gcj02'
	);
	assert.ok(
		Math.abs(workspaceState.history.controlImport.point[0] - 113.6192856)
			<= 1e-5
	);
	assert.ok(
		Math.abs(workspaceState.history.controlImport.point[1] - 34.7478004)
			<= 1e-5
	);
	assert.ok(
		workspaceState.history.controlImport.runtimeIds.length
			=== workspaceState.history.controlStorage.ids.length + 1
	);
	assert.ok(
		workspaceState.history.controlImport.rendered.controlFeatureIds
			.includes('imported-gcj-point')
	);
	assert.deepEqual(
		workspaceState.history.controlImportAfterCleanup.ids,
		['workspace-history-control-layer']
	);
	assert.equal(workspaceState.history.mapSliderFocus.sliderYear, 115);
	assert.equal(workspaceState.history.mapSliderFocus.bridgeStatus, 'resolved');
	assert.equal(workspaceState.history.mapSliderFocus.bridgeReason, '');
	assert.equal(workspaceState.history.mapSliderFocus.focus.kind, 'range');
	assert.equal(
		workspaceState.history.mapSliderFocus.focus.source,
		'map-time-slider'
	);
	assert.ok(workspaceState.history.mapSliderBceFocus.sliderMin <= -456);
	assert.equal(workspaceState.history.mapSliderBceFocus.sliderYear, -456);
	assert.equal(
		workspaceState.history.mapSliderBceFocus.bridgeStatus,
		'resolved'
	);
	assert.equal(workspaceState.history.mapSliderBceFocus.bridgeReason, '');
	assert.equal(workspaceState.history.mapSliderBceFocus.focus.kind, 'range');
	assert.equal(
		workspaceState.history.mapSliderBceFocus.focus.source,
		'map-time-slider'
	);
	assert.equal(
		workspaceState.history.mapSliderBceFocus.focus.start,
		workspaceState.history.mapSliderBceFocus.expectedStart
	);
	assert.equal(
		workspaceState.history.mapSliderBceFocus.focus.endExclusive,
		workspaceState.history.mapSliderBceFocus.expectedEndExclusive
	);
	assert.equal(workspaceState.history.mapSliderFocusAfterDisable, null);
	assert.equal(
		workspaceState.history.controlImportAfterCleanup.rendered.controlFeatureIds
			.includes('imported-gcj-point'),
		false
	);
	assert.deepEqual(workspaceState.history.mapTemporal, {
		focusKind: 'point',
		markerCount: 1,
		activeCount: 1,
		possibleCount: 0,
		markerIds: ['history-place'],
		states: ['active'],
		contextActiveIds: [
			'workspace-history-period',
			'workspace-history-process'
		],
		contextPossibleIds: ['workspace-history-bounded-period'],
		contextSummary: '2 active · 1 possible',
		controlActiveCount: 1,
		controlPossibleCount: 1,
		controlIssueCount: 0,
		controlFeatureIds: [
			'history-control-active',
			'history-control-possible'
		],
		controlStates: ['active', 'possible']
	});
	assert.equal(workspaceState.history.basemapHotSwitch.id, 'e2e-gcj');
	assert.equal(workspaceState.history.basemapHotSwitch.crs, 'gcj02');
	assert.ok(
		Math.abs(workspaceState.history.basemapHotSwitch.lat - 34.7466173) <= 1e-5
	);
	assert.ok(
		Math.abs(workspaceState.history.basemapHotSwitch.lng - 113.6253334) <= 1e-5
	);
	assert.equal(
		workspaceState.history.controlAfterBasemapSwitch.controlActiveCount,
		1
	);
	assert.equal(
		workspaceState.history.controlAfterBasemapSwitch.controlPossibleCount,
		1
	);
	assert.deepEqual(
		workspaceState.history.controlAfterBasemapSwitch.controlFeatureIds,
		['history-control-active', 'history-control-possible']
	);
	assert.equal(workspaceState.history.basemapRestored.id, 'carto-voyager');
	assert.equal(workspaceState.history.basemapRestored.crs, 'wgs84');
	assert.ok(
		Math.abs(workspaceState.history.basemapRestored.lat - 34.7478004) <= 1e-9
	);
	assert.ok(
		Math.abs(workspaceState.history.basemapRestored.lng - 113.6192856) <= 1e-9
	);

	assert.deepEqual(workspaceState.history.mapTemporalCleared, {
		focusKind: '',
		markerCount: 0,
		activeCount: 0,
		possibleCount: 0,
		markerIds: [],
		states: [],
		contextActiveIds: [],
		contextPossibleIds: [],
		contextSummary: '',
		controlActiveCount: 0,
		controlPossibleCount: 0,
		controlIssueCount: 0,
		controlFeatureIds: [],
		controlStates: []
	});
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
	assert.deepEqual(workspaceState.shushan.timelineFocused.contextActiveIds, [
		'workspace-shushan-period',
		'workspace-shushan-process'
	]);
	assert.deepEqual(workspaceState.shushan.timelineFocused.contextPossibleIds, []);
	assert.equal(
		workspaceState.shushan.timelineFocused.contextSummary,
		'2 active · 0 possible'
	);
	assert.deepEqual(workspaceState.shushan.mapAfterWorkspaceSwitch, {
		focusKind: 'point',
		markerCount: 0,
		activeCount: 0,
		possibleCount: 0,
		markerIds: [],
		states: [],
		contextActiveIds: [],
		contextPossibleIds: [],
		contextSummary: '0 active · 0 possible',
		controlActiveCount: 0,
		controlPossibleCount: 0,
		controlIssueCount: 0,
		controlFeatureIds: [],
		controlStates: []
	});
	assert.deepEqual(workspaceState.shushan.mapFocused.contextActiveIds, [
		'workspace-shushan-period',
		'workspace-shushan-process'
	]);
	assert.deepEqual(workspaceState.shushan.mapFocused.contextPossibleIds, []);
	assert.equal(
		workspaceState.shushan.mapFocused.contextSummary,
		'2 active · 0 possible'
	);
	assert.equal(workspaceState.shushan.timeline.groupBy, 'person');
	assert.equal(workspaceState.shushan.timeline.persistedGroupBy, 'person');
	assert.deepEqual(workspaceState.shushan.timeline.laneLabels, [
		'Fiction Person',
		'Ungrouped'
	]);
	assert.equal(
		workspaceState.shushan.chronologySync.fromMap.focus?.axis?.kind,
		'chronology_year'
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromMap.focus?.axis?.chronologyId,
		'star_wars'
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromMap.focus?.source,
		'map-time-slider'
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromMap.timeline.scale,
		'chronology-year'
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromMap.timeline.chronologyId,
		'star_wars'
	);
	assert.deepEqual(
		workspaceState.shushan.chronologySync.fromMap.timeline.spanIds,
		['c5-chronology-early', 'c5-chronology-late']
	);
	assert.ok(
		workspaceState.shushan.chronologySync.fromMap.timeline.tickLabels
			.every(label => / BBY$/.test(label))
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromTimeline.focus?.axis?.kind,
		'chronology_year'
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromTimeline.focus?.axis?.chronologyId,
		'star_wars'
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromTimeline.focus?.source,
		'timeline'
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromTimeline.focus?.kind,
		'range'
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromTimeline.sliderYear,
		workspaceState.shushan.chronologySync.fromTimeline.focus?.start
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromTimeline.followAxis,
		'chronology_year'
	);
	assert.equal(
		workspaceState.shushan.chronologySync.fromTimeline.followYear,
		workspaceState.shushan.chronologySync.fromTimeline.sliderYear
	);
	assert.deepEqual(workspaceState.shushan.relationshipTemporal.activeIds, [
		'workspace-shushan-assertion'
	]);
	assert.deepEqual(workspaceState.shushan.relationshipTemporal.possibleIds, []);
	assert.match(workspaceState.shushan.relationshipTemporal.focusText, /CE/);
	assert.equal(
		workspaceState.shushan.relationshipTemporal.summary,
		'1 active · 0 possible'
	);
	assert.deepEqual(workspaceState.shushan.profileTemporal.items, [
		{
			assertionId: 'workspace-shushan-assertion',
			state: 'active',
			relationKind: 'affiliation',
			text: workspaceState.shushan.profileTemporal.items[0].text
		}
	]);
	assert.match(
		workspaceState.shushan.profileTemporal.items[0].text,
		/Fiction Organization/
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

	// Architecture acceptance A1: mount an isolated Spring/Autumn-shaped
	// legacy Workspace, execute only its Ready migration subset through the
	// real plugin boundary, prove backup/audit semantics and Workspace-scoped
	// Assertion visibility, then restore the original catalog and active scope.
	const architectureAcceptance = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const service = plugin.getWorkspaceService();
		if (!service) throw new Error('Workspace service unavailable for architecture acceptance.');

		const previousCatalog = service.getCatalog();
		const previousActive = service.getActiveId();
		const acceptanceCatalog = {
			version: 1,
			workspaces: [
				...previousCatalog.workspaces,
				{
					id: 'acceptance-history',
					name: '架构验收',
					rootFolder: 'Workspace-E2E/Acceptance-History',
					mode: 'historical',
					enabledPacks: ['core', 'chinese-history']
				}
			]
		};

		let snapshot;
		try {
			await plugin.replaceWorkspaceCatalog(acceptanceCatalog);
			await plugin.setActiveWorkspace('acceptance-history');

			const activeService = plugin.getWorkspaceService();
			if (activeService?.getActiveId() !== 'acceptance-history') {
				throw new Error('Acceptance Workspace did not become active.');
			}

			const plan = plugin.buildV2MigrationPlan();
			const planFiles = plan.files
				.map(file => ({
					path: file.filePath,
					status: file.status,
					operations: file.operations.length
				}))
				.sort((a, b) => a.path.localeCompare(b.path));

			const ministerPath =
				'Workspace-E2E/Acceptance-History/People/Legacy-Minister.md';
			const reviewPath =
				'Workspace-E2E/Acceptance-History/People/Review-Title.md';
			const eventPath =
				'Workspace-E2E/Acceptance-History/Events/Legacy-Alliance.md';
			const minister = app.vault.getFileByPath(ministerPath);
			const review = app.vault.getFileByPath(reviewPath);
			const event = app.vault.getFileByPath(eventPath);
			if (!minister || !review || !event) {
				throw new Error('Architecture acceptance fixture is incomplete.');
			}

			const originalMinister = await app.vault.read(minister);
			const originalReview = await app.vault.read(review);
			const originalEvent = await app.vault.read(event);

			const result = await plugin.executeV2MigrationReady(plan, {
				runId: 'spring-warring-ready',
				assertionFolder:
					'Workspace-E2E/Acceptance-History/Assertions/Migrated',
				backupRoot: '.charted-roots/e2e-architecture-acceptance'
			});

			const adapter = app.vault.adapter;
			const backupRoot =
				'.charted-roots/e2e-architecture-acceptance/spring-warring-ready';
			const manifest = JSON.parse(
				await adapter.read(backupRoot + '/manifest.json')
			);
			const ministerBackup = await adapter.read(
				backupRoot + '/originals/' + ministerPath
			);
			const eventBackup = await adapter.read(
				backupRoot + '/originals/' + eventPath
			);

			const migratedMinister = await app.vault.read(minister);
			const migratedReview = await app.vault.read(review);
			const migratedEvent = await app.vault.read(event);

			const assertions = plugin.getAssertionService().getAll()
				.map(record => ({
					crId: record.assertion.cr_id,
					predicate: record.assertion.predicate,
					object: record.assertion.object ?? null,
					timeStart: record.assertion.time_start ?? null,
					timeEnd: record.assertion.time_end ?? null,
					role: record.raw.role ?? null,
					path: record.filePath
				}))
				.sort((a, b) =>
					a.predicate.localeCompare(b.predicate)
					|| String(a.timeStart).localeCompare(String(b.timeStart))
				);

			const byPredicate = Object.fromEntries(
				assertions.map(assertion => [assertion.predicate, assertion.crId])
			);
			const membershipIds = assertions
				.filter(assertion => assertion.predicate === 'member_of')
				.map(assertion => assertion.crId)
				.sort();

			await plugin.activateTemporalTimelineView();
			const timelineLeaf = app.workspace
				.getLeavesOfType('charted-roots-temporal-timeline')[0];
			timelineLeaf?.view?.refresh?.();
			await new Promise(resolve => window.setTimeout(resolve, 30));
			const timelineRoot = timelineLeaf?.view?.containerEl;
			const timeline = {
				workspace: timelineRoot
					?.querySelector('.cr-v2-timeline__workspace')?.textContent ?? '',
				spanIds: [...(timelineRoot?.querySelectorAll(
					'.cr-v2-timeline__span'
				) ?? [])]
					.map(element => element.getAttribute('data-item-id'))
					.filter(Boolean)
					.sort()
			};

			const calendar = plugin.getHistoricalDateService()
				.getCalendarProvider('tyme');
			if (!calendar) {
				throw new Error('Historical calendar unavailable for architecture acceptance.');
			}
			const focusAtBce = displayYear =>
				calendar.solarToJulianDay({
					year: 1 - displayYear,
					month: 6,
					day: 1
				});
			const focusService = plugin.getTemporalFocusService();

			const readRelationships = () => {
				const root = app.workspace
					.getLeavesOfType('canvas-roots-relationships')[0]
					?.view?.containerEl;
				return [...(root?.querySelectorAll(
					'.cr-rv-temporal-state__item[data-temporal-state="active"]'
				) ?? [])]
					.map(element => element.getAttribute('data-assertion-id'))
					.filter(Boolean)
					.sort();
			};
			const readProfile = () => {
				const root = app.workspace
					.getLeavesOfType('charted-roots-entity-profile')[0]
					?.view?.containerEl;
				return [...(root?.querySelectorAll(
					'.cr-profile__temporal-institution-item[data-temporal-state="active"]'
				) ?? [])]
					.map(element => ({
						id: element.getAttribute('data-assertion-id'),
						text: element.textContent ?? ''
					}))
					.sort((a, b) => String(a.id).localeCompare(String(b.id)));
			};

			focusService.setPoint(
				focusAtBce(675),
				'architecture-acceptance'
			);
			await plugin.activateRelationshipsView();
			await new Promise(resolve => window.setTimeout(resolve, 80));
			const relationships675 = readRelationships();
			await plugin.activateProfileView(minister);
			await new Promise(resolve => window.setTimeout(resolve, 100));
			const profile675 = readProfile();

			focusService.setPoint(
				focusAtBce(665),
				'architecture-acceptance'
			);
			await plugin.activateRelationshipsView();
			await new Promise(resolve => window.setTimeout(resolve, 80));
			const relationships665 = readRelationships();
			await plugin.activateProfileView(minister);
			await new Promise(resolve => window.setTimeout(resolve, 100));
			const profile665 = readProfile();

			const crossViews = {
				timeline,
				ids: {
					ally: byPredicate.ally,
					rival: byPredicate.rival,
					memberships: membershipIds
				},
				relationships675,
				relationships665,
				profile675,
				profile665
			};

			snapshot = {
				activeDuringRun: activeService.getActiveId(),
				plan: {
					executableFiles: plan.executableFiles,
					reviewFiles: plan.reviewFiles,
					blockedFiles: plan.blockedFiles,
					files: planFiles
				},
				result,
				manifest: {
					status: manifest.status,
					sourceBackupCount: manifest.sourceBackups.length,
					createdAssertionCount: manifest.createdAssertionPaths.length
				},
				backups: {
					ministerExact: ministerBackup === originalMinister,
					eventExact: eventBackup === originalEvent
				},
				reviewUntouched: migratedReview === originalReview,
				minister: {
					hasSchema2: /cr_schema:\\s*2/.test(migratedMinister),
					hasLegacyMembership: /membership_orgs:/.test(migratedMinister),
					hasLegacyAlly: /^ally:/m.test(migratedMinister),
					hasLegacyRival: /^rival:/m.test(migratedMinister)
				},
				event: {
					hasSchema2: /cr_schema:\\s*2/.test(migratedEvent),
					hasTimeStart: /time_start:\\s*['"]?BCE 656/.test(migratedEvent),
					hasTimeEnd: /time_end:\\s*['"]?BCE 655/.test(migratedEvent),
					hasLegacyDate: /^date:/m.test(migratedEvent),
					hasLegacyDateEnd: /^date_end:/m.test(migratedEvent)
				},
				assertions,
				crossViews
			};
		} finally {
			plugin.getTemporalFocusService().clear();
			await plugin.replaceWorkspaceCatalog(previousCatalog);
			await plugin.setActiveWorkspace(previousActive);
		}

		return {
			...snapshot,
			restoredActive: plugin.getWorkspaceService()?.getActiveId() ?? null,
			restoredWorkspaceIds: plugin.getWorkspaceService()
				?.getCatalog().workspaces.map(workspace => workspace.id).sort() ?? []
		};
	`);

	assert.equal(architectureAcceptance.activeDuringRun, 'acceptance-history');
	assert.equal(architectureAcceptance.plan.executableFiles, 2);
	assert.equal(architectureAcceptance.plan.reviewFiles, 1);
	assert.equal(architectureAcceptance.plan.blockedFiles, 0);
	assert.deepEqual(architectureAcceptance.plan.files, [
		{
			path: 'Workspace-E2E/Acceptance-History/Events/Legacy-Alliance.md',
			status: 'ready',
			operations: 1
		},
		{
			path: 'Workspace-E2E/Acceptance-History/People/Legacy-Minister.md',
			status: 'ready',
			operations: 5
		},
		{
			path: 'Workspace-E2E/Acceptance-History/People/Review-Title.md',
			status: 'review',
			operations: 0
		}
	]);
	assert.equal(architectureAcceptance.result.success, true);
	assert.equal(architectureAcceptance.result.rolledBack, false);
	assert.equal(architectureAcceptance.result.filesMigrated, 2);
	assert.equal(architectureAcceptance.result.assertionsCreated, 4);
	assert.equal(architectureAcceptance.result.rewrittenFiles, 2);
	assert.equal(architectureAcceptance.manifest.status, 'completed');
	assert.equal(architectureAcceptance.manifest.sourceBackupCount, 2);
	assert.equal(architectureAcceptance.manifest.createdAssertionCount, 4);
	assert.deepEqual(architectureAcceptance.backups, {
		ministerExact: true,
		eventExact: true
	});
	assert.equal(architectureAcceptance.reviewUntouched, true);
	assert.deepEqual(architectureAcceptance.minister, {
		hasSchema2: true,
		hasLegacyMembership: false,
		hasLegacyAlly: false,
		hasLegacyRival: false
	});
	assert.deepEqual(architectureAcceptance.event, {
		hasSchema2: true,
		hasTimeStart: true,
		hasTimeEnd: true,
		hasLegacyDate: false,
		hasLegacyDateEnd: false
	});
	assert.deepEqual(
		architectureAcceptance.assertions.map(item => ({
			predicate: item.predicate,
			timeStart: item.timeStart,
			timeEnd: item.timeEnd,
			role: item.role
		})),
		[
			{ predicate: 'ally', timeStart: 'BCE 690', timeEnd: 'BCE 671', role: null },
			{ predicate: 'member_of', timeStart: 'BCE 680', timeEnd: 'BCE 660', role: '卿' },
			{ predicate: 'member_of', timeStart: 'BCE 700', timeEnd: 'BCE 650', role: '国人' },
			{ predicate: 'rival', timeStart: 'BCE 670', timeEnd: 'BCE 660', role: null }
		]
	);
	assert.ok(
		architectureAcceptance.assertions.every(item =>
			item.path.startsWith(
				'Workspace-E2E/Acceptance-History/Assertions/Migrated/'
			)
		)
	);

	assert.equal(
		architectureAcceptance.crossViews.timeline.workspace,
		'架构验收'
	);
	assert.deepEqual(
		architectureAcceptance.crossViews.timeline.spanIds,
		[
			'acceptance-alliance',
			...architectureAcceptance.assertions.map(item => item.crId)
		].sort()
	);
	const allyId = architectureAcceptance.crossViews.ids.ally;
	const rivalId = architectureAcceptance.crossViews.ids.rival;
	const membershipIds = architectureAcceptance.crossViews.ids.memberships;
	assert.ok(allyId);
	assert.ok(rivalId);
	assert.equal(membershipIds.length, 2);

	assert.ok(
		architectureAcceptance.crossViews.relationships675.includes(allyId)
	);
	assert.equal(
		architectureAcceptance.crossViews.relationships675.includes(rivalId),
		false
	);
	assert.ok(
		architectureAcceptance.crossViews.relationships665.includes(rivalId)
	);
	assert.equal(
		architectureAcceptance.crossViews.relationships665.includes(allyId),
		false
	);

	assert.deepEqual(
		architectureAcceptance.crossViews.profile675.map(item => item.id).sort(),
		membershipIds
	);
	assert.deepEqual(
		architectureAcceptance.crossViews.profile665.map(item => item.id).sort(),
		membershipIds
	);
	assert.ok(
		architectureAcceptance.crossViews.profile675
			.map(item => item.text)
			.join(' ')
			.includes('齐国')
	);
	assert.ok(
		architectureAcceptance.crossViews.profile675
			.map(item => item.text)
			.join(' ')
			.includes('齐国朝廷')
	);

	assert.equal(architectureAcceptance.restoredActive, 'history-cn');
	assert.deepEqual(architectureAcceptance.restoredWorkspaceIds, [
		'history-cn',
		'shushan'
	]);

	// M6 C3: create a time-bounded historical Place name through the real
	// Profile UI, then prove shared TemporalFocus changes Profile + Map display
	// without renaming the stable Place entity.
	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const place = app.vault.getAbstractFileByPath(
			'Workspace-E2E/History/Places/History-Place.md'
		);
		if (!place || typeof place.path !== 'string') {
			throw new Error('History Place fixture is unavailable.');
		}
		await plugin.activateProfileView(place);
		return true;
	`);
	await session.waitFor(
		`document.querySelector('.cr-profile__add-historical-name')`
	);
	await session.evalInApp(`
		const button = document.querySelector('.cr-profile__add-historical-name');
		if (!(button instanceof HTMLButtonElement)) {
			throw new Error('Add historical name button is unavailable.');
		}
		button.click();
		return true;
	`);
	await session.waitFor(
		`document.querySelector('.cr-historical-name-modal')`
	);

	await session.evalInApp(`
		const modal = document.querySelector('.cr-historical-name-modal');
		if (!modal) throw new Error('Historical name modal is unavailable.');

		const field = (label) => {
			const setting = [...modal.querySelectorAll('.setting-item')]
				.find(el => el.querySelector('.setting-item-name')?.textContent === label);
			return setting?.querySelector('input, textarea');
		};
		const setValue = (label, value) => {
			const input = field(label);
			if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement)) {
				throw new Error('Historical name field unavailable: ' + label);
			}
			input.value = value;
			input.dispatchEvent(new Event('input', { bubbles: true }));
		};

		setValue('Historical name', 'E2E Ancient Name');
		setValue('Start', 'BCE 500');
		setValue('End', 'BCE 400');
		setValue('Source reference', '[[Workspace-E2E/History/Sources/History-Source|History Source]]');

		const create = [...modal.querySelectorAll('button')]
			.find(button => button.textContent?.trim() === 'Add historical name');
		if (!(create instanceof HTMLButtonElement)) {
			throw new Error('Historical name create button is unavailable.');
		}
		create.click();
		return true;
	`);

	await session.waitFor(
		`(() => {
			const plugin = app.plugins.plugins['charted-roots'];
			const place = app.vault.getAbstractFileByPath(
				'Workspace-E2E/History/Places/History-Place.md'
			);
			if (!place || typeof place.path !== 'string') return false;
			return plugin.getAssertionService().getForFile(place).some(record =>
				record.assertion.predicate === 'has_designation'
				&& record.assertion.value === 'E2E Ancient Name'
			);
		})()`
	);

	const historicalNameFocus = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		const calendar = plugin.getHistoricalDateService().getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar is unavailable.');
		const position = calendar.solarToJulianDay({
			year: -450,
			month: 6,
			day: 1
		});
		plugin.getTemporalFocusService().setPoint(position, 'e2e-place-name');
		return position;
	`);
	assert.equal(Number.isFinite(historicalNameFocus), true);

	await session.waitFor(
		`document.querySelector('.cr-profile__historical-name-focus-value')
			?.textContent?.includes('E2E Ancient Name')`
	);

	await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		await plugin.activateMapView();
		return true;
	`);
	await session.waitFor(
		`app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view?.mapController
			?.currentDisplayData`
	);

	const historicalMapDisplay = await session.evalInApp(`
		const place = app.vault.getAbstractFileByPath(
			'Workspace-E2E/History/Places/History-Place.md'
		);
		const placeId = app.metadataCache.getFileCache(place)?.frontmatter?.cr_id;
		const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
		const data = view?.mapController?.currentDisplayData;
		return {
			placeId,
			placeMarkerName: data?.placeMarkers?.find(marker => marker.placeId === placeId)
				?.placeName ?? null,
			eventMarkerNames: (data?.markers ?? [])
				.filter(marker => marker.placeId === placeId)
				.map(marker => marker.placeName),
			journeyNames: (data?.journeyPaths ?? [])
				.flatMap(journey => journey.waypoints)
				.filter(waypoint => waypoint.placeId === placeId)
				.map(waypoint => waypoint.name)
		};
	`);
	assert.equal(historicalMapDisplay.placeMarkerName, 'E2E Ancient Name');
	assert.ok(
		historicalMapDisplay.eventMarkerNames.length === 0
		|| historicalMapDisplay.eventMarkerNames.every(name => name === 'E2E Ancient Name')
	);
	assert.ok(
		historicalMapDisplay.journeyNames.length === 0
		|| historicalMapDisplay.journeyNames.every(name => name === 'E2E Ancient Name')
	);

	const restoredHistoricalName = await session.evalInApp(`
		const plugin = app.plugins.plugins['charted-roots'];
		plugin.getTemporalFocusService().clear();
		await new Promise(resolve => window.setTimeout(resolve, 40));
		const place = app.vault.getAbstractFileByPath(
			'Workspace-E2E/History/Places/History-Place.md'
		);
		const placeId = app.metadataCache.getFileCache(place)?.frontmatter?.cr_id;
		const view = app.workspace.getLeavesOfType('canvas-roots-map')[0]?.view;
		const data = view?.mapController?.currentDisplayData;
		const record = plugin.getAssertionService().getForFile(place).find(item =>
			item.assertion.predicate === 'has_designation'
			&& item.assertion.value === 'E2E Ancient Name'
		);
		const result = {
			profileFocusPresent: !!document.querySelector(
				'.cr-profile__historical-name-focus-value'
			),
			placeMarkerName: data?.placeMarkers?.find(marker => marker.placeId === placeId)
				?.placeName ?? null,
			canonicalName: app.metadataCache.getFileCache(place)?.frontmatter?.name ?? null
		};
		if (record) await app.vault.delete(record.file);
		return result;
	`);
	assert.equal(restoredHistoricalName.profileFocusPresent, false);
	assert.equal(restoredHistoricalName.placeMarkerName, 'History Place');
	assert.equal(restoredHistoricalName.canonicalName, 'History Place');

	await session.screenshot(path.join(ARTIFACTS, 'v2-historical-place-name.png'));
	await session.screenshot(path.join(ARTIFACTS, 'v2-workspaces-foundation.png'));
});
