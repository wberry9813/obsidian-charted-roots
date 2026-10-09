import type { CalendarProvider } from '../time/calendar-provider';
import type { TemporalProjectionService } from './temporal-projection-service';
import {
	buildTimelineModel,
	type TimelineDomain
} from './timeline-model';
import {
	queryTimelineAt,
	queryTimelineRange,
	type TimelineItemFilter
} from './timeline-query';
import type { TemporalItem } from './types';

export type TemporalAssertionState = 'active' | 'possible';

export interface TemporalAssertionStateEntry {
	state: TemporalAssertionState;
	item: TemporalItem;
	id: string;
	subject: string;
	predicate: string;
	object?: string;
	value?: string | number | boolean;
}

export interface TemporalAssertionStateSnapshot {
	position: number;
	active: TemporalAssertionStateEntry[];
	possible: TemporalAssertionStateEntry[];
}

export interface TemporalAssertionRangeSnapshot {
	range: TimelineDomain;
	active: TemporalAssertionStateEntry[];
	possible: TemporalAssertionStateEntry[];
}

function toStateEntry(
	item: TemporalItem,
	state: TemporalAssertionState
): TemporalAssertionStateEntry | null {
	if (
		item.kind !== 'assertion'
		|| !item.subject
		|| !item.predicate
	) {
		return null;
	}
	return {
		state,
		item,
		id: item.id,
		subject: item.subject,
		predicate: item.predicate,
		object: item.object,
		value: item.value
	};
}

function compactEntries(
	items: TemporalItem[],
	state: TemporalAssertionState
): TemporalAssertionStateEntry[] {
	return items
		.map(item => toStateEntry(item, state))
		.filter(
			(entry): entry is TemporalAssertionStateEntry => entry !== null
		);
}

/**
 * Read-only temporal state facade for relation/map consumers.
 *
 * It deliberately keeps known active Assertions separate from merely possible
 * constraint windows. Consumers must choose how to visualize uncertainty;
 * this service never promotes "possible" into "active".
 */
export class TemporalAssertionStateService {
	constructor(
		private readonly projection: TemporalProjectionService,
		private readonly calendar: CalendarProvider
	) {}

	getAt(
		position: number,
		filter: TimelineItemFilter = {}
	): TemporalAssertionStateSnapshot {
		const model = this.buildModel();
		const result = queryTimelineAt(
			model,
			position,
			{ ...filter, kinds: ['assertion'] }
		);

		return {
			position,
			active: compactEntries(
				result.activeSpans.map(span => span.item),
				'active'
			),
			possible: compactEntries(
				result.possibleWindows.map(window => window.item),
				'possible'
			)
		};
	}

	getRange(
		range: TimelineDomain,
		filter: TimelineItemFilter = {}
	): TemporalAssertionRangeSnapshot {
		const model = this.buildModel();
		const result = queryTimelineRange(
			model,
			range,
			{ ...filter, kinds: ['assertion'] }
		);

		return {
			range,
			active: compactEntries(
				result.overlappingSpans.map(span => span.item),
				'active'
			),
			possible: compactEntries(
				result.possibleWindows.map(window => window.item),
				'possible'
			)
		};
	}

	private buildModel() {
		const assertions = this.projection.getAll()
			.filter(item => item.kind === 'assertion');
		return buildTimelineModel(assertions, this.calendar);
	}
}
