import type { DateService } from '../../dates/services/date-service';
import type { HistoricalDateService } from '../../v2/time/historical-date-service';

export type MapTemporalBridgeFailureReason =
	| 'invalid_year'
	| 'fictional_calendar_bridge_required'
	| 'ambiguous_non_positive_standard_year'
	| 'calendar_unavailable'
	| 'calendar_conversion_failed';

export type MapTemporalBridgeResult =
	| {
		status: 'resolved';
		legacyYear: number;
		start: number;
		endExclusive: number;
		source: 'standard-ce-year';
	}
	| {
		status: 'unsupported';
		legacyYear: number;
		reason: MapTemporalBridgeFailureReason;
		message: string;
	};

/**
 * Explicit bridge from the legacy Map slider's numeric year axis into the
 * shared Julian Day focus.
 *
 * Positive standard years are unambiguous CE years. Fictional canonical years
 * are chronology-local, while legacy non-positive standard years never
 * declared a BCE numbering contract; both stay unsupported until an explicit
 * mapping exists instead of risking silent historical corruption.
 */
export class MapTemporalFocusBridge {
	constructor(
		private readonly legacyDates: DateService,
		private readonly historicalDates: HistoricalDateService
	) {}

	resolveYear(
		legacyYear: number,
		universe?: string
	): MapTemporalBridgeResult {
		if (!Number.isInteger(legacyYear)) {
			return {
				status: 'unsupported',
				legacyYear,
				reason: 'invalid_year',
				message: 'Map time focus requires a whole canonical year.'
			};
		}

		if (this.legacyDates.hasFictionalDateSystemForUniverse(universe)) {
			return {
				status: 'unsupported',
				legacyYear,
				reason: 'fictional_calendar_bridge_required',
				message:
					'This universe uses a fictional calendar whose canonical year is not a real astronomical year.'
			};
		}

		if (legacyYear <= 0) {
			return {
				status: 'unsupported',
				legacyYear,
				reason: 'ambiguous_non_positive_standard_year',
				message:
					'Legacy Map year 0/negative values do not define a BCE numbering contract and cannot be safely converted to Julian Day.'
			};
		}

		const calendar = this.historicalDates.getCalendarProvider('tyme');
		if (!calendar) {
			return {
				status: 'unsupported',
				legacyYear,
				reason: 'calendar_unavailable',
				message: 'No Julian Day calendar provider is available.'
			};
		}

		try {
			return {
				status: 'resolved',
				legacyYear,
				start: calendar.solarToJulianDay({
					year: legacyYear,
					month: 1,
					day: 1
				}),
				endExclusive: calendar.solarToJulianDay({
					year: legacyYear + 1,
					month: 1,
					day: 1
				}),
				source: 'standard-ce-year'
			};
		} catch (error) {
			return {
				status: 'unsupported',
				legacyYear,
				reason: 'calendar_conversion_failed',
				message: error instanceof Error ? error.message : String(error)
			};
		}
	}
}
