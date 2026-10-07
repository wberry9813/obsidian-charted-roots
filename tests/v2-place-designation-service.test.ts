import { describe, expect, it } from 'vitest';
import {
	createV2OntologyRegistry,
	HistoricalDateService,
	PlaceDesignationService,
	TemporalProjectionService,
	type TemporalAssertionStateEntry
} from '../src/v2';

function makeProjection(frontmatterByPath: Map<string, Record<string, unknown>>) {
	const files = [...frontmatterByPath.keys()].map(path => ({
		path,
		basename: path.split('/').pop()?.replace(/\.md$/, '') ?? path
	}));
	const byPath = new Map(files.map(file => [file.path, file]));
	const app = {
		vault: { getMarkdownFiles: () => files },
		metadataCache: {
			getFileCache: (file: { path: string }) => ({
				frontmatter: frontmatterByPath.get(file.path)
			}),
			getFirstLinkpathDest: (target: string) => {
				const normalized = target.endsWith('.md') ? target : `${target}.md`;
				return byPath.get(normalized) ?? null;
			}
		}
	} as never;
	return new TemporalProjectionService(app, new HistoricalDateService());
}

describe('M6 historical Place designation contract', () => {
	it('defines historical_name in Core and allows Place designations', () => {
		const registry = createV2OntologyRegistry();
		expect(
			registry.getType('designation_type', 'historical_name')?.labels.en
		).toBe('Historical name');

		const predicate = registry.getPredicate('has_designation');
		expect(predicate?.subjectTypes).toContain('place');
		expect(predicate?.qualifiers).toEqual(
			expect.arrayContaining(['designation_type', 'source'])
		);
	});

	it('preserves scalar Assertion qualifiers through TemporalItem projection', () => {
		const projection = makeProjection(new Map([
			['History/Places/Chang-An.md', {
				cr_schema: 2,
				cr_type: 'place',
				cr_id: 'place-changan',
				name: 'Xi’an'
			}],
			['History/Assertions/Chang-An-Name.md', {
				cr_schema: 2,
				cr_type: 'assertion',
				cr_id: 'designation-changan',
				assertion_type: 'designation',
				subject: '[[History/Places/Chang-An]]',
				predicate: 'has_designation',
				value: '长安',
				designation_type: 'historical_name',
				source: '[[Sources/Han-Book]]',
				time_start: 'BCE 202',
				time_end: '904 CE',
				confidence: 'high'
			}]
		]));

		const [item] = projection.getAll();
		expect(item.id).toBe('designation-changan');
		expect(item.qualifiers).toEqual({
			designation_type: 'historical_name',
			source: '[[Sources/Han-Book]]'
		});
		expect(item.qualifiers).not.toHaveProperty('confidence');
	});

	it('queries historical names by stable Place cr_id, keeping active and possible separate', () => {
		const placeGroup = {
			kind: 'place' as const,
			key: 'place:crid:place-changan',
			label: 'Xi’an',
			reference: '[[History/Places/Chang-An]]',
			crId: 'place-changan',
			filePath: 'History/Places/Chang-An.md'
		};
		const makeEntry = (
			state: 'active' | 'possible',
			id: string,
			name: string,
			crId = 'place-changan'
		): TemporalAssertionStateEntry => ({
			state,
			id,
			subject: '[[History/Places/Chang-An]]',
			predicate: 'has_designation',
			value: name,
			item: {
				id,
				kind: 'assertion',
				file: { path: `History/Assertions/${id}.md` } as never,
				filePath: `History/Assertions/${id}.md`,
				title: name,
				typeId: 'designation',
				predicate: 'has_designation',
				subject: '[[History/Places/Chang-An]]',
				value: name,
				qualifiers: {
					designation_type: 'historical_name',
					source: '[[Sources/Test]]'
				},
				groups: [{ ...placeGroup, crId, key: `place:crid:${crId}` }],
				status: 'resolved',
				source: 'v2'
			}
		});

		const temporal = {
			getAt: () => ({
				position: 1,
				active: [makeEntry('active', 'name-active', '长安')],
				possible: [
					makeEntry('possible', 'name-possible', '京兆'),
					makeEntry('possible', 'other-place', '洛阳', 'place-luoyang')
				]
			}),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [makeEntry('active', 'name-active', '长安')],
				possible: [makeEntry('possible', 'name-possible', '京兆')]
			})
		} as never;

		const service = new PlaceDesignationService(temporal);
		const point = service.getAt('place-changan', 1);
		expect(point.active.map(entry => entry.name)).toEqual(['长安']);
		expect(point.possible.map(entry => entry.name)).toEqual(['京兆']);
		expect(point.active[0]).toMatchObject({
			designationType: 'historical_name',
			source: '[[Sources/Test]]'
		});

		const range = service.getRange(
			'place-changan',
			{ start: 1, endExclusive: 2 }
		);
		expect(range.active.map(entry => entry.id)).toEqual(['name-active']);
		expect(range.possible.map(entry => entry.id)).toEqual(['name-possible']);
	});
	it('queries multiple Place cr_ids from one temporal snapshot', () => {
		let calls = 0;
		const makeEntry = (
			placeCrId: string,
			name: string
		): TemporalAssertionStateEntry => ({
			state: 'active',
			id: `designation-${placeCrId}`,
			subject: `[[${placeCrId}]]`,
			predicate: 'has_designation',
			value: name,
			item: {
				id: `designation-${placeCrId}`,
				kind: 'assertion',
				file: {} as never,
				filePath: `Assertions/${placeCrId}.md`,
				title: name,
				predicate: 'has_designation',
				subject: `[[${placeCrId}]]`,
				value: name,
				qualifiers: { designation_type: 'historical_name' },
				groups: [{
					kind: 'place',
					key: `place:crid:${placeCrId}`,
					label: name,
					reference: `[[${placeCrId}]]`,
					crId: placeCrId
				}],
				status: 'resolved',
				source: 'v2'
			}
		});
		const temporal = {
			getAt: () => {
				calls++;
				return {
					position: 1,
					active: [
						makeEntry('place-a', '长安'),
						makeEntry('place-b', '洛阳')
					],
					possible: []
				};
			}
		} as never;
		const service = new PlaceDesignationService(temporal);
		const result = service.getAtMany(['place-a', 'place-b'], 1);

		expect(calls).toBe(1);
		expect(result.get('place-a')?.active.map(entry => entry.name))
			.toEqual(['长安']);
		expect(result.get('place-b')?.active.map(entry => entry.name))
			.toEqual(['洛阳']);
	});

});
