import { describe, expect, it } from 'vitest';
import { DateService } from '../src/dates/services/date-service';
import {
	buildChronologyTimelineModel,
	generateChronologyYearTicks,
	type TemporalBoundaryProjection,
	type TemporalItem
} from '../src/v2';

function dates(): DateService {
	return new DateService({
		enableFictionalDates: true,
		showBuiltInDateSystems: false,
		fictionalDateSystems: [
			{
				id: 'galactic-standard',
				name: 'Galactic Standard Calendar',
				universe: 'Star Wars',
				eras: [
					{ id: 'bby', name: 'Before Yavin', abbrev: 'BBY', epoch: 0, direction: 'backward' },
					{ id: 'aby', name: 'After Yavin', abbrev: 'ABY', epoch: 0, direction: 'forward' }
				]
			},
			{
				id: 'other-calendar',
				name: 'Other Calendar',
				universe: 'Other World',
				eras: [
					{ id: 'oe', name: 'Other Era', abbrev: 'OE', epoch: 100, direction: 'forward' }
				]
			}
		]
	});
}

function boundary(expression: string): TemporalBoundaryProjection {
	return {
		expression,
		precisionConflict: false,
		result: {
			status: 'unresolved',
			original: expression,
			reason: 'not on the historical/JDN axis'
		}
	};
}

function item(
	id: string,
	fields: Partial<TemporalItem>
): TemporalItem {
	return {
		id,
		kind: 'event',
		file: { path: `${id}.md`, basename: id } as never,
		filePath: `${id}.md`,
		title: id,
		groups: [],
		status: 'unresolved',
		source: 'v2',
		...fields
	};
}

describe('chronology-local timeline model', () => {
	it('plots a single fictional year as one canonical-year bucket', () => {
		const model = buildChronologyTimelineModel([
			item('luke-born', {
				universe: 'Star Wars',
				start: boundary('BBY 19')
			})
		], 'galactic-standard', dates());

		expect(model.spans).toHaveLength(1);
		expect(model.spans[0]).toMatchObject({
			start: -19,
			endExclusive: -18
		});
		expect(model.domain).toEqual({ start: -19, endExclusive: -18 });
		expect(model.review).toHaveLength(0);
	});

	it('uses the full inclusive end year for fictional processes', () => {
		const model = buildChronologyTimelineModel([
			item('war', {
				kind: 'process',
				universe: 'Star Wars',
				start: boundary('BBY 22'),
				end: boundary('BBY 19')
			})
		], 'galactic-standard', dates());

		expect(model.spans[0]).toMatchObject({
			start: -22,
			endExclusive: -18
		});
	});

	it('keeps chronology-local constraint windows', () => {
		const model = buildChronologyTimelineModel([
			item('uncertain', {
				kind: 'period',
				universe: 'Star Wars',
				notBefore: boundary('BBY 30'),
				notAfter: boundary('BBY 20')
			})
		], 'galactic-standard', dates());

		expect(model.spans).toHaveLength(0);
		expect(model.windows).toHaveLength(1);
		expect(model.windows[0]).toMatchObject({
			notBefore: -30,
			notAfterExclusive: -19
		});
	});

	it('ignores other chronologies instead of mixing numeric axes', () => {
		const model = buildChronologyTimelineModel([
			item('other', {
				universe: 'Other World',
				start: boundary('OE 5')
			})
		], 'galactic-standard', dates());

		expect(model.spans).toHaveLength(0);
		expect(model.windows).toHaveLength(0);
		expect(model.review).toHaveLength(0);
		expect(model.domain).toBeNull();
	});

	it('can restrict a shared chronology to the focus universe', () => {
		const model = buildChronologyTimelineModel([
			item('star-wars', {
				universe: '[[Star Wars]]',
				start: boundary('BBY 19')
			}),
			item('other-universe', {
				universe: 'Other World',
				start: boundary('OE 5')
			})
		], 'galactic-standard', dates(), { universe: 'Star Wars' });

		expect(model.spans.map(span => span.item.id)).toEqual(['star-wars']);
	});

	it('surfaces a mixed-axis authored interval instead of guessing its end', () => {
		const model = buildChronologyTimelineModel([
			item('mixed', {
				universe: 'Star Wars',
				start: boundary('BBY 19'),
				end: boundary('453 CE')
			})
		], 'galactic-standard', dates());

		expect(model.spans).toHaveLength(0);
		expect(model.review[0]?.reasons).toEqual(
			expect.arrayContaining(['partial', 'unprojectable'])
		);
	});
});


describe('chronology-local timeline ticks', () => {
	it('formats canonical ticks through the exact fictional calendar id', () => {
		const ticks = generateChronologyYearTicks(
			{ start: -82, endExclusive: 21 },
			dates(),
			'galactic-standard',
			6
		);

		expect(ticks.map(tick => tick.label)).toEqual([
			'80 BBY',
			'60 BBY',
			'40 BBY',
			'20 BBY',
			'0 BBY',
			'20 ABY'
		]);
	});

	it('falls back to canonical numbers for an unavailable chronology id', () => {
		const ticks = generateChronologyYearTicks(
			{ start: 0, endExclusive: 3 },
			dates(),
			'missing-calendar',
			4
		);

		expect(ticks.map(tick => tick.label)).toEqual(['0', '1', '2']);
	});
});
