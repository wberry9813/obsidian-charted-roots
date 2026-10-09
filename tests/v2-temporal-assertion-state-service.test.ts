import { describe, expect, it } from 'vitest';
import {
	HistoricalDateService,
	TemporalAssertionStateService,
	TemporalProjectionService
} from '../src/v2';

interface Fixture {
	path: string;
	frontmatter: Record<string, unknown>;
}

function makeService(fixtures: Fixture[]) {
	const files = fixtures.map(({ path }) => ({
		path,
		basename: path.split('/').pop()?.replace(/\.md$/, '') ?? path
	}));
	const frontmatterByPath = new Map(
		fixtures.map(fixture => [fixture.path, fixture.frontmatter])
	);
	const app = {
		vault: { getMarkdownFiles: () => files },
		metadataCache: {
			getFileCache: (file: { path: string }) => ({
				frontmatter: frontmatterByPath.get(file.path)
			})
		}
	} as never;
	const dates = new HistoricalDateService();
	const calendar = dates.getCalendarProvider('tyme');
	if (!calendar) throw new Error('Tyme calendar provider unavailable.');
	const projection = new TemporalProjectionService(app, dates);
	return {
		service: new TemporalAssertionStateService(projection, calendar),
		calendar
	};
}

function fixtures(): Fixture[] {
	return [
		{
			path: 'Assertions/Alliance.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'assertion',
				cr_id: 'alliance',
				assertion_type: 'relationship',
				subject: '[[A]]',
				predicate: 'ally_of',
				object: '[[B]]',
				time_start: '100 CE',
				time_end: '200 CE'
			}
		},
		{
			path: 'Assertions/Possible-Alliance.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'assertion',
				cr_id: 'possible-alliance',
				assertion_type: 'relationship',
				subject: '[[A]]',
				predicate: 'ally_of',
				object: '[[C]]',
				time_not_before: '120 CE',
				time_not_after: '180 CE'
			}
		},
		{
			path: 'Assertions/Office.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'assertion',
				cr_id: 'office',
				assertion_type: 'office_holding',
				subject: '[[A]]',
				predicate: 'holds_office',
				object: '[[Chancellor]]',
				time_start: '250 CE',
				time_end: '300 CE'
			}
		},
		{
			path: 'Assertions/Untimed.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'assertion',
				cr_id: 'untimed',
				assertion_type: 'relationship',
				subject: '[[A]]',
				predicate: 'ally_of',
				object: '[[D]]'
			}
		}
	];
}

describe('TemporalAssertionStateService', () => {
	it('separates definitely active from merely possible Assertions', () => {
		const { service, calendar } = makeService(fixtures());
		const position = calendar.solarToJulianDay({
			year: 150,
			month: 6,
			day: 1
		});

		const snapshot = service.getAt(position);

		expect(snapshot.active.map(entry => entry.id)).toEqual(['alliance']);
		expect(snapshot.possible.map(entry => entry.id)).toEqual([
			'possible-alliance'
		]);
		expect(snapshot.active[0]).toMatchObject({
			state: 'active',
			subject: '[[A]]',
			predicate: 'ally_of',
			object: '[[B]]'
		});
	});

	it('uses half-open end boundaries for exact point state', () => {
		const { service, calendar } = makeService(fixtures());
		const startOf201 = calendar.solarToJulianDay({
			year: 201,
			month: 1,
			day: 1
		});

		const snapshot = service.getAt(startOf201);
		expect(snapshot.active.map(entry => entry.id)).not.toContain('alliance');
	});

	it('queries overlapping Assertion state over a range', () => {
		const { service, calendar } = makeService(fixtures());
		const range = {
			start: calendar.solarToJulianDay({
				year: 190,
				month: 1,
				day: 1
			}),
			endExclusive: calendar.solarToJulianDay({
				year: 260,
				month: 1,
				day: 1
			})
		};

		const snapshot = service.getRange(range);
		expect(snapshot.active.map(entry => entry.id)).toEqual([
			'alliance',
			'office'
		]);
		expect(snapshot.possible).toHaveLength(0);
	});

	it('supports predicate/subject filters for graph consumers', () => {
		const { service, calendar } = makeService(fixtures());
		const range = {
			start: calendar.solarToJulianDay({
				year: 1,
				month: 1,
				day: 1
			}),
			endExclusive: calendar.solarToJulianDay({
				year: 400,
				month: 1,
				day: 1
			})
		};

		const snapshot = service.getRange(range, {
			predicates: ['holds_office'],
			subject: '[[A]]'
		});
		expect(snapshot.active.map(entry => entry.id)).toEqual(['office']);
		expect(snapshot.possible).toEqual([]);
	});

	it('does not treat untimed Assertions as temporal state', () => {
		const { service, calendar } = makeService(fixtures());
		const snapshot = service.getAt(
			calendar.solarToJulianDay({
				year: 150,
				month: 1,
				day: 1
			})
		);

		expect([
			...snapshot.active,
			...snapshot.possible
		].map(entry => entry.id)).not.toContain('untimed');
	});
});
