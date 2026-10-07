import type { CalendarProvider } from '../time/calendar-provider';
import {
	astronomicalYearToHistorical,
	formatHistoricalYearEn,
	formatHistoricalYearZhCN
} from '../time/historical-year';
import {
	projectTemporalBoundaryToAxis,
	type TemporalAxisInterval
} from './axis-projection';
import type {
	TemporalBoundaryProjection,
	TemporalItem
} from './types';

export interface TimelineSpan {
	item: TemporalItem;
	start: number;
	endExclusive: number;
	startInterval: TemporalAxisInterval;
	endInterval?: TemporalAxisInterval;
}

export interface TimelineConstraintWindow {
	item: TemporalItem;
	start?: number;
	endExclusive?: number;
	notBefore?: number;
	notAfterExclusive?: number;
}

export type TimelineReviewReason =
	| 'ambiguous'
	| 'unresolved'
	| 'partial'
	| 'undated'
	| 'precision_conflict'
	| 'invalid_interval'
	| 'unprojectable';

export interface TimelineReviewEntry {
	item: TemporalItem;
	reasons: TimelineReviewReason[];
}

export interface TimelineDomain {
	start: number;
	endExclusive: number;
}

export interface TimelineModel {
	spans: TimelineSpan[];
	windows: TimelineConstraintWindow[];
	review: TimelineReviewEntry[];
	domain: TimelineDomain | null;
}

export interface HistoricalYearTick {
	astronomicalYear: number;
	historicalYear: number;
	era: 'BCE' | 'CE';
	position: number;
	label: string;
}

export interface HistoricalYearTickOptions {
	locale?: 'en' | 'zh-CN';
	maxTicks?: number;
}

function boundaryHasPrecisionConflict(
	boundary: TemporalBoundaryProjection | undefined
): boolean {
	return boundary?.precisionConflict === true;
}

function itemHasPrecisionConflict(item: TemporalItem): boolean {
	return [
		item.start,
		item.end,
		item.notBefore,
		item.notAfter
	].some(boundaryHasPrecisionConflict);
}

function pushReview(
	review: TimelineReviewEntry[],
	item: TemporalItem,
	reasons: TimelineReviewReason[]
): void {
	const unique = [...new Set(reasons)];
	if (unique.length === 0) return;
	review.push({ item, reasons: unique });
}

