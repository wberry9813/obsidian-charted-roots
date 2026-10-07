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

export type TemporalContextKind = 'process' | 'period';
export type TemporalContextState = 'active' | 'possible';

export interface TemporalContextStateEntry {
	state: TemporalContextState;
	kind: TemporalContextKind;
	id: string;
	title: string;
	typeId?: string;
	universe?: string;
	item: TemporalItem;
}

export interface TemporalContextStateSnapshot {
	active: TemporalContextStateEntry[];
	possible: TemporalContextStateEntry[];
}

const CONTEXT_KINDS: TemporalContextKind[] = ['process', 'period'];

function contextFilter(
	filter: TimelineItemFilter
): TimelineItemFilter | null {
	const requested = filter.kinds;
	if (!requested?.length) {
		return { ...filter, kinds: CONTEXT_KINDS };
	}
	const kinds = requested.filter(
		(kind): kind is TemporalContextKind =>
			kind === 'process' || kind === 'period'
	);
	return kinds.length > 0
		? { ...filter, kinds }
		: null;
}

function toEntry(
	item: TemporalItem,
	state: TemporalContextState
): TemporalContextStateEntry | null {
	if (item.kind !== 'process' && item.kind !== 'period') {
		return null;
	}
	return {
		state,
		kind: item.kind,
		id: item.id,
		title: item.title,
		typeId: item.typeId,
		universe: item.universe,
		item
	};
}

function compact(
	items: TemporalItem[],
	state: TemporalContextState
): TemporalContextStateEntry[] {
	return items
		.map(item => toEntry(item, state))
		.filter((entry): entry is TemporalContextStateEntry => entry !== null);
}

/**
 * Read-only contextual state for Period and Process entities at the shared
 * temporal axis.
 *
 * Definite spans stay separate from possible/open constraint windows so
 * downstream overlays never promote uncertain context into known context.
 */
export class TemporalContextStateService {
	constructor(
		private readonly projection: TemporalProjectionService,
		private readonly calendar: CalendarProvider
	) {}

	getAt(
		position: number,
		filter: TimelineItemFilter = {}
	): TemporalContextStateSnapshot {
		const scopedFilter = contextFilter(filter);
		if (!scopedFilter) return { active: [], possible: [] };
		const result = queryTimelineAt(
			this.buildModel(),
			position,
			scopedFilter
		);
		return {
			active: compact(
				result.activeSpans.map(span => span.item),
				'active'
			),
			possible: compact(
				result.possibleWindows.map(window => window.item),
				'possible'
			)
		};
	}

	getRange(
		range: TimelineDomain,
		filter: TimelineItemFilter = {}
	): TemporalContextStateSnapshot {
		const scopedFilter = contextFilter(filter);
		if (!scopedFilter) return { active: [], possible: [] };
		const result = queryTimelineRange(
			this.buildModel(),
			range,
			scopedFilter
		);
		return {
			active: compact(
				result.overlappingSpans.map(span => span.item),
				'active'
			),
			possible: compact(
				result.possibleWindows.map(window => window.item),
				'possible'
			)
		};
	}

	private buildModel() {
		return buildTimelineModel(
			this.projection.getAll().filter(
				item => item.kind === 'process' || item.kind === 'period'
			),
			this.calendar
		);
	}
}
