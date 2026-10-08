import type { DateService } from '../../dates/services/date-service';
import {
	projectTemporalBoundaryToChronologyYear,
	type ChronologyYearInterval
} from './chronology-axis-projection';
import type {
	TimelineConstraintWindow,
	TimelineModel,
	TimelineReviewEntry,
	TimelineReviewReason,
	TimelineSpan
} from './timeline-model';
import type {
	TemporalBoundaryProjection,
	TemporalItem
} from './types';

export interface ChronologyTimelineModelOptions {
	/**
	 * Optional universe scope carried by chronology-local focus. When present,
	 * the Timeline must not mix another universe that happens to reuse the same
	 * calendar system.
	 */
	universe?: string;
}

function normalizeUniverse(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const normalized = value
		.replace(/^\[\[/, '')
		.replace(/\]\]$/, '')
		.split('|', 1)[0]
		.trim()
		.toLocaleLowerCase();
	return normalized || undefined;
}

function boundaryHasPrecisionConflict(
	boundary: TemporalBoundaryProjection | undefined
): boolean {
	return boundary?.precisionConflict === true;
}

function pushReview(
	review: TimelineReviewEntry[],
	item: TemporalItem,
	reasons: TimelineReviewReason[]
): void {
	const unique = [...new Set(reasons)];
	if (unique.length > 0) review.push({ item, reasons: unique });
}

function coordinateDomain(
	spans: readonly TimelineSpan[],
	windows: readonly TimelineConstraintWindow[]
): TimelineModel['domain'] {
	const values: number[] = [];
	for (const span of spans) {
		values.push(span.start, span.endExclusive);
	}
	for (const window of windows) {
		if (window.start !== undefined) values.push(window.start);
		if (window.endExclusive !== undefined) values.push(window.endExclusive);
		if (window.notBefore !== undefined) values.push(window.notBefore);
		if (window.notAfterExclusive !== undefined) values.push(window.notAfterExclusive);
	}
	if (values.length === 0) return null;
	const start = Math.min(...values);
	const endExclusive = Math.max(...values);
	return Number.isFinite(start)
		&& Number.isFinite(endExclusive)
		&& endExclusive > start
		? { start, endExclusive }
		: null;
}

function project(
	boundary: TemporalBoundaryProjection | undefined,
	item: TemporalItem,
	chronologyId: string,
	dateService: DateService
): ChronologyYearInterval | null {
	return projectTemporalBoundaryToChronologyYear(
		boundary,
		item.universe,
		chronologyId,
		dateService
	);
}

/**
 * Build a TimelineModel on one configured fictional calendar's canonical-year
 * axis.
 *
 * Items that have no boundary on the requested chronology are ignored rather
 * than reported as errors: a Workspace may legitimately contain multiple
 * chronologies. Once an item participates in this chronology, authored
 * boundaries that cannot project are surfaced for review instead of guessed.
 */
export function buildChronologyTimelineModel(
	items: readonly TemporalItem[],
	chronologyId: string,
	dateService: DateService,
	options: ChronologyTimelineModelOptions = {}
): TimelineModel {
	const spans: TimelineSpan[] = [];
	const windows: TimelineConstraintWindow[] = [];
	const review: TimelineReviewEntry[] = [];
	const requestedUniverse = normalizeUniverse(options.universe);

	for (const item of items) {
		if (
			requestedUniverse
			&& normalizeUniverse(item.universe) !== requestedUniverse
		) {
			continue;
		}

		const start = project(item.start, item, chronologyId, dateService);
		const end = project(item.end, item, chronologyId, dateService);
		const notBefore = project(item.notBefore, item, chronologyId, dateService);
		const notAfter = project(item.notAfter, item, chronologyId, dateService);

		const projected = [start, end, notBefore, notAfter].filter(Boolean).length;
		if (projected === 0) continue;

		const authoredStart = Boolean(item.start);
		const authoredEnd = Boolean(item.end);
		const authoredNotBefore = Boolean(item.notBefore);
		const authoredNotAfter = Boolean(item.notAfter);
		const authoredCount = [
			authoredStart,
			authoredEnd,
			authoredNotBefore,
			authoredNotAfter
		].filter(Boolean).length;

		const reasons: TimelineReviewReason[] = [];
		if ([
			item.start,
			item.end,
			item.notBefore,
			item.notAfter
		].some(boundaryHasPrecisionConflict)) {
			reasons.push('precision_conflict');
		}
		if (projected < authoredCount) {
			reasons.push('partial', 'unprojectable');
		}

		if (start && end) {
			if (end.endExclusive <= start.start) {
				reasons.push('invalid_interval');
			} else {
				spans.push({
					item,
					start: start.start,
					endExclusive: end.endExclusive,
					startInterval: start,
					endInterval: end
				});
			}
		} else if (start && !authoredEnd) {
			spans.push({
				item,
				start: start.start,
				endExclusive: start.endExclusive,
				startInterval: start
			});
		} else if (authoredStart || authoredEnd) {
			reasons.push('unprojectable');
		}

		if (authoredNotBefore || authoredNotAfter || (!start && end)) {
			const window: TimelineConstraintWindow = {
				item,
				start: start?.start,
				endExclusive: end?.endExclusive,
				notBefore: notBefore?.start,
				notAfterExclusive: notAfter?.endExclusive
			};
			const lower = [
				window.start,
				window.notBefore
			].filter((value): value is number => value !== undefined);
			const upper = [
				window.endExclusive,
				window.notAfterExclusive
			].filter((value): value is number => value !== undefined);

			if (lower.length > 0 && upper.length > 0) {
				if (Math.min(...upper) <= Math.max(...lower)) {
					reasons.push('invalid_interval');
				} else {
					windows.push(window);
				}
			} else if (lower.length > 0 || upper.length > 0) {
				windows.push(window);
			}
		}

		pushReview(review, item, reasons);
	}

	return {
		spans,
		windows,
		review,
		domain: coordinateDomain(spans, windows)
	};
}
