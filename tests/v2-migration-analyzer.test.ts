import { describe, expect, it } from 'vitest';
import {
	V2MigrationAnalyzer,
	analyzeLegacyFrontmatter,
	buildMigrationPreview,
	fingerprintFrontmatter
} from '../src/v2';

describe('v2 legacy migration analyzer', () => {
	it('freezes aligned membership arrays into safe conversion records', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			cr_id: 'a',
			membership_orgs: ['[[Org A]]', '[[Org B]]'],
			membership_org_ids: ['org-a', 'org-b'],
			membership_roles: ['Ruler', 'Advisor'],
			membership_from_dates: ['200', '210'],
			membership_to_dates: ['209', ''],
			membership_notes: ['first', 'second']
		});

		expect(result.hasBlockers).toBe(false);
		const finding = result.findings.find(item => item.code === 'membership_parallel_arrays');
		expect(finding).toMatchObject({
			severity: 'info',
			autoMigrate: true,
			count: 2
		});
		expect(finding?.details?.records).toEqual([
			{
				org: '[[Org A]]',
				orgId: 'org-a',
				role: 'Ruler',
				from: '200',
				to: '209',
				notes: 'first'
			},
			{
				org: '[[Org B]]',
				orgId: 'org-b',
				role: 'Advisor',
				from: '210',
				to: undefined,
				notes: 'second'
			}
		]);
	});

	it('allows completely absent optional membership companion fields', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			cr_id: 'a',
			membership_orgs: ['[[Org A]]', '[[Org B]]']
		});

		expect(result.hasBlockers).toBe(false);
		expect(result.findings.find(item => item.code === 'membership_parallel_arrays'))
			.toMatchObject({ autoMigrate: true, count: 2 });
	});

	it('blocks partially populated parallel membership arrays instead of guessing', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			membership_orgs: ['[[Org A]]', '[[Org B]]', '[[Org C]]'],
			membership_roles: ['Ruler', 'Advisor']
		});

		const finding = result.findings.find(item => item.code === 'parallel_array_misaligned');
		expect(finding).toMatchObject({
			severity: 'blocker',
			autoMigrate: false
		});
		expect(finding?.details).toEqual({
			expectedLength: 3,
			actualLengths: { membership_roles: 2 }
		});
	});

	it('requires a wikilink for automatic membership migration and reviews id-only targets', () => {
		const blocked = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			membership_orgs: ['Plain Org']
		});
		expect(blocked.findings.find(item => item.code === 'membership_invalid_target'))
			.toMatchObject({ severity: 'blocker' });

		const recoverable = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			membership_orgs: ['Plain Org'],
			membership_org_ids: ['org-a']
		});
		expect(recoverable.findings.find(item => item.code === 'membership_invalid_target'))
			.toMatchObject({ severity: 'review', autoMigrate: false });
	});

	it('blocks misaligned relationship metadata and preserves aligned record details', () => {
		const blocked = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			mentor: ['[[B]]', '[[C]]', '[[D]]'],
			mentor_from: ['200', '210']
		}, { relationshipTypeIds: ['mentor'] });

		expect(blocked.hasBlockers).toBe(true);
		expect(blocked.findings.some(item =>
			item.code === 'parallel_array_misaligned'
			&& item.fields.includes('mentor_from')
		)).toBe(true);

		const safe = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			mentor: ['[[B]]'],
			mentor_id: ['b'],
			mentor_from: ['200'],
			mentor_to: ['210']
		}, { relationshipTypeIds: ['mentor'] });

		const finding = safe.findings.find(item => item.code === 'relationship_parallel_arrays');
		expect(finding).toMatchObject({ autoMigrate: true, count: 1 });
		expect(finding?.details).toMatchObject({
			relationshipType: 'mentor',
			records: [{
				target: '[[B]]',
				targetId: 'b',
				from: '200',
				to: '210'
			}]
		});
	});

	it('preserves compact kinship fields while still requiring the v2 schema marker', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			father: '[[B]]',
			mother: '[[C]]',
			spouse: ['[[D]]'],
			spouses: ['[[E]]']
		}, {
			relationshipTypeIds: ['father', 'mother', 'spouse', 'spouses']
		});

		expect(result.findings.map(item => item.code)).toEqual([
			'legacy_schema_candidate'
		]);
		expect(result.findings.some(item =>
			item.code === 'relationship_parallel_arrays'
		)).toBe(false);
	});

	it('records legacy Event date and reversed relative-order mapping without rewriting', () => {
		const result = analyzeLegacyFrontmatter('Events/E.md', {
			cr_type: 'event',
			date: 'BCE 453',
			date_end: 'BCE 452',
			date_precision: 'exact',
			before: ['[[Later Event]]'],
			after: ['[[Earlier Event]]']
		});

		expect(result.findings.find(item => item.code === 'legacy_event_date')?.details)
			.toEqual({ time_start: 'BCE 453', time_end: 'BCE 452' });
		expect(result.findings.find(item => item.code === 'legacy_date_precision'))
			.toMatchObject({ severity: 'review', autoMigrate: false });
		expect(result.findings.find(item => item.code === 'legacy_event_relative_order')?.details)
			.toEqual({
				before: {
					targetField: 'chronologically_after',
					value: ['[[Later Event]]']
				},
				after: {
					targetField: 'chronologically_before',
					value: ['[[Earlier Event]]']
				}
			});
	});

	it('requires semantic review for identity and research grouping fields', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			occupation: '丞相',
			title: '魏王',
			collection: '三国专题',
			group_name: '曹氏'
		});

		expect(result.findings.filter(item => item.severity === 'review').map(item => item.code))
			.toEqual([
				'dynamic_identity_review',
				'dynamic_identity_review',
				'collection_review',
				'group_name_review'
			]);
	});

	it('does not mistake a v2 Assertion qualifier for legacy membership', () => {
		const result = analyzeLegacyFrontmatter('Assertions/Office.md', {
			cr_schema: 2,
			cr_type: 'assertion',
			cr_id: 'a1',
			assertion_type: 'office_holding',
			subject: '[[曹操]]',
			predicate: 'holds_office',
			object: '[[丞相]]',
			organization: '[[汉朝廷]]'
		}, { relationshipTypeIds: ['mentor'] });

		expect(result.findings).toEqual([]);
		expect(result.hasLegacyData).toBe(false);
	});

	it('flags organization member arrays as mirrored data requiring cross-note review', () => {
		const result = analyzeLegacyFrontmatter('Organizations/A.md', {
			cr_type: 'organization',
			cr_id: 'org-a',
			members: ['[[Person A]]'],
			members_id: ['person-a']
		});

		expect(result.findings.find(item => item.code === 'organization_members_mirror'))
			.toMatchObject({
				severity: 'review',
				autoMigrate: false
			});
	});
});

