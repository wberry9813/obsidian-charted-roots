import type { CalendarProvider } from '../time/calendar-provider';
import type { TemporalValue } from '../time/types';
import type { TemporalBoundaryProjection } from './types';

export interface TemporalAxisInterval {
	scale: 'julian_day';
	/** Inclusive start in Julian Day coordinates. */
	start: number;
	/** Exclusive end in Julian Day coordinates. */
	endExclusive: number;
	original: string;
	precision: TemporalValue['precision'];
	certainty: TemporalValue['certainty'];
}

/**
 * Convert a resolved temporal value into the renderer-neutral continuous axis.
 *
 * The axis uses half-open Julian Day intervals. A day occupies one day; a
 * year-level value occupies the whole year. No representative January 1 point
 * is manufactured for coarse precision.
 */
export function projectTemporalValueToAxis(
	value: TemporalValue,
	calendar: CalendarProvider
): TemporalAxisInterval | null {
	const { canonical } = value;
	if (
		!Number.isFinite(canonical.start)
		|| !Number.isFinite(canonical.end)
		|| canonical.end < canonical.start
	) {
		return null;
	}

	if (canonical.scale === 'julian_day') {
		return {
			scale: 'julian_day',
			start: canonical.start,
			endExclusive: canonical.end + 1,
			original: value.original,
			precision: value.precision,
			certainty: value.certainty
		};
	}

	if (
		canonical.scale === 'astronomical_year'
		&& Number.isInteger(canonical.start)
		&& Number.isInteger(canonical.end)
	) {
		try {
			const start = calendar.solarToJulianDay({
				year: canonical.start,
				month: 1,
				day: 1
			});
			const endExclusive = calendar.solarToJulianDay({
				year: canonical.end + 1,
				month: 1,
				day: 1
			});
			if (
				!Number.isFinite(start)
				|| !Number.isFinite(endExclusive)
				|| endExclusive <= start
			) {
				return null;
			}
			return {
				scale: 'julian_day',
				start,
				endExclusive,
				original: value.original,
				precision: value.precision,
				certainty: value.certainty
			};
		} catch {
			return null;
		}
	}

	return null;
}

export function projectTemporalBoundaryToAxis(
	boundary: TemporalBoundaryProjection | undefined,
	calendar: CalendarProvider
): TemporalAxisInterval | null {
	if (!boundary || boundary.result.status !== 'resolved') {
		return null;
	}
	return projectTemporalValueToAxis(boundary.result.value, calendar);
}

export function axisIntervalsOverlap(
	a: TemporalAxisInterval,
	b: TemporalAxisInterval
): boolean {
	return a.start < b.endExclusive && b.start < a.endExclusive;
}
