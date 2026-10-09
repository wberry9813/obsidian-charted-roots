import { describe, expect, it } from 'vitest';
import {
	AssertionService,
	V2Linter,
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
		filesWithLegacyData: files.filter(file => file.hasLegacyData).length,
		safeConversions: findings.filter(
			finding => finding.autoMigrate && finding.severity === 'info'
		).length,
		reviewItems: findings.filter(finding => finding.severity === 'review').length,
		blockers: findings.filter(finding => finding.severity === 'blocker').length,
		files
	};
}

function makeFile(path: string) {
	return { path } as never;
}

function makeApp(entries: Array<{ path: string; frontmatter: Record<string, unknown> }>) {
	const files = entries.map(entry => makeFile(entry.path));
	const frontmatterByPath = new Map(
		entries.map(entry => [entry.path, entry.frontmatter])
	);
	return {
		vault: {
			getMarkdownFiles: () => files
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => ({
				frontmatter: frontmatterByPath.get(file.path)
			})
		}
	};
}

describe('v2 architecture acceptance — Spring/Autumn and Warring States shape', () => {
	it('plans temporal affiliations, changing relationships and event dates without guessing reviewed identity fields', () => {
		const person = analyzeLegacyFrontmatter('People/Spring-A.md', {
			cr_type: 'person',
			cr_id: 'spring-a',
			name: '春秋人物甲',
			membership_orgs: [
				'[[Organizations/Qi|齐国]]',
				'[[Organizations/Qi-Court|齐国朝廷]]'
			],
			membership_roles: ['国人', '卿'],
			membership_from_dates: ['BCE 700', 'BCE 680'],
			membership_to_dates: ['BCE 650', 'BCE 660'],
			ally: ['[[People/Spring-B|春秋人物乙]]'],
			ally_from: ['BCE 690'],
			ally_to: ['BCE 671'],
			rival: ['[[People/Spring-B|春秋人物乙]]'],
			rival_from: ['BCE 670'],
			rival_to: ['BCE 660']
		}, { relationshipTypeIds: ['ally', 'rival'] });

		const event = analyzeLegacyFrontmatter('Events/Alliance.md', {
			cr_type: 'event',
			cr_id: 'spring-alliance',
			title: '会盟事件',
			date: 'BCE 656',
			date_end: 'BCE 655'
		});

		const review = analyzeLegacyFrontmatter('People/Identity-Review.md', {
			cr_type: 'person',
			cr_id: 'identity-review',
			name: '身份待考人物',
			title: '卿'
		});

		const plan = buildMigrationPlan(
			reportFor(person, event, review),
			createV2OntologyRegistry()
		);

		expect(plan.executableFiles).toBe(2);
		expect(plan.reviewFiles).toBe(1);
		expect(plan.blockedFiles).toBe(0);
		expect(plan.files.find(file => file.filePath === 'People/Identity-Review.md'))
			?.toMatchObject({ status: 'review', operations: [] });

		const personPlan = plan.files.find(
			file => file.filePath === 'People/Spring-A.md'
		);
		expect(personPlan?.status).toBe('ready');
		const assertions = personPlan?.operations.filter(
			operation => operation.kind === 'create_assertion'
		) ?? [];
		expect(assertions).toHaveLength(4);
		expect(assertions).toEqual(expect.arrayContaining([
			expect.objectContaining({
				draft: expect.objectContaining({
					assertionType: 'affiliation',
					predicate: 'member_of',
					object: '[[Organizations/Qi|齐国]]',
					timeStart: 'BCE 700',
					timeEnd: 'BCE 650',
					qualifiers: { role: '国人' }
				})
			}),
			expect.objectContaining({
				draft: expect.objectContaining({
					assertionType: 'relationship',
					predicate: 'ally',
					object: '[[People/Spring-B|春秋人物乙]]',
					timeStart: 'BCE 690',
					timeEnd: 'BCE 671'
				})
			}),
			expect.objectContaining({
				draft: expect.objectContaining({
					assertionType: 'relationship',
					predicate: 'rival',
					object: '[[People/Spring-B|春秋人物乙]]',
					timeStart: 'BCE 670',
					timeEnd: 'BCE 660'
				})
			})
		]));

		const eventPlan = plan.files.find(
			file => file.filePath === 'Events/Alliance.md'
		);
		expect(eventPlan?.operations).toEqual([
			{
				kind: 'rewrite_frontmatter',
				set: {
					time_start: 'BCE 656',
					time_end: 'BCE 655',
					cr_schema: 2,
					cr_type: 'event'
				},
				remove: ['date', 'date_end']
			}
		]);
	});

	it('accepts one representative v2 historical graph spanning the architecture layers', () => {
		const entries = [
			['People/Spring-A.md', {
				cr_schema: 2, cr_type: 'person', cr_id: 'spring-a', name: '春秋人物甲'
			}],
			['People/Spring-B.md', {
				cr_schema: 2, cr_type: 'person', cr_id: 'spring-b', name: '春秋人物乙'
			}],
			['Organizations/Qi.md', {
				cr_schema: 2, cr_type: 'organization', cr_id: 'qi', name: '齐国', org_type: 'state'
			}],
			['Organizations/Qi-Court.md', {
				cr_schema: 2, cr_type: 'organization', cr_id: 'qi-court', name: '齐国朝廷', org_type: 'institution'
			}],
			['Offices/Qi-Minister.md', {
				cr_schema: 2, cr_type: 'office', cr_id: 'qi-minister', name: '齐卿', office_type: 'court'
			}],
			['Events/Alliance.md', {
				cr_schema: 2, cr_type: 'event', cr_id: 'spring-alliance', name: '会盟事件', time_start: 'BCE 656'
			}],
			['Processes/Hegemony.md', {
				cr_schema: 2, cr_type: 'process', cr_id: 'hegemony-process', name: '诸侯争霸', time_start: 'BCE 700', time_end: 'BCE 600'
			}],
			['Periods/Spring-Autumn.md', {
				cr_schema: 2, cr_type: 'period', cr_id: 'spring-autumn', name: '春秋时期', time_start: 'BCE 770', time_end: 'BCE 476'
			}],
			['Sources/Zuo-Zhuan.md', {
				cr_schema: 2, cr_type: 'source', cr_id: 'zuo-zhuan', title: '左传', source_type: 'text'
			}],
			['Assertions/Affiliation.md', {
				cr_schema: 2, cr_type: 'assertion', cr_id: 'a-affiliation',
				assertion_type: 'affiliation',
				subject: '[[People/Spring-A|春秋人物甲]]',
				predicate: 'member_of',
				object: '[[Organizations/Qi-Court|齐国朝廷]]',
				time_start: 'BCE 680',
				time_end: 'BCE 660'
			}],
			['Assertions/Office.md', {
				cr_schema: 2, cr_type: 'assertion', cr_id: 'a-office',
				assertion_type: 'office_holding',
				subject: '[[People/Spring-A|春秋人物甲]]',
				predicate: 'holds_office',
				object: '[[Offices/Qi-Minister|齐卿]]',
				time_start: 'BCE 680',
				time_end: 'BCE 660'
			}],
			['Assertions/Ally.md', {
				cr_schema: 2, cr_type: 'assertion', cr_id: 'a-ally',
				assertion_type: 'relationship',
				subject: '[[People/Spring-A|春秋人物甲]]',
				predicate: 'ally',
				object: '[[People/Spring-B|春秋人物乙]]',
				time_start: 'BCE 690',
				time_end: 'BCE 671'
			}],
			['Assertions/Rival.md', {
				cr_schema: 2, cr_type: 'assertion', cr_id: 'a-rival',
				assertion_type: 'relationship',
				subject: '[[People/Spring-A|春秋人物甲]]',
				predicate: 'rival',
				object: '[[People/Spring-B|春秋人物乙]]',
				time_start: 'BCE 670',
				time_end: 'BCE 660'
			}],
			['Citations/Zuo-Zhuan-Affiliation.md', {
				cr_schema: 2, cr_type: 'citation', cr_id: 'c-affiliation',
				source: '[[Sources/Zuo-Zhuan|左传]]',
				target: '[[Assertions/Affiliation]]',
				locator: '代表性测试定位',
				relation: 'supports'
			}],
			['Claims/Hegemony.md', {
				cr_schema: 2, cr_type: 'claim', cr_id: 'claim-hegemony',
				claim_type: 'causal',
				statement: '代表性测试：制度与联盟变化共同影响争霸进程。',
				asserted_by: 'self',
				about: ['[[Organizations/Qi|齐国]]'],
				evidence: ['[[Assertions/Affiliation]]']
			}]
		] as Array<[string, Record<string, unknown>]>;

		const app = makeApp(entries.map(([path, frontmatter]) => ({
			path,
			frontmatter
		})));
		const assertions = new AssertionService(app as never);
		const issues = new V2Linter(
			app as never,
			createV2OntologyRegistry(),
			assertions
		).lint();

		expect(issues.filter(issue => issue.severity === 'error')).toEqual([]);
		expect(entries.map(([, frontmatter]) => frontmatter.cr_type)).toEqual(
			expect.arrayContaining([
				'person',
				'organization',
				'office',
				'event',
				'process',
				'period',
				'assertion',
				'source',
				'citation',
				'claim'
			])
		);
	});
});
