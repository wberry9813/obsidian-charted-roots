import { describe, expect, it } from 'vitest';
import { TymeCalendarProvider } from '../src/v2';

describe('TymeCalendarProvider', () => {
	const provider = new TymeCalendarProvider();

	it('converts a solar day to Julian Day and back', () => {
		const source = { year: 2000, month: 1, day: 1 };
		const julianDay = provider.solarToJulianDay(source);

		expect(julianDay).toBe(2451544.5);
		expect(provider.julianDayToSolar(julianDay)).toEqual(source);
	});

	it('round-trips BCE astronomical years through Julian Day', () => {
		for (const source of [
			{ year: -549, month: 1, day: 1 },
			{ year: -1, month: 1, day: 1 },
			{ year: 0, month: 1, day: 1 },
			{ year: 1, month: 1, day: 1 }
		]) {
			const julianDay = provider.solarToJulianDay(source);
			expect(provider.julianDayToSolar(julianDay)).toEqual(source);
		}
	});

	it('matches the upstream Tyme solar-to-lunar example', () => {
		const lunar = provider.solarToLunar({
			year: 1986,
			month: 5,
			day: 29
		});

		expect(lunar).toEqual({
			year: 1986,
			month: 4,
			day: 21,
			leapMonth: false
		});
		expect(provider.lunarToSolar(lunar)).toEqual({
			year: 1986,
			month: 5,
			day: 29
		});
	});

	it('exposes sexagenary values without leaking Tyme objects', () => {
		const value = provider.getSexagenaryDate({
			year: 1986,
			month: 5,
			day: 29
		});

		expect(value.year).toMatch(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/);
		expect(value.month).toMatch(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/);
		expect(value.day).toMatch(/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/);
	});
});
