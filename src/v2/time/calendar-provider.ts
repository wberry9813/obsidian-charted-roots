export interface SolarCalendarDate {
	/**
	 * Astronomical year numbering is allowed at this low-level adapter boundary.
	 * User-facing BCE/CE conversion remains the HistoricalDateService's job.
	 */
	year: number;
	month: number;
	day: number;
}

export interface LunarCalendarDate {
	year: number;
	month: number;
	day: number;
	leapMonth: boolean;
}

export interface SexagenaryDate {
	year: string;
	month: string;
	day: string;
}

export interface CalendarProvider {
	readonly id: string;

	solarToJulianDay(date: SolarCalendarDate): number;
	julianDayToSolar(julianDay: number): SolarCalendarDate;

	solarToLunar(date: SolarCalendarDate): LunarCalendarDate;
	lunarToSolar(date: LunarCalendarDate): SolarCalendarDate;

	getSexagenaryDate(date: SolarCalendarDate): SexagenaryDate;
}
