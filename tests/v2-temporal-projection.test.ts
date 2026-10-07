import { describe, expect, it } from 'vitest';
import {
	HistoricalDateService,
	TemporalProjectionService
} from '../src/v2';

interface Fixture {
	path: string;
	frontmatter: Record<string, unknown>;
}

function makeVault(fixtures: Fixture[]) {
	const files = fixtures.map(({ path }) => ({
		path,
		basename: path.split('/').pop()?.replace(/\.md$/, '') ?? path
	}));
	const frontmatterByPath = new Map(
		fixtures.map(fixture => [fixture.path, fixture.frontmatter])
	);

	const app = {
		vault: {
			getMarkdownFiles: () => files
		},
		metadataCache: {
			getFileCache: (file: { path: string }) => ({
				frontmatter: frontmatterByPath.get(file.path)
			})
		}
	} as never;

	return { app, files };
}

describe('TemporalProjectionService', () => {
	it('projects legacy Event dates without trusting mixed-semantics date_precision', () => {
		const { app } = makeVault([{
			path: 'History/Events/Legacy.md',
			frontmatter: {
				cr_type: 'event',
				cr_id: 'legacy-event',
				title: 'Legacy Event',
				event_type: 'battle',
				date: 'BCE 453',
				date_precision: 'exact'
			}
		}]);
		const service = new TemporalProjectionService(
			app,
			new HistoricalDateService()
		);

		const [item] = service.getAll();
		expect(item.kind).toBe('event');
		expect(item.source).toBe('legacy_event');
		expect(item.start?.expression).toBe('BCE 453');
		expect(item.start?.result.status).toBe('resolved');
		if (item.start?.result.status === 'resolved') {
			expect(item.start.result.value.precision).toBe('year');
		}
		expect(item.start?.effectivePrecision).toBe('year');
		expect(item.start?.declaredPrecision).toBeUndefined();
	});

	it('prefers v2 temporal fields over legacy Event date fields', () => {
		const { app } = makeVault([{
			path: 'History/Events/Migrated.md',
			frontmatter: {
				cr_type: 'event',
				cr_id: 'migrated-event',
				title: 'Migrated Event',
				event_type: 'battle',
				date: 'BCE 453',
				time_start: 'BCE 400',
				time_start_precision: 'year',
				time_start_certainty: 'approximate'
			}
		}]);
		const service = new TemporalProjectionService(
			app,
			new HistoricalDateService()
		);

		const [item] = service.getAll();
		expect(item.source).toBe('v2');
		expect(item.start?.expression).toBe('BCE 400');
		expect(item.start?.declaredPrecision).toBe('year');
		expect(item.start?.declaredCertainty).toBe('approximate');
		expect(item.start?.effectiveCertainty).toBe('approximate');
	});

	it('never lets declared precision manufacture finer coordinates than the expression', () => {
		const { app } = makeVault([{
			path: 'History/Events/Conflicting-Precision.md',
			frontmatter: {
				cr_type: 'event',
				cr_id: 'precision-conflict',
				title: 'Conflicting precision',
				event_type: 'custom',
				time_start: 'BCE 453',
				time_start_precision: 'day'
			}
		}]);
		const service = new TemporalProjectionService(
			app,
			new HistoricalDateService()
		);

		const [item] = service.getAll();
		expect(item.start?.declaredPrecision).toBe('day');
		expect(item.start?.effectivePrecision).toBe('year');
		expect(item.start?.precisionConflict).toBe(true);
	});

	it('projects Event, Process, Period and time-bounded Assertion into one contract', () => {
		const { app } = makeVault([
			{
				path: 'History/Events/Battle.md',
				frontmatter: {
					cr_type: 'event',
					cr_id: 'battle',
					title: 'Battle',
					event_type: 'battle',
					time_start: 'BCE 453'
				}
			},
			{
				path: 'History/Processes/Expansion.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'process',
					cr_id: 'expansion',
					name: 'Territorial Expansion',
					process_type: 'territorial_expansion',
					time_start: 'BCE 500',
					time_end: 'BCE 450'
				}
			},
			{
				path: 'History/Periods/Warring.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'period',
					cr_id: 'warring',
					name: 'Warring Period',
					period_type: 'historiographical_period'
				}
			},
			{
				path: 'History/Assertions/Office.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'assertion',
					cr_id: 'office',
					assertion_type: 'office_holding',
					subject: '[[Cao Cao]]',
					predicate: 'holds_office',
					object: '[[Chancellor]]',
					time_start: '200 CE'
				}
			},
			{
				path: 'History/Assertions/Undated.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'assertion',
					cr_id: 'undated',
					assertion_type: 'relationship',
					subject: '[[A]]',
					predicate: 'ally_of',
					object: '[[B]]'
				}
			}
		]);
		const service = new TemporalProjectionService(
			app,
			new HistoricalDateService()
		);

		const items = service.getAll();
		expect(items.map(item => item.kind)).toEqual([
			'event',
			'process',
			'period',
			'assertion'
		]);
		expect(items.find(item => item.kind === 'period')?.status).toBe('undated');
		expect(items.find(item => item.kind === 'assertion')).toMatchObject({
			typeId: 'office_holding',
			predicate: 'holds_office',
			subject: '[[Cao Cao]]',
			object: '[[Chancellor]]'
		});
		expect(items.some(item => item.id === 'undated')).toBe(false);
	});

	it('projects stable Event grouping refs from linked entities', () => {
		const eventFile = {
			path: 'History/Events/Campaign.md',
			basename: 'Campaign'
		};
		const personFile = {
			path: 'History/People/Cao-Cao.md',
			basename: 'Cao-Cao'
		};
		const placeFile = {
			path: 'History/Places/Xuchang.md',
			basename: 'Xuchang'
		};
		const orgFile = {
			path: 'History/Organizations/Wei.md',
			basename: 'Wei'
		};
		const universeFile = {
			path: 'History/Universes/History.md',
			basename: 'History'
		};
		const frontmatterByPath = new Map<string, Record<string, unknown>>([
			[eventFile.path, {
				cr_type: 'event',
				cr_id: 'campaign',
				title: 'Campaign',
				event_type: 'battle',
				time_start: '200 CE',
				persons: ['[[History/People/Cao-Cao|曹操]]'],
				place: '[[History/Places/Xuchang|许昌]]',
				organizations: ['[[History/Organizations/Wei|魏]]'],
				universe: '[[History/Universes/History|历史]]'
			}],
			[personFile.path, {
				cr_type: 'person',
				cr_id: 'cao-cao',
				name: '曹操'
			}],
			[placeFile.path, {
				cr_type: 'place',
				cr_id: 'xuchang',
				name: '许昌'
			}],
			[orgFile.path, {
				cr_type: 'organization',
				cr_id: 'wei',
				name: '魏'
			}],
			[universeFile.path, {
				cr_type: 'universe',
				cr_id: 'history-universe',
				name: '历史'
			}]
		]);
		const byTarget = new Map([
			['History/People/Cao-Cao', personFile],
			['History/Places/Xuchang', placeFile],
			['History/Organizations/Wei', orgFile],
			['History/Universes/History', universeFile]
		]);
		const app = {
			vault: { getMarkdownFiles: () => [eventFile] },
			metadataCache: {
				getFileCache: (file: { path: string }) => ({
					frontmatter: frontmatterByPath.get(file.path)
				}),
				getFirstLinkpathDest: (target: string) => byTarget.get(target) ?? null
			}
		} as never;
		const service = new TemporalProjectionService(
			app,
			new HistoricalDateService()
		);

		const [item] = service.getAll();
		expect(item.groups.map(group => ({
			kind: group.kind,
			key: group.key,
			label: group.label
		}))).toEqual([
			{
				kind: 'universe',
				key: 'universe:crid:history-universe',
				label: '历史'
			},
			{
				kind: 'person',
				key: 'person:crid:cao-cao',
				label: '曹操'
			},
			{
				kind: 'place',
				key: 'place:crid:xuchang',
				label: '许昌'
			},
			{
				kind: 'organization',
				key: 'organization:crid:wei',
				label: '魏'
			}
		]);
	});

	it('types Assertion subject/object grouping refs from the linked notes', () => {
		const assertionFile = {
			path: 'History/Assertions/Office.md',
			basename: 'Office'
		};
		const personFile = {
			path: 'History/People/Cao-Cao.md',
			basename: 'Cao-Cao'
		};
		const orgFile = {
			path: 'History/Organizations/Han.md',
			basename: 'Han'
		};
		const frontmatterByPath = new Map<string, Record<string, unknown>>([
			[assertionFile.path, {
				cr_type: 'assertion',
				cr_id: 'office',
				assertion_type: 'affiliation',
				subject: '[[History/People/Cao-Cao|曹操]]',
				predicate: 'member_of',
				object: '[[History/Organizations/Han|汉廷]]',
				time_start: '196 CE'
			}],
			[personFile.path, {
				cr_type: 'person',
				cr_id: 'cao-cao',
				name: '曹操'
			}],
			[orgFile.path, {
				cr_type: 'organization',
				cr_id: 'han',
				name: '汉廷'
			}]
		]);
		const byTarget = new Map([
			['History/People/Cao-Cao', personFile],
			['History/Organizations/Han', orgFile]
		]);
		const app = {
			vault: { getMarkdownFiles: () => [assertionFile] },
			metadataCache: {
				getFileCache: (file: { path: string }) => ({
					frontmatter: frontmatterByPath.get(file.path)
				}),
				getFirstLinkpathDest: (target: string) => byTarget.get(target) ?? null
			}
		} as never;
		const service = new TemporalProjectionService(
			app,
			new HistoricalDateService()
		);

		const [item] = service.getAll();
		expect(item.groups.map(group => group.key)).toEqual([
			'person:crid:cao-cao',
			'organization:crid:han'
		]);
	});

	it('respects the injected Workspace file provider', () => {
		const fixtures = [
			{
				path: 'Workspace-E2E/History/Events/History.md',
				frontmatter: {
					cr_type: 'event',
					cr_id: 'history-event',
					title: 'History',
					event_type: 'battle',
					time_start: 'BCE 453'
				}
			},
			{
				path: 'Workspace-E2E/Shushan/Events/Fiction.md',
				frontmatter: {
					cr_type: 'event',
					cr_id: 'fiction-event',
					title: 'Fiction',
					event_type: 'lore_event',
					time_start: '200 CE'
				}
			}
		];
		const { app, files } = makeVault(fixtures);
		const service = new TemporalProjectionService(
			app,
			new HistoricalDateService(),
			{ fileProvider: () => [files[0]] as never }
		);

		expect(service.getAll().map(item => item.id)).toEqual(['history-event']);
	});

	it('keeps exact days and year-only values equal when they overlap the same year', () => {
		const { app } = makeVault([
			{
				path: 'History/Events/Year.md',
				frontmatter: {
					cr_type: 'event',
					cr_id: 'year',
					title: 'Year only',
					event_type: 'custom',
					time_start: '453 CE'
				}
			},
			{
				path: 'History/Events/Day.md',
				frontmatter: {
					cr_type: 'event',
					cr_id: 'day',
					title: 'Exact day',
					event_type: 'custom',
					time_start: '453-06-01'
				}
			}
		]);
		const service = new TemporalProjectionService(
			app,
			new HistoricalDateService()
		);
		const [year, day] = service.getAll();

		expect(year.start?.effectivePrecision).toBe('year');
		expect(day.start?.effectivePrecision).toBe('day');
		expect(service.compareChronologically(year, day)).toBe(0);
		expect(service.compareChronologically(day, year)).toBe(0);
	});

	it('surfaces unresolved historical expressions instead of inventing coordinates', () => {
		const { app } = makeVault([{
			path: 'History/Periods/Unknown.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'period',
				cr_id: 'unknown-period',
				name: 'Unknown Period',
				time_start: 'Unknown Dynasty Year 3'
			}
		}]);
		const service = new TemporalProjectionService(
			app,
			new HistoricalDateService()
		);

		const [item] = service.getAll();
		expect(item.status).toBe('unresolved');
		expect(item.start?.result.status).toBe('unresolved');
	});
});
