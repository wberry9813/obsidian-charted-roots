import { JulianDay, LunarDay, SolarDay } from 'tyme4ts';
import type {
	CalendarProvider,
	LunarCalendarDate,
	SexagenaryDate,
	SolarCalendarDate
} from '../calendar-provider';

function validateAstronomicalBceSolarDate(date: SolarCalendarDate): void {
	if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
		throw new Error('BCE solar date parts must be integers.');
	}
	if (date.month < 1 || date.month > 12) {
		throw new Error(`illegal solar month: ${date.month}`);
	}

	// Dates before the Gregorian cutover use the Julian leap-year rule in
	// Tyme's JulianDay implementation. Astronomical year 0 is divisible by 4.
	const leap = date.year % 4 === 0;
	const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (date.day < 1 || date.day > days[date.month - 1]) {
		throw new Error(`illegal solar day: ${date.year}-${date.month}-${date.day}`);
	}
}

function solarParts(day: SolarDay): SolarCalendarDate {
	return {
		year: day.getYear(),
		month: day.getMonth(),
		day: day.getDay()
	};
}

/**
 * Thin adapter around Tyme4TS.
 *
 * No Tyme object escapes this provider. This keeps the v2 semantic/time model
 * independent from a specific calendar library and makes the provider
 * replaceable or comparable with future engines.
 */
export class TymeCalendarProvider implements CalendarProvider {
	readonly id = 'tyme';

	solarToJulianDay(date: SolarCalendarDate): number {
		if (date.year >= 1) {
			return SolarDay
				.fromYmd(date.year, date.month, date.day)
				.getJulianDay()
				.getDay();
		}

		validateAstronomicalBceSolarDate(date);
		return JulianDay
			.fromYmdHms(date.year, date.month, date.day, 0, 0, 0)
			.getDay();
	}

	julianDayToSolar(julianDay: number): SolarCalendarDate {
		return solarParts(
			JulianDay.fromJulianDay(julianDay).getSolarDay()
		);
	}

	solarToLunar(date: SolarCalendarDate): LunarCalendarDate {
		if (date.year < 1) {
			throw new Error('Tyme lunar conversion does not support BCE/astronomical year zero.');
		}
		const lunar = SolarDay
			.fromYmd(date.year, date.month, date.day)
			.getLunarDay();
		const month = lunar.getLunarMonth();

		return {
			year: lunar.getYear(),
			month: lunar.getMonth(),
			day: lunar.getDay(),
			leapMonth: month.isLeap()
		};
	}

	lunarToSolar(date: LunarCalendarDate): SolarCalendarDate {
		if (date.year < 1) {
			throw new Error('Tyme lunar conversion does not support BCE/astronomical year zero.');
		}
		const month = date.leapMonth ? -Math.abs(date.month) : Math.abs(date.month);
		return solarParts(
			LunarDay.fromYmd(date.year, month, date.day).getSolarDay()
		);
	}

	getSexagenaryDate(date: SolarCalendarDate): SexagenaryDate {
		if (date.year < 1) {
			throw new Error('Tyme sexagenary conversion does not support BCE/astronomical year zero.');
		}
		const cycle = SolarDay
			.fromYmd(date.year, date.month, date.day)
			.getSixtyCycleDay();

		return {
			year: cycle.getYear().getName(),
			month: cycle.getMonth().getName(),
			day: cycle.getSixtyCycle().getName()
		};
	}
}
