import { JulianDay, LunarDay, SolarDay } from 'tyme4ts';
import type {
	CalendarProvider,
	LunarCalendarDate,
	SexagenaryDate,
	SolarCalendarDate
} from '../calendar-provider';

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
		return SolarDay
			.fromYmd(date.year, date.month, date.day)
			.getJulianDay()
			.getDay();
	}

	julianDayToSolar(julianDay: number): SolarCalendarDate {
		return solarParts(
			JulianDay.fromJulianDay(julianDay).getSolarDay()
		);
	}

	solarToLunar(date: SolarCalendarDate): LunarCalendarDate {
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
		const month = date.leapMonth ? -Math.abs(date.month) : Math.abs(date.month);
		return solarParts(
			LunarDay.fromYmd(date.year, month, date.day).getSolarDay()
		);
	}

	getSexagenaryDate(date: SolarCalendarDate): SexagenaryDate {
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
