import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { HistoricalFamilyChartProjector } from '../src/v2/historical-family-chart/projector';

function file(path: string): TFile {
	const basename = path.split('/').pop()!.replace(/\.md$/, '');
	return { path, basename, extension: 'md' } as TFile;
}

function buildHarness() {
	const files = new Map<string, TFile>([
		['People/曹操', file('People/曹操.md')],
		['People/刘备', file('People/刘备.md')],
		['People/孙权', file('People/孙权.md')],
		['Organizations/曹魏', file('Organizations/曹魏.md')]
	]);
	const frontmatter = new Map<string, Record<string, unknown>>([
		['People/曹操.md', { cr_type: 'person', cr_id: 'p-cao', name: '曹操' }],
		['People/刘备.md', { cr_type: 'person', cr_id: 'p-liu', name: '刘备' }],
		['People/孙权.md', { cr_type: 'person', cr_id: 'p-sun', name: '孙权' }],
		['Organizations/曹魏.md', {
			cr_type: 'organization',
			cr_id: 'o-wei',
			name: '曹魏'
		}]
	]);

	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null
		},
		metadataCache: {
			getFirstLinkpathDest: (path: string) => files.get(path) ?? null,
			getFileCache: (target: TFile) => ({
				frontmatter: frontmatter.get(target.path)
			})
		}
	} as any;

	const source = file('Assertions/history.md');
	const make = (
		id: string,
		predicate: string,
		subject: string,
		object: string,
		extra: Record<string, unknown> = {}
	) => ({
		assertionType: 'relationship',
		subject,
		predicate,
		object,
		origin: 'assertion_note',
		sourceFile: source,
		time_start: extra.time_start as string | undefined,
		time_end: extra.time_end as string | undefined,
		materialized: {
			file: source,
			filePath: `Assertions/${id}.md`,
			assertion: {} as any,
			raw: {
				cr_id: id,
				confidence: extra.confidence,
				research_status: extra.research_status,
				...extra
			}
		}
	});

	const records = [
		make('a-ally', 'ally', '[[People/曹操]]', '[[People/刘备]]', {
			time_start: '196 CE',
			time_end: '199 CE',
			confidence: 'medium'
		}),
		make('a-rival', 'rival', '[[People/曹操]]', '[[People/孙权]]', {
			time_start: '208 CE',
			time_end: '220 CE'
		}),
		make('a-org', 'member_of', '[[People/曹操]]', '[[Organizations/曹魏]]', {
			time_start: '216 CE'
		}),
		make('a-father', 'father', '[[People/曹操]]', '[[People/刘备]]'),
		make('a-undated', 'mentor', '[[People/刘备]]', '[[People/孙权]]')
	];

	const semantic = {
		getAll: () => records
	} as any;

	const ontologyDefs: Record<string, any> = {
		ally: {
			id: 'ally',
			labels: { en: 'Ally', 'zh-CN': '同盟' },
			symmetric: true
		},
		rival: {
			id: 'rival',
			labels: { en: 'Rival', 'zh-CN': '竞争' },
			symmetric: true
		},
		member_of: {
			id: 'member_of',
			labels: { en: 'Member of', 'zh-CN': '隶属' }
		},
		father: {
			id: 'father',
			labels: { en: 'Father', 'zh-CN': '父亲' },
			includeOnFamilyTree: true,
			familyGraphMapping: 'parent'
		},
		mentor: {
			id: 'mentor',
			labels: { en: 'Mentor', 'zh-CN': '师友' }
		}
	};
	const ontology = {
		getPredicate: (id: string) => ontologyDefs[id],
		getPredicateLabel: (id: string, locale: string) =>
			ontologyDefs[id]?.labels?.[locale]
			?? ontologyDefs[id]?.labels?.en
			?? id
	} as any;

	return { app, semantic, ontology };
}

describe('HistoricalFamilyChartProjector', () => {
	it('projects all-time materialized Person-to-Person historical relationships', () => {
		const { app, semantic, ontology } = buildHarness();
		const projector = new HistoricalFamilyChartProjector(
			app,
			semantic,
			ontology,
			null
		);

		const result = projector.project(null, 'zh-CN');

		expect(result.focusApplied).toBe(false);
		expect(result.edges.map(edge => edge.id)).toEqual([
			'a-ally',
			'a-rival',
			'a-undated'
		]);
		expect(result.edges[0]).toMatchObject({
			predicate: 'ally',
			label: '同盟',
			symmetric: true,
			directed: false,
			temporalState: 'all_time'
		});
		expect(result.skipped.nonPersonEndpoint).toBe(1);
		expect(result.skipped.structuralFamilyPredicate).toBe(1);
	});

	it('uses active/possible temporal assertion state for a JDN point focus', () => {
		const { app, semantic, ontology } = buildHarness();
		const temporalState = {
			getAt: () => ({
				position: 1,
				active: [{
					state: 'active',
					id: 'a-ally',
					subject: '',
					predicate: 'ally',
					item: { typeId: 'relationship' }
				}],
				possible: [{
					state: 'possible',
					id: 'a-rival',
					subject: '',
					predicate: 'rival',
					item: { typeId: 'relationship' }
				}]
			})
		} as any;
		const projector = new HistoricalFamilyChartProjector(
			app,
			semantic,
			ontology,
			temporalState
		);

		const result = projector.project({
			kind: 'point',
			position: 1
		});

		expect(result.focusApplied).toBe(true);
		expect(result.edges.map(edge => [edge.id, edge.temporalState])).toEqual([
			['a-ally', 'active'],
			['a-rival', 'possible']
		]);
		expect(result.skipped.undatedAtFocus).toBe(1);
	});

	it('never reinterprets chronology-year focus as Julian Day', () => {
		const { app, semantic, ontology } = buildHarness();
		const projector = new HistoricalFamilyChartProjector(
			app,
			semantic,
			ontology,
			{} as any
		);

		const result = projector.project({
			kind: 'point',
			position: 208,
			axis: {
				kind: 'chronology_year',
				chronologyId: 'shushan-calendar'
			}
		});

		expect(result.focusApplied).toBe(false);
		expect(result.focusIgnoredReason).toBe('unsupported_axis');
		expect(result.edges.map(edge => edge.id)).toEqual([
			'a-ally',
			'a-rival',
			'a-undated'
		]);
	});

	it('deduplicates symmetric duplicate assertions by predicate and person pair', () => {
		const { app, semantic, ontology } = buildHarness();
		const first = semantic.getAll()[0];
		semantic.getAll = () => [
			first,
			{
				...first,
				subject: '[[People/刘备]]',
				object: '[[People/曹操]]',
				materialized: {
					...first.materialized,
					filePath: 'Assertions/a-ally-reverse.md',
					raw: {
						...first.materialized.raw,
						cr_id: 'a-ally-reverse'
					}
				}
			}
		];
		const projector = new HistoricalFamilyChartProjector(
			app,
			semantic,
			ontology,
			null
		);

		const result = projector.project(null);

		expect(result.edges).toHaveLength(1);
		expect(result.skipped.symmetricDuplicate).toBe(1);
	});
});
