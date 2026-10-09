import type { DateService } from '../../dates/services/date-service';
import type { TemporalBoundaryProjection } from './types';

export type ChronologyYearGranularity = 'year' | 'month' | 'day';

/**
 * A chronology-local interval on a fictional calendar's canonical year axis.
 *
 * The first chronology Timeline bridge intentionally uses whole canonical-year
 * buckets because the legacy Map slider publishes that same axis. Month/day
 * precision remains recorded as metadata and is never converted to JDN.
 */
export interface ChronologyYearInterval {
	scale: 'chronology_year';
	chronologyId: string;
	start: number;
	endExclusive: number;
	original: string;
	label: string;
	universe?: string;
	granularity: ChronologyYearGranularity;
	approximate: boolean;
}

function granularityFor(
	month: number | undefined,
	day: number | undefined
): ChronologyYearGranularity {
	if (day !== undefined) return 'day';
	if (month !== undefined) return 'month';
	return 'year';
}

/**
 * Project one authored temporal boundary onto a specific fictional calendar's
 * canonical-year axis.
 *
 * This deliberately does not consult the historical/JDN parse result. A
 * fictional expression may be unresolved by HistoricalDateService while still
 * being valid for DateService's configured fictional calendar.
 */
export function projectTemporalBoundaryToChronologyYear(
	boundary: TemporalBoundaryProjection | undefined,
	universe: string | undefined,
	chronologyId: string,
	dateService: DateService
): ChronologyYearInterval | null {
	const normalizedChronologyId = chronologyId.trim();
	if (!boundary || !normalizedChronologyId) return null;

	const parsed = dateService.parseDate(boundary.expression, universe);
	if (
		!parsed
		|| parsed.type !== 'fictional'
		|| !parsed.fictional
		|| parsed.fictional.system.id !== normalizedChronologyId
		|| !Number.isFinite(parsed.fictional.canonicalYear)
	) {
		return null;
	}

	const start = parsed.fictional.canonicalYear;
	return {
		scale: 'chronology_year',
		chronologyId: normalizedChronologyId,
		start,
		endExclusive: start + 1,
		original: boundary.expression,
		label: parsed.fictional.system.name,
		...(universe ? { universe } : {}),
		granularity: granularityFor(
			parsed.fictional.month,
			parsed.fictional.day
		),
		approximate: parsed.isApproximate === true
			|| parsed.fictional.isApproximate === true
	};
}
