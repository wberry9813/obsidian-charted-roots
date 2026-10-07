import type {
	TimelineConstraintWindow,
	TimelineDomain,
	TimelineModel,
	TimelineSpan
} from './timeline-model';
import type { TemporalItem, TemporalItemKind } from './types';

export interface TimelineItemFilter {
	kinds?: TemporalItemKind[];
	typeIds?: string[];
	predicates?: string[];
	universe?: string;
	subject?: string;
	object?: string;
	text?: string;
}

export interface TimelinePointQueryResult {
	activeSpans: TimelineSpan[];
	possibleWindows: TimelineConstraintWindow[];
}

export interface TimelineRangeQueryResult {
	overlappingSpans: TimelineSpan[];
	possibleWindows: TimelineConstraintWindow[];
}

function matchesText(item: TemporalItem, text: string): boolean {
	const needle = text.trim().toLocaleLowerCase();
	if (!needle) return true;

	return [
		item.title,
		item.typeId,
		item.predicate,
		item.universe,
		item.subject,
		item.object,
		typeof item.value === 'string' ? item.value : undefined
	]
		.filter((value): value is string => Boolean(value))
		.some(value => value.toLocaleLowerCase().includes(needle));
}

export function matchesTimelineFilter(
	item: TemporalItem,
	filter: TimelineItemFilter = {}
): boolean {
	if (filter.kinds?.length && !filter.kinds.includes(item.kind)) {
		return false;
	}
	if (
		filter.typeIds?.length
		&& (!item.typeId || !filter.typeIds.includes(item.typeId))
	) {
		return false;
	}
	if (
		filter.predicates?.length
		&& (!item.predicate || !filter.predicates.includes(item.predicate))
	) {
		return false;
	}
	if (filter.universe !== undefined && item.universe !== filter.universe) {
		return false;
	}
	if (filter.subject !== undefined && item.subject !== filter.subject) {
		return false;
	}
	if (filter.object !== undefined && item.object !== filter.object) {
		return false;
	}
	if (filter.text !== undefined && !matchesText(item, filter.text)) {
		return false;
	}
	return true;
}

export function timelineSpanContains(
	span: TimelineSpan,
	position: number
): boolean {
	return Number.isFinite(position)
		&& span.start <= position
		&& position < span.endExclusive;
}

export function timelineSpanOverlaps(
	span: TimelineSpan,
	range: TimelineDomain
): boolean {
	return range.start < range.endExclusive
		&& span.start < range.endExclusive
		&& range.start < span.endExclusive;
}

export function timelineWindowBounds(
	window: TimelineConstraintWindow
): { lower?: number; upper?: number } {
	const lowers = [window.start, window.notBefore]
		.filter((value): value is number => value !== undefined);
	const uppers = [window.endExclusive, window.notAfterExclusive]
		.filter((value): value is number => value !== undefined);

	return {
		lower: lowers.length ? Math.max(...lowers) : undefined,
		upper: uppers.length ? Math.min(...uppers) : undefined
	};
}

/**
 * A constraint window does not prove that an item was active at a point; it
 * only proves that the point remains compatible with the known bounds.
 */
export function timelineWindowAllows(
	window: TimelineConstraintWindow,
	position: number
): boolean {
	if (!Number.isFinite(position)) return false;
	const { lower, upper } = timelineWindowBounds(window);
	if (lower !== undefined && position < lower) return false;
	if (upper !== undefined && position >= upper) return false;
	return lower !== undefined || upper !== undefined;
}

export function timelineWindowCanOverlap(
	window: TimelineConstraintWindow,
	range: TimelineDomain
): boolean {
	if (
		!Number.isFinite(range.start)
		|| !Number.isFinite(range.endExclusive)
		|| range.endExclusive <= range.start
	) {
		return false;
	}

	const { lower, upper } = timelineWindowBounds(window);
	if (lower === undefined && upper === undefined) return false;

	const possibleStart = lower ?? Number.NEGATIVE_INFINITY;
	const possibleEnd = upper ?? Number.POSITIVE_INFINITY;
	return possibleStart < range.endExclusive && range.start < possibleEnd;
}

export function queryTimelineAt(
	model: TimelineModel,
	position: number,
	filter: TimelineItemFilter = {}
): TimelinePointQueryResult {
	return {
		activeSpans: model.spans.filter(span =>
			matchesTimelineFilter(span.item, filter)
			&& timelineSpanContains(span, position)
		),
		possibleWindows: model.windows.filter(window =>
			matchesTimelineFilter(window.item, filter)
			&& timelineWindowAllows(window, position)
		)
	};
}

export function queryTimelineRange(
	model: TimelineModel,
	range: TimelineDomain,
	filter: TimelineItemFilter = {}
): TimelineRangeQueryResult {
	return {
		overlappingSpans: model.spans.filter(span =>
			matchesTimelineFilter(span.item, filter)
			&& timelineSpanOverlaps(span, range)
		),
		possibleWindows: model.windows.filter(window =>
			matchesTimelineFilter(window.item, filter)
			&& timelineWindowCanOverlap(window, range)
		)
	};
}

export function queryTimelineBefore(
	model: TimelineModel,
	position: number,
	filter: TimelineItemFilter = {}
): TimelineSpan[] {
	return model.spans.filter(span =>
		matchesTimelineFilter(span.item, filter)
		&& span.endExclusive <= position
	);
}

export function queryTimelineAfter(
	model: TimelineModel,
	position: number,
	filter: TimelineItemFilter = {}
): TimelineSpan[] {
	return model.spans.filter(span =>
		matchesTimelineFilter(span.item, filter)
		&& span.start >= position
	);
}
