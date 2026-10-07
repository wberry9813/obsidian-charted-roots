import { describe, expect, it } from 'vitest';
import {
	HistoricalDateService,
	TemporalProjectionService,
	buildTimelineModel,
	generateHistoricalYearTicks,
	type TemporalItem
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
	return {
		app: {
			vault: { getMarkdownFiles: () => files },
			metadataCache: {
				getFileCache: (file: { path: string }) => ({
					frontmatter: frontmatterByPath.get(file.path)
				})
			}
		} as never
	};
}

function calendar(service: HistoricalDateService) {
	const value = service.getCalendarProvider('tyme');
	if (!value) throw new Error('Tyme calendar provider is unavailable.');
	return value;
}

describe('timeline model', () => {
	it('turns year-only events into full drawable year spans', () => {
		const { app } = makeVault([{
			path: 'History/Events/Year.md',
			frontmatter: {
				cr_type: 'event',
				cr_id: 'year-event',
				title: 'Year Event',
				event_type: 'custom',
				time_start: 'BCE 453'
			}
		}]);
		const dates = new HistoricalDateService();
		const projection = new TemporalProjectionService(app, dates);
		const model = buildTimelineModel(projection.getAll(), calendar(dates));

		expect(model.spans).toHaveLength(1);
		expect(model.spans[0].item.id).toBe('year-event');
		expect(model.spans[0].endExclusive - model.spans[0].start)
			.toBeGreaterThan(300);
		expect(model.review).toHaveLength(0);
	});

	it('uses start and end expressions as the full process span', () => {
		const { app } = makeVault([{
			path: 'History/Processes/Change.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'process',
				cr_id: 'change',
				name: 'Change',
				time_start: 'BCE 500',
				time_end: 'BCE 450'
			}
		}]);
		const dates = new HistoricalDateService();
		const projection = new TemporalProjectionService(app, dates);
		const model = buildTimelineModel(projection.getAll(), calendar(dates));

		expect(model.spans).toHaveLength(1);
		expect(model.spans[0].endExclusive - model.spans[0].start)
			.toBeGreaterThan(50 * 300);
	});

	it('keeps temporal bounds as a constraint window', () => {
		const { app } = makeVault([{
			path: 'History/Periods/Bounded.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'period',
				cr_id: 'bounded',
				name: 'Bounded',
				time_not_before: 'BCE 500',
				time_not_after: 'BCE 450'
			}
		}]);
		const dates = new HistoricalDateService();
		const projection = new TemporalProjectionService(app, dates);
		const model = buildTimelineModel(projection.getAll(), calendar(dates));

		expect(model.spans).toHaveLength(0);
		expect(model.windows).toHaveLength(1);
		expect(model.windows[0].notBefore).toBeDefined();
		expect(model.windows[0].notAfterExclusive).toBeDefined();
		expect(model.review).toHaveLength(0);
	});

	it('surfaces undated and precision-conflict items for review', () => {
		const { app } = makeVault([
			{
				path: 'History/Periods/Undated.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'period',
					cr_id: 'undated',
					name: 'Undated'
				}
			},
			{
				path: 'History/Events/Conflict.md',
				frontmatter: {
					cr_type: 'event',
					cr_id: 'conflict',
					title: 'Conflict',
					event_type: 'custom',
					time_start: '453 CE',
					time_start_precision: 'day'
				}
			}
		]);
		const dates = new HistoricalDateService();
		const projection = new TemporalProjectionService(app, dates);
		const model = buildTimelineModel(projection.getAll(), calendar(dates));

		expect(model.review.find(entry => entry.item.id === 'undated')?.reasons)
			.toContain('undated');
		expect(model.review.find(entry => entry.item.id === 'conflict')?.reasons)
			.toContain('precision_conflict');
		// The parser-safe year interval remains drawable despite bad metadata.
		expect(model.spans.some(span => span.item.id === 'conflict')).toBe(true);
	});

	it('rejects inverted resolved intervals instead of drawing them', () => {
		const { app } = makeVault([{
			path: 'History/Processes/Inverted.md',
			frontmatter: {
				cr_schema: 2,
				cr_type: 'process',
				cr_id: 'inverted',
				name: 'Inverted',
				time_start: '500 CE',
				time_end: '450 CE'
			}
		}]);
		const dates = new HistoricalDateService();
		const projection = new TemporalProjectionService(app, dates);
		const model = buildTimelineModel(projection.getAll(), calendar(dates));

		expect(model.spans).toHaveLength(0);
		expect(model.review[0].reasons).toContain('invalid_interval');
	});

	it('generates round BCE/CE labels without astronomical off-by-one years', () => {
		const dates = new HistoricalDateService();
		const cal = calendar(dates);
		const start = cal.solarToJulianDay({ year: -549, month: 1, day: 1 }); // 550 BCE
		const endExclusive = cal.solarToJulianDay({ year: 151, month: 1, day: 1 });
		const ticks = generateHistoricalYearTicks(
			{ start, endExclusive },
			cal,
			{ maxTicks: 10 }
		);

		expect(ticks.map(tick => tick.label)).toEqual([
			'500 BCE',
			'400 BCE',
			'300 BCE',
			'200 BCE',
			'100 BCE',
			'100 CE'
		]);
		expect(ticks.some(tick => tick.label === '501 BCE')).toBe(false);
		expect(ticks.some(tick => tick.label.includes('0'))).toBe(true);
	});

	it('shows the BCE/CE boundary with no year zero at fine scale', () => {
		const dates = new HistoricalDateService();
		const cal = calendar(dates);
		const start = cal.solarToJulianDay({ year: -1, month: 1, day: 1 }); // 2 BCE
		const endExclusive = cal.solarToJulianDay({ year: 3, month: 1, day: 1 });
		const ticks = generateHistoricalYearTicks(
			{ start, endExclusive },
			cal,
			{ maxTicks: 10 }
		);

		expect(ticks.map(tick => tick.label)).toEqual([
			'2 BCE',
			'1 BCE',
			'1 CE',
			'2 CE'
		]);
	});

	it('keeps ambiguous items out of drawable coordinates', () => {
		const fake = {
			id: 'ambiguous',
			kind: 'event',
			file: { path: 'Ambiguous.md', basename: 'Ambiguous' },
			filePath: 'Ambiguous.md',
			title: 'Ambiguous',
			status: 'ambiguous',
			source: 'v2',
			start: {
				expression: 'Repeated Era 1',
				precisionConflict: false,
				result: {
					status: 'ambiguous',
					original: 'Repeated Era 1',
					reason: 'multiple candidates',
					candidates: []
				}
			}
		} as unknown as TemporalItem;
		const dates = new HistoricalDateService();
		const model = buildTimelineModel([fake], calendar(dates));

		expect(model.spans).toHaveLength(0);
		expect(model.windows).toHaveLength(0);
		expect(model.review[0].reasons).toContain('ambiguous');
	});
});
