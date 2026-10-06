import { describe, expect, it } from 'vitest';
import {
	analyzeLegacyFrontmatter,
	buildMigrationPlan,
	createV2OntologyRegistry,
	type FileMigrationAnalysis,
	type MigrationAnalysisReport
} from '../src/v2';

function reportFor(...files: FileMigrationAnalysis[]): MigrationAnalysisReport {
	const findings = files.flatMap(file => file.findings);
	return {
		filesScanned: files.length,
		filesWithLegacyData: files.length,
		safeConversions: findings.filter(item => item.autoMigrate && item.severity === 'info').length,
		reviewItems: findings.filter(item => item.severity === 'review').length,
		blockers: findings.filter(item => item.severity === 'blocker').length,
		files
	};
}

describe('v2 migration plan builder', () => {
	it('turns one ready person snapshot into explicit Assertion drafts plus one rewrite', () => {
		const analysis = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			cr_id: 'a',
			membership_orgs: ['[[Organizations/Court|Court]]', '[[Organizations/Clan|Clan]]'],
			membership_org_ids: ['court', 'clan'],
			membership_roles: ['Advisor', 'Member'],
			membership_from_dates: ['200', '210'],
			membership_to_dates: ['209', ''],
			membership_notes: ['first', 'second'],
			mentor: ['[[People/B|B]]'],
			mentor_id: ['b'],
			mentor_from: ['205'],
			mentor_to: ['215'],
			mentor_notes: ['teacher']
		}, { relationshipTypeIds: ['mentor'] });

		const plan = buildMigrationPlan(reportFor(analysis), createV2OntologyRegistry());
		const file = plan.files[0];

		expect(file.status).toBe('ready');
		expect(file.sourceFingerprint).toBe(analysis.sourceFingerprint);
		expect(file.operations).toHaveLength(4);
		expect(plan.operationCount).toBe(4);

		const creates = file.operations.filter(operation => operation.kind === 'create_assertion');
		expect(creates).toHaveLength(3);

		expect(creates[0]).toMatchObject({
			kind: 'create_assertion',
			draft: {
				assertionType: 'affiliation',
				subject: '[[People/A]]',
				predicate: 'member_of',
				object: '[[Organizations/Court|Court]]',
				timeStart: '200',
				timeEnd: '209',
				notes: 'first',
				qualifiers: { role: 'Advisor' }
			}
		});
		expect(creates[1]).toMatchObject({
			draft: {
				predicate: 'member_of',
				object: '[[Organizations/Clan|Clan]]',
				timeStart: '210',
				qualifiers: { role: 'Member' }
			}
		});
		expect(creates[2]).toMatchObject({
			draft: {
				assertionType: 'relationship',
				subject: '[[People/A]]',
				predicate: 'mentor',
				object: '[[People/B|B]]',
				timeStart: '205',
				timeEnd: '215',
				notes: 'teacher'
			}
		});

		const rewrite = file.operations.find(operation => operation.kind === 'rewrite_frontmatter');
		expect(rewrite).toMatchObject({
			kind: 'rewrite_frontmatter',
			set: { cr_schema: 2 }
		});
		if (!rewrite || rewrite.kind !== 'rewrite_frontmatter') return;
		expect(rewrite.remove).toEqual(expect.arrayContaining([
			'membership_orgs',
			'membership_org_ids',
			'membership_roles',
			'membership_from_dates',
			'membership_to_dates',
			'membership_notes',
			'mentor',
			'mentor_id',
			'mentor_from',
			'mentor_to',
			'mentor_notes'
		]));
	});

	it('produces no operations for review or blocked files', () => {
		const review = analyzeLegacyFrontmatter('People/Review.md', {
			cr_type: 'person',
			cr_id: 'review',
			occupation: '丞相'
		});
		const blocked = analyzeLegacyFrontmatter('People/Blocked.md', {
			cr_type: 'person',
			cr_id: 'blocked',
			membership_orgs: ['[[A]]', '[[B]]'],
			membership_roles: ['Only one']
		});

		const plan = buildMigrationPlan(
			reportFor(review, blocked),
			createV2OntologyRegistry()
		);

		expect(plan.reviewFiles).toBe(1);
		expect(plan.blockedFiles).toBe(1);
		expect(plan.operationCount).toBe(0);
		expect(plan.files.find(file => file.filePath === 'People/Review.md')?.operations).toEqual([]);
		expect(plan.files.find(file => file.filePath === 'People/Blocked.md')?.operations).toEqual([]);
	});

	it('downgrades an otherwise-ready file when its predicate is not registered', () => {
		const analysis = analyzeLegacyFrontmatter('People/A.md', {
			cr_type: 'person',
			cr_id: 'a',
			custom_relation: ['[[B]]']
		}, { relationshipTypeIds: ['custom_relation'] });

		const plan = buildMigrationPlan(reportFor(analysis), createV2OntologyRegistry());
		const file = plan.files[0];

		expect(file.status).toBe('review');
		expect(file.operations).toEqual([]);
		expect(file.reasons.join(' ')).toMatch(/custom_relation/);
	});

	it('plans deterministic Event field rewrites when no semantic review is required', () => {
		const analysis = analyzeLegacyFrontmatter('Events/E.md', {
			cr_type: 'event',
			cr_id: 'e',
			date: 'BCE 453',
			date_end: 'BCE 452',
			before: ['[[Later]]'],
			after: ['[[Earlier]]']
		});

		const plan = buildMigrationPlan(reportFor(analysis), createV2OntologyRegistry());
		const file = plan.files[0];

		expect(file.status).toBe('ready');
		expect(file.operations).toHaveLength(1);
		expect(file.operations[0]).toEqual({
			kind: 'rewrite_frontmatter',
			set: {
				time_start: 'BCE 453',
				time_end: 'BCE 452',
				chronologically_after: ['[[Later]]'],
				chronologically_before: ['[[Earlier]]'],
				cr_schema: 2,
				cr_type: 'event'
			},
			remove: ['date', 'date_end', 'before', 'after']
		});
	});
	it('stamps compact legacy notes without materializing preserved kinship', () => {
		const analysis = analyzeLegacyFrontmatter('People/Compact.md', {
			cr_type: 'person',
			cr_id: 'compact',
			father: '[[People/Father|Father]]',
			mother: '[[People/Mother|Mother]]'
		}, {
			relationshipTypeIds: ['father', 'mother']
		});

		const plan = buildMigrationPlan(reportFor(analysis), createV2OntologyRegistry());
		const file = plan.files[0];

		expect(file.status).toBe('ready');
		expect(file.operations).toEqual([{
			kind: 'rewrite_frontmatter',
			set: {
				cr_schema: 2,
				cr_type: 'person'
			},
			remove: []
		}]);
	});

	it('canonicalizes the legacy type field to cr_type during schema stamping', () => {
		const analysis = analyzeLegacyFrontmatter('People/LegacyType.md', {
			type: 'person',
			cr_id: 'legacy-type',
			father: '[[People/Father|Father]]'
		});

		const plan = buildMigrationPlan(reportFor(analysis), createV2OntologyRegistry());
		const file = plan.files[0];

		expect(file.status).toBe('ready');
		expect(file.operations).toEqual([{
			kind: 'rewrite_frontmatter',
			set: {
				cr_schema: 2,
				cr_type: 'person'
			},
			remove: ['type']
		}]);
	});

});
