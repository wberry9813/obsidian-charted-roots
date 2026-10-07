import { describe, expect, it } from 'vitest';
import {
	queryTimelineAfter,
	queryTimelineAt,
	queryTimelineBefore,
	queryTimelineRange,
	timelineWindowAllows,
	type TimelineModel,
	type TimelineSpan
} from '../src/v2';

function item(
	id: string,
	kind: 'event' | 'process' | 'period' | 'assertion' = 'event',
	extra: Record<string, unknown> = {}
) {
	return {
		id,
		kind,
		file: { path: `${id}.md`, basename: id },
		filePath: `${id}.md`,
		title: id,
		status: 'resolved',
		source: 'v2',
		...extra
	} as never;
}

function span(
	id: string,
	start: number,
	endExclusive: number,
	extra: Record<string, unknown> = {}
): TimelineSpan {
	const temporalItem = item(id, (extra.kind as never) ?? 'event', extra);
	return {
		item: temporalItem,
		start,
		endExclusive,
		startInterval: {
			scale: 'julian_day',
			start,
			endExclusive,
			original: String(start),
			precision: 'day',
			certainty: 'certain'
		}
	};
}

function fixture(): TimelineModel {
	const spans = [
		span('battle', 10, 11, { typeId: 'battle', universe: 'history' }),
		span('long-process', 5, 20, {
			kind: 'process',
			typeId: 'political_change',
			universe: 'history'
		}),
		span('office', 12, 18, {
			kind: 'assertion',
			typeId: 'office_holding',
			predicate: 'holds_office',
			subject: '[[Cao Cao]]',
			object: '[[Chancellor]]'
		}),
		span('future', 30, 40, { universe: 'fiction' })
	];
	const windows = [
		{
			item: item('bounded', 'period', { universe: 'history' }),
			notBefore: 8,
			notAfterExclusive: 16
		},
		{
			item: item('open-ended', 'assertion', {
				predicate: 'ally_of',
				subject: '[[A]]',
				object: '[[B]]'
			}),
			notBefore: 25
		}
	];

	return {
		spans,
		windows,
		review: [],
		domain: { start: 5, endExclusive: 40 }
	};
}

describe('timeline queries', () => {
	it('separates known-active spans from merely possible windows', () => {
		const result = queryTimelineAt(fixture(), 10);

		expect(result.activeSpans.map(entry => entry.item.id)).toEqual([
			'battle',
			'long-process'
		]);
		expect(result.possibleWindows.map(entry => entry.item.id)).toEqual([
			'bounded'
		]);
	});

	it('uses half-open interval semantics at boundaries', () => {
		const result = queryTimelineAt(fixture(), 11);

		expect(result.activeSpans.map(entry => entry.item.id)).toEqual([
			'long-process'
		]);
	});

	it('queries overlapping ranges without conflating constraint windows', () => {
		const result = queryTimelineRange(
			fixture(),
			{ start: 15, endExclusive: 17 }
		);

		expect(result.overlappingSpans.map(entry => entry.item.id)).toEqual([
			'long-process',
			'office'
		]);
		expect(result.possibleWindows.map(entry => entry.item.id)).toEqual([
			'bounded'
		]);
	});

	it('supports semantic filters for future map/graph/timeline surfaces', () => {
		const byAssertion = queryTimelineAt(
			fixture(),
			15,
			{
				kinds: ['assertion'],
				predicates: ['holds_office'],
				subject: '[[Cao Cao]]'
			}
		);
		expect(byAssertion.activeSpans.map(entry => entry.item.id)).toEqual([
			'office'
		]);

		const byText = queryTimelineRange(
			fixture(),
			{ start: 1, endExclusive: 50 },
			{ text: 'political' }
		);
		expect(byText.overlappingSpans.map(entry => entry.item.id)).toEqual([
			'long-process'
		]);
	});

	it('queries definitely before and after using complete spans only', () => {
		expect(queryTimelineBefore(fixture(), 12).map(entry => entry.item.id))
			.toEqual(['battle']);
		expect(queryTimelineAfter(fixture(), 20).map(entry => entry.item.id))
			.toEqual(['future']);
	});

	it('handles open-ended possible windows', () => {
		const model = fixture();
		const openEnded = model.windows.find(
			entry => entry.item.id === 'open-ended'
		);
		if (!openEnded) throw new Error('missing fixture');

		expect(timelineWindowAllows(openEnded, 24)).toBe(false);
		expect(timelineWindowAllows(openEnded, 25)).toBe(true);
		expect(timelineWindowAllows(openEnded, 500)).toBe(true);
	});
});
