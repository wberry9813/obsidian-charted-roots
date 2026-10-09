import { describe, expect, it } from 'vitest';
import {
	buildTimelineLanes,
	type TimelineModel,
	type TimelineSpan
} from '../src/v2';

function span(
	id: string,
	groups: Array<{
		kind: 'person' | 'place' | 'organization' | 'universe';
		key: string;
		label: string;
		reference?: string;
	}>
): TimelineSpan {
	return {
		item: {
			id,
			kind: 'event',
			file: { path: `${id}.md`, basename: id },
			filePath: `${id}.md`,
			title: id,
			status: 'resolved',
			source: 'v2',
			groups: groups.map(group => ({
				...group,
				reference: group.reference ?? group.label
			}))
		},
		start: 1,
		endExclusive: 2,
		startInterval: {
			scale: 'julian_day',
			start: 1,
			endExclusive: 2,
			original: '1',
			precision: 'day',
			certainty: 'certain'
		}
	} as never;
}

function fixture(): TimelineModel {
	return {
		spans: [
			span('joint-event', [
				{ kind: 'person', key: 'person:crid:a', label: 'A' },
				{ kind: 'person', key: 'person:crid:b', label: 'B' },
				{ kind: 'place', key: 'place:crid:x', label: 'X' }
			]),
			span('solo-event', [
				{ kind: 'person', key: 'person:crid:a', label: 'A' }
			]),
			span('unlinked-event', [])
		],
		windows: [],
		review: [],
		domain: { start: 1, endExclusive: 2 }
	};
}

describe('timeline grouping', () => {
	it('keeps the ungrouped mode as one lane', () => {
		const lanes = buildTimelineLanes(fixture(), 'none');

		expect(lanes).toHaveLength(1);
		expect(lanes[0].key).toBe('__all__');
		expect(lanes[0].spans.map(span => span.item.id)).toEqual([
			'joint-event',
			'solo-event',
			'unlinked-event'
		]);
	});

	it('duplicates many-to-many items into every matching entity lane', () => {
		const lanes = buildTimelineLanes(fixture(), 'person');

		expect(lanes.map(lane => lane.label)).toEqual(['A', 'B', 'Ungrouped']);
		expect(lanes[0].spans.map(span => span.item.id)).toEqual([
			'joint-event',
			'solo-event'
		]);
		expect(lanes[1].spans.map(span => span.item.id)).toEqual([
			'joint-event'
		]);
		expect(lanes[2].spans.map(span => span.item.id)).toEqual([
			'unlinked-event'
		]);
	});

	it('does not infer the wrong entity type for a lane', () => {
		const lanes = buildTimelineLanes(fixture(), 'place');

		expect(lanes.map(lane => lane.label)).toEqual(['X', 'Ungrouped']);
		expect(lanes[0].spans.map(span => span.item.id)).toEqual([
			'joint-event'
		]);
		expect(lanes[1].spans.map(span => span.item.id)).toEqual([
			'solo-event',
			'unlinked-event'
		]);
	});
});
