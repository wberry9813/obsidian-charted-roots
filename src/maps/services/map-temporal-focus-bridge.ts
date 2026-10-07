import type { DateService } from '../../dates/services/date-service';
import type { HistoricalDateService } from '../../v2/time/historical-date-service';
import type { LegacyNegativeYearSemantics } from '../types/map-types';

export type MapTemporalBridgeFailureReason =
	| 'invalid_year'
	| 'fictional_calendar_bridge_required'
	| 'ambiguous_non_positive_standard_year'
	| 'invalid_bce_display_year_zero'
	| 'calendar_unavailable'
	| 'calendar_conversion_failed';

export type MapTemporalBridgeResolvedSource =
	| 'standard-ce-year'
	| 'legacy-bce-display-year'
	| 'legacy-astronomical-year';

export type MapTemporalBridgeResult =
	| {
		status: 'resolved';
		legacyYear: number;
		astronomicalYear: number;
		start: number;
		endExclusive: number;
		source: MapTemporalBridgeResolvedSource;
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
 * remain chronology-local. Legacy non-positive standard years are resolved
 * only when the user has explicitly selected an interpretation policy.
 */
export class MapTemporalFocusBridge {
	constructor(
		private readonly legacyDates: DateService,
		private readonly historicalDates: HistoricalDateService,
		private readonly negativeYearSemantics: LegacyNegativeYearSemantics = 'reject'
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

		const resolved = this.resolveStandardYear(legacyYear);
		if (resolved.status === 'unsupported') return resolved;

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
				astronomicalYear: resolved.astronomicalYear,
				start: calendar.solarToJulianDay({
					year: resolved.astronomicalYear,
					month: 1,
					day: 1
				}),
				endExclusive: calendar.solarToJulianDay({
					year: resolved.astronomicalYear + 1,
					month: 1,
					day: 1
				}),
				source: resolved.source
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

	private resolveStandardYear(legacyYear: number):
		| {
			status: 'resolved';
			astronomicalYear: number;
			source: MapTemporalBridgeResolvedSource;
		}
		| {
			status: 'unsupported';
			legacyYear: number;
			reason:
				| 'ambiguous_non_positive_standard_year'
				| 'invalid_bce_display_year_zero';
			message: string;
		} {
		if (legacyYear > 0) {
			return {
				status: 'resolved',
				astronomicalYear: legacyYear,
				source: 'standard-ce-year'
			};
		}

		if (this.negativeYearSemantics === 'reject') {
			return {
				status: 'unsupported',
				legacyYear,
				reason: 'ambiguous_non_positive_standard_year',
				message:
					'Legacy Map year 0/negative values need an explicit BCE numbering interpretation before they can be converted to Julian Day.'
			};
		}

		if (this.negativeYearSemantics === 'bce_display') {
			if (legacyYear === 0) {
				return {
					status: 'unsupported',
					legacyYear,
					reason: 'invalid_bce_display_year_zero',
					message:
						'BCE display-year numbering has no year 0. Use -1 for 1 BCE or choose astronomical numbering.'
				};
			}
			return {
				status: 'resolved',
				// Signed legacy -453 interpreted explicitly as display 453 BCE.
				// Astronomical numbering: 1 BCE = 0, 2 BCE = -1, ...
				astronomicalYear: legacyYear + 1,
				source: 'legacy-bce-display-year'
			};
		}

		return {
			status: 'resolved',
			astronomicalYear: legacyYear,
			source: 'legacy-astronomical-year'
		};
	}
}
