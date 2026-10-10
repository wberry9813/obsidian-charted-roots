import type { CalendarProvider } from '../time/calendar-provider';
import { astronomicalYearToHistorical } from '../time/historical-year';
import {
	isChronologyYearFocus,
	isJulianDayFocus,
	type TemporalFocus
} from '../temporal/temporal-focus-service';

export type HistoricalFamilyChartFocusAxis =
	| 'none'
	| 'julian_day'
	| 'chronology_year';

export interface HistoricalFamilyChartFocusDisplay {
	label: string;
	kind: 'all_time' | 'point' | 'range';
	axis: HistoricalFamilyChartFocusAxis;
	supported: boolean;
}

function formatJulianDayPoint(
	position: number,
	calendar?: CalendarProvider
): string {
	if (!calendar) {
		return `JDN ${position.toFixed(2).replace(/\.00$/, '')}`;
	}

	const solar = calendar.julianDayToSolar(position);
	const historical = astronomicalYearToHistorical(solar.year);
	const month = String(solar.month).padStart(2, '0');
	const day = String(solar.day).padStart(2, '0');
	return `${historical.year} ${historical.era} · ${month}-${day}`;
}

/**
 * Compact, user-facing description of the shared TemporalFocus consumed by
 * Historical Family Chart.
 *
 * Real historical mode only evaluates Julian Day focus. Chronology-local
 * focus is surfaced explicitly as unsupported rather than being silently
 * reinterpreted as JDN.
 */
export function describeHistoricalFamilyChartFocus(
	focus: TemporalFocus | null,
	calendar?: CalendarProvider
): HistoricalFamilyChartFocusDisplay {
	if (!focus) {
		return {
			label: 'All time',
			kind: 'all_time',
			axis: 'none',
			supported: true
		};
	}

	if (isChronologyYearFocus(focus)) {
		const chronology =
			focus.axis.label?.trim()
			|| focus.axis.chronologyId;
		return {
			label: `${chronology} · chronology-local focus unsupported`,
			kind: focus.kind,
			axis: 'chronology_year',
			supported: false
		};
	}

	if (!isJulianDayFocus(focus)) {
		return {
			label: 'Unsupported temporal focus',
			kind: focus.kind,
			axis: 'none',
			supported: false
		};
	}

	if (focus.kind === 'point') {
		return {
			label: formatJulianDayPoint(focus.position, calendar),
			kind: 'point',
			axis: 'julian_day',
			supported: true
		};
	}

	return {
		label:
			`${formatJulianDayPoint(focus.start, calendar)} → `
			+ `<${formatJulianDayPoint(focus.endExclusive, calendar)}`,
		kind: 'range',
		axis: 'julian_day',
		supported: true
	};
}