function coordinateDomain(
	spans: readonly TimelineSpan[],
	windows: readonly TimelineConstraintWindow[]
): TimelineDomain | null {
	const values: number[] = [];

	for (const span of spans) {
		values.push(span.start, span.endExclusive);
	}
	for (const window of windows) {
		if (window.start !== undefined) values.push(window.start);
		if (window.endExclusive !== undefined) values.push(window.endExclusive);
		if (window.notBefore !== undefined) values.push(window.notBefore);
		if (window.notAfterExclusive !== undefined) {
			values.push(window.notAfterExclusive);
		}
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

/**
 * Build a renderer-neutral timeline model.
 *
 * Resolved point/coarse-date entities become finite spans. Constraint-only or
 * partially resolved items become windows. Ambiguous/unresolved/undated and
 * metadata-conflict states are surfaced separately for review rather than
 * being silently coerced to coordinates.
 */
export function buildTimelineModel(
	items: readonly TemporalItem[],
	calendar: CalendarProvider
): TimelineModel {
	const spans: TimelineSpan[] = [];
	const windows: TimelineConstraintWindow[] = [];
	const review: TimelineReviewEntry[] = [];

	for (const item of items) {
		const reasons: TimelineReviewReason[] = [];
		if (item.status === 'ambiguous') reasons.push('ambiguous');
		if (item.status === 'unresolved') reasons.push('unresolved');
		if (item.status === 'partial') reasons.push('partial');
		if (item.status === 'undated') reasons.push('undated');
		if (itemHasPrecisionConflict(item)) reasons.push('precision_conflict');

		const start = projectTemporalBoundaryToAxis(item.start, calendar);
		const end = projectTemporalBoundaryToAxis(item.end, calendar);
		const notBefore = projectTemporalBoundaryToAxis(item.notBefore, calendar);
		const notAfter = projectTemporalBoundaryToAxis(item.notAfter, calendar);

		const authoredStart = Boolean(item.start);
		const authoredEnd = Boolean(item.end);
		const authoredBounds = Boolean(item.notBefore || item.notAfter);

		if (item.status === 'resolved') {
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
				// A single resolved expression is represented by its full
				// precision interval: one day, one year, etc.
				spans.push({
					item,
					start: start.start,
					endExclusive: start.endExclusive,
					startInterval: start
				});
			} else if (authoredStart || authoredEnd) {
				// The item claimed a concrete start/end but no complete span
				// could be projected. Keep it out of the drawable span list.
				reasons.push('unprojectable');
			}
		}

		if (
			authoredBounds
			|| item.status === 'partial'
			|| (!start && end)
		) {
			const window: TimelineConstraintWindow = {
				item,
				start: start?.start,
				endExclusive: end?.endExclusive,
				notBefore: notBefore?.start,
				notAfterExclusive: notAfter?.endExclusive
			};

			const lowerCandidates = [
				window.start,
				window.notBefore
			].filter((value): value is number => value !== undefined);
			const upperCandidates = [
				window.endExclusive,
				window.notAfterExclusive
			].filter((value): value is number => value !== undefined);

			if (lowerCandidates.length > 0 && upperCandidates.length > 0) {
				const lower = Math.max(...lowerCandidates);
				const upper = Math.min(...upperCandidates);
				if (upper <= lower) {
					reasons.push('invalid_interval');
				} else {
					windows.push(window);
				}
			} else if (lowerCandidates.length > 0 || upperCandidates.length > 0) {
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

function niceHistoricalYearStep(
	yearSpan: number,
	maxTicks: number
): number {
	const safeMaxTicks = Math.max(2, Math.floor(maxTicks));
	const raw = Math.max(1, yearSpan / safeMaxTicks);
	const magnitude = 10 ** Math.floor(Math.log10(raw));
	const normalized = raw / magnitude;

	const factor = normalized <= 1
		? 1
		: normalized <= 2
			? 2
			: normalized <= 5
				? 5
				: 10;

	return Math.max(1, factor * magnitude);
}

function historicalTicksForEra(
	minAstronomicalYear: number,
	maxAstronomicalYear: number,
	step: number,
	era: 'BCE' | 'CE'
): number[] {
	if (era === 'BCE') {
		const eraMin = minAstronomicalYear;
		const eraMax = Math.min(maxAstronomicalYear, 0);
		if (eraMin > eraMax) return [];

		const smallestHistorical = 1 - eraMax;
		const largestHistorical = 1 - eraMin;
		const first = Math.ceil(smallestHistorical / step) * step;
		const result: number[] = [];
		for (
			let historicalYear = first;
			historicalYear <= largestHistorical;
			historicalYear += step
		) {
			result.push(1 - historicalYear);
		}
		return result;
	}

	const eraMin = Math.max(minAstronomicalYear, 1);
	const eraMax = maxAstronomicalYear;
	if (eraMin > eraMax) return [];

	const first = Math.ceil(eraMin / step) * step;
	const result: number[] = [];
	for (
		let historicalYear = first;
		historicalYear <= eraMax;
		historicalYear += step
	) {
		result.push(historicalYear);
	}
	return result;
}

/**
 * Generate ticks only at true historical year boundaries.
 *
 * Alignment is based on human historical year numbers in each era, not on
 * astronomical-year multiples. Therefore a 100-year BCE tick is "500 BCE",
 * never the off-by-one "501 BCE" that naive astronomical alignment produces.
 */
export function generateHistoricalYearTicks(
	domain: TimelineDomain,
	calendar: CalendarProvider,
	options: HistoricalYearTickOptions = {}
): HistoricalYearTick[] {
	const maxTicks = options.maxTicks ?? 12;
	if (
		!Number.isFinite(domain.start)
		|| !Number.isFinite(domain.endExclusive)
		|| domain.endExclusive <= domain.start
	) {
		return [];
	}

	const firstSolar = calendar.julianDayToSolar(domain.start);
	const lastSolar = calendar.julianDayToSolar(
		Math.max(domain.start, domain.endExclusive - 1e-6)
	);
	const minYear = Math.min(firstSolar.year, lastSolar.year);
	const maxYear = Math.max(firstSolar.year, lastSolar.year);
	const step = niceHistoricalYearStep(maxYear - minYear + 1, maxTicks);

	const years = [
		...historicalTicksForEra(minYear, maxYear, step, 'BCE'),
		...historicalTicksForEra(minYear, maxYear, step, 'CE')
	].sort((a, b) => a - b);

	const format = options.locale === 'zh-CN'
		? formatHistoricalYearZhCN
		: formatHistoricalYearEn;

	return years.flatMap(astronomicalYear => {
		const position = calendar.solarToJulianDay({
			year: astronomicalYear,
			month: 1,
			day: 1
		});
		if (
			position < domain.start
			|| position >= domain.endExclusive
		) {
			return [];
		}

		const historical = astronomicalYearToHistorical(astronomicalYear);
		return [{
			astronomicalYear,
			historicalYear: historical.year,
			era: historical.era,
			position,
			label: format(astronomicalYear)
		}];
	});
}