describe('migration snapshot safety', () => {
	it('fingerprints equivalent object key order identically and changes with data', () => {
		const a = fingerprintFrontmatter({
			cr_type: 'person',
			membership_roles: ['Ruler'],
			membership_orgs: ['[[A]]']
		});
		const b = fingerprintFrontmatter({
			membership_orgs: ['[[A]]'],
			cr_type: 'person',
			membership_roles: ['Ruler']
		});
		const changed = fingerprintFrontmatter({
			cr_type: 'person',
			membership_roles: ['Advisor'],
			membership_orgs: ['[[A]]']
		});

		expect(a).toBe(b);
		expect(changed).not.toBe(a);
	});

	it('builds preview only from the frozen analysis snapshot', () => {
		const analysis = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			cr_id: 'a',
			membership_orgs: ['[[Org A]]'],
			membership_roles: ['Ruler']
		});
		const report = {
			filesScanned: 1,
			filesWithLegacyData: 1,
			safeConversions: 1,
			reviewItems: 0,
			blockers: 0,
			files: [analysis]
		};
		const preview = buildMigrationPreview(report);
		const action = preview.files[0].actions.find(item => item.code === 'membership_parallel_arrays');

		expect(preview.files[0].sourceFingerprint).toBe(analysis.sourceFingerprint);
		expect(preview.files[0].status).toBe('ready');
		expect(action?.kind).toBe('create_assertions');
		expect(action?.details).toEqual(
			analysis.findings.find(item => item.code === 'membership_parallel_arrays')?.details
		);

		const details = analysis.findings.find(item => item.code === 'membership_parallel_arrays')?.details;
		if (details) details.records = [];
		expect((action?.details?.records as unknown[])).toHaveLength(1);
	});
});

describe('V2MigrationAnalyzer live relationship definitions', () => {
	it('uses a live relationship type provider on every analyze call', () => {
		const frontmatter = {
			cr_schema: 2,
			cr_type: 'person',
			cr_id: 'a',
			mentor: ['[[B]]']
		};
		const file = { path: 'People/A.md' };
		let ids: readonly string[] = [];

		const app = {
			vault: {
				getMarkdownFiles: () => [file]
			},
			metadataCache: {
				getFileCache: () => ({ frontmatter })
			}
		} as never;

		const analyzer = new V2MigrationAnalyzer(app, {
			relationshipTypeIdProvider: () => ids
		});

		expect(analyzer.analyze().filesWithLegacyData).toBe(0);
		ids = ['mentor'];
		expect(analyzer.analyze().filesWithLegacyData).toBe(1);
		expect(analyzer.analyze().files[0].findings.some(
			item => item.code === 'relationship_parallel_arrays'
		)).toBe(true);
	});
});
