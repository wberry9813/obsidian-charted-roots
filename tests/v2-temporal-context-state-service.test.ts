import { describe, expect, it } from 'vitest';
import {
	HistoricalDateService,
	TemporalContextStateService,
	TemporalProjectionService
} from '../src/v2';

function app() {
	const fixtures = [
		{
			path: 'History/Processes/Reform.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'process',
				cr_id: 'reform',
				name: 'Reform',
				process_type: 'political_change',
				universe: 'History',
				time_start: '100 CE',
				time_end: '120 CE'
			}
		},
		{
			path: 'History/Periods/Era.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'period',
				cr_id: 'era',
				name: 'Era',
				period_type: 'historiographical_period',
				universe: 'History',
				time_start: '90 CE',
				time_end: '150 CE'
			}
		},
		{
			path: 'History/Periods/Bounded.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'period',
				cr_id: 'bounded',
				name: 'Bounded',
				period_type: 'custom',
				universe: 'History',
				time_not_before: '105 CE',
				time_not_after: '115 CE'
			}
		},
		{
			path: 'History/Events/Event.md',
			frontmatter: {
				cr_type: 'event',
				cr_id: 'event',
				title: 'Event',
				event_type: 'custom',
				time_start: '110 CE'
			}
		}
	];
	const files = fixtures.map(({ path }) => ({
		path,
		basename: path.split('/').pop()?.replace(/\.md$/, '') ?? path
	}));
	const byPath = new Map(
		fixtures.map(value => [value.path, value.frontmatter])
	);
	return {
		vault: { getMarkdownFiles: () => files },
		metadataCache: {
			getFileCache: (file: { path: string }) => ({
				frontmatter: byPath.get(file.path)
			})
		}
	} as never;
}

function setup() {
	const dates = new HistoricalDateService();
	const calendar = dates.getCalendarProvider('tyme');
	if (!calendar) throw new Error('Tyme calendar provider unavailable');
	const projection = new TemporalProjectionService(app(), dates);
	return {
		dates,
		calendar,
		service: new TemporalContextStateService(projection, calendar)
	};
}

describe('TemporalContextStateService', () => {
	it('returns active Process/Period separately from possible bounded context', () => {
		const { calendar, service } = setup();
		const point = calendar.solarToJulianDay({
			year: 110,
			month: 6,
			day: 1
		});
		const result = service.getAt(point);

		expect(result.active.map(entry => entry.id).sort()).toEqual([
			'era',
			'reform'
		]);
		expect(result.possible.map(entry => entry.id)).toEqual([
			'bounded'
		]);
		expect(result.active.some(entry => entry.id === 'event')).toBe(false);
	});

	it('supports semantic filters without changing the context contract', () => {
		const { calendar, service } = setup();
		const point = calendar.solarToJulianDay({
			year: 110,
			month: 6,
			day: 1
		});
		const result = service.getAt(point, {
			kinds: ['period'],
			universe: 'History'
		});

		expect(result.active.map(entry => entry.id)).toEqual(['era']);
		expect(result.possible.map(entry => entry.id)).toEqual(['bounded']);
	});

	it('returns overlapping context for a focused range', () => {
		const { calendar, service } = setup();
		const result = service.getRange({
			start: calendar.solarToJulianDay({
				year: 119,
				month: 1,
				day: 1
			}),
			endExclusive: calendar.solarToJulianDay({
				year: 121,
				month: 1,
				day: 1
			})
		});

		expect(result.active.map(entry => entry.id).sort()).toEqual([
			'era',
			'reform'
		]);
		expect(result.possible).toEqual([]);
	});
});
