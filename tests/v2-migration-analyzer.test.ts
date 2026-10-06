import { describe, expect, it } from 'vitest';
import { analyzeLegacyFrontmatter } from '../src/v2';

const relationshipTypes = ['mentor', 'ally', 'godparent'];

describe('v2 legacy migration analyzer', () => {
	it('marks aligned membership arrays as safely convertible', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			cr_id: 'a',
			membership_orgs: ['[[Org A]]', '[[Org B]]'],
			membership_roles: ['Ruler', 'Advisor'],
			membership_from_dates: ['200', '210'],
			membership_to_dates: ['209', ''],
			membership_notes: ['first', 'second']
		}, { relationshipTypeIds: relationshipTypes });

		expect(result.hasBlockers).toBe(false);
		const finding = result.findings.find(item => item.code === 'membership_parallel_arrays');
		expect(finding).toMatchObject({
			severity: 'info',
			autoMigrate: true,
			count: 2
		});
	});

	it('allows completely absent optional membership companion fields', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			membership_orgs: ['[[Org A]]', '[[Org B]]']
		});

		expect(result.hasBlockers).toBe(false);
		expect(result.findings.some(item => item.code === 'membership_parallel_arrays')).toBe(true);
	});

	it('blocks partially populated parallel membership arrays', () => {
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

	it('blocks misaligned relationship metadata instead of guessing', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			mentor: ['[[B]]', '[[C]]', '[[D]]'],
			mentor_from: ['200', '210']
		}, { relationshipTypeIds: relationshipTypes });

		expect(result.hasBlockers).toBe(true);
		expect(result.findings.some(item =>
			item.code === 'parallel_array_misaligned'
			&& item.fields.includes('mentor_from')
		)).toBe(true);
	});

	it('accepts aligned relationship fields and rejects non-wikilink targets', () => {
		const safe = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			mentor: ['[[B]]'],
			mentor_from: ['200'],
			mentor_to: ['210']
		}, { relationshipTypeIds: relationshipTypes });

		expect(safe.findings.find(item => item.code === 'relationship_parallel_arrays'))
			.toMatchObject({ autoMigrate: true, count: 1 });

		const unsafe = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			mentor: ['B']
		}, { relationshipTypeIds: relationshipTypes });

		expect(unsafe.findings.find(item => item.code === 'invalid_relationship_target'))
			.toMatchObject({ severity: 'blocker', autoMigrate: false });
	});

	it('preserves compact father/mother/spouse fields instead of migrating them', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			father: '[[B]]',
			mother: '[[C]]',
			spouse: ['[[D]]']
		}, {
			relationshipTypeIds: ['father', 'mother', 'spouse']
		});

		expect(result.findings).toEqual([]);
	});

	it('detects malformed nested membership and relationship records', () => {
		const result = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			memberships: [{ role: 'Advisor' }],
			relationships: [{ type: 'mentor', target: 'not-a-link' }]
		}, { relationshipTypeIds: relationshipTypes });

		expect(result.findings.filter(item => item.severity === 'blocker')).toHaveLength(2);
	});

	it('maps legacy Event relative ordering with the old reversed semantics', () => {
		const result = analyzeLegacyFrontmatter('Events/E.md', {
			cr_type: 'event',
			date: 'BCE 453',
			date_end: 'BCE 452',
			date_precision: 'exact',
			before: ['[[Later Event]]'],
			after: ['[[Earlier Event]]']
		});

		expect(result.findings.find(item => item.code === 'legacy_event_date'))
			.toMatchObject({ autoMigrate: true });
		expect(result.findings.find(item => item.code === 'legacy_date_precision'))
			.toMatchObject({ severity: 'review', autoMigrate: false });
		expect(result.findings.find(item => item.code === 'legacy_event_relative_order')?.details)
			.toEqual({
				before: 'chronologically_after',
				after: 'chronologically_before'
			});
	});

	it('requires semantic review for occupation/title and research grouping fields', () => {
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
});


describe('migration analyzer entity scoping', () => {
	it('does not mistake a v2 Assertion organization qualifier for legacy Person membership', () => {
		const result = analyzeLegacyFrontmatter('Assertions/Office.md', {
			cr_schema: 2,
			cr_type: 'assertion',
			cr_id: 'a1',
			assertion_type: 'office_holding',
			subject: '[[曹操]]',
			predicate: 'holds_office',
			object: '[[丞相]]',
			organization: '[[汉朝廷]]'
		}, { relationshipTypeIds: relationshipTypes });

		expect(result.findings).toEqual([]);
		expect(result.hasLegacyData).toBe(false);
	});

	it('still recognizes an untyped legacy person with simple organization membership', () => {
		const result = analyzeLegacyFrontmatter('People/Legacy.md', {
			cr_id: 'legacy-person',
			name: 'Legacy Person',
			organization: '[[Old Org]]',
			role: 'Advisor'
		});

		expect(result.findings.find(item => item.code === 'membership_simple'))
			.toMatchObject({ autoMigrate: true, count: 1 });
	});
});
