import { describe, expect, it } from 'vitest';
import {
	HistoricalDateService,
	TymeCalendarProvider
} from '../src/v2';

describe('Tyme-backed solar day parsing', () => {
	it('resolves ISO-like CE dates to Julian Day precision', () => {
		const result = new HistoricalDateService().parse('2000-01-01');

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;

		expect(result.value.precision).toBe('day');
		expect(result.value.certainty).toBe('certain');
		expect(result.value.calendar).toBe('julian-gregorian-hybrid');
		expect(result.value.canonical).toEqual({
			scale: 'julian_day',
			start: 2451544.5,
			end: 2451544.5
		});
	});

	it('supports Chinese BCE day expressions using astronomical year internally', () => {
		const service = new HistoricalDateService();
		const bceLastDay = service.parse('公元前1年12月31日');
		const ceFirstDay = service.parse('1-01-01');

		expect(bceLastDay.status).toBe('resolved');
		expect(ceFirstDay.status).toBe('resolved');
		if (bceLastDay.status !== 'resolved' || ceFirstDay.status !== 'resolved') return;

		expect(bceLastDay.value.canonical.scale).toBe('julian_day');
		expect(ceFirstDay.value.canonical.scale).toBe('julian_day');
		expect(ceFirstDay.value.canonical.start - bceLastDay.value.canonical.start).toBe(1);
	});

	it('preserves approximate certainty for day-precision expressions', () => {
		const result = new HistoricalDateService().parse('约1986-05-29');

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		expect(result.value.precision).toBe('day');
		expect(result.value.certainty).toBe('approximate');
	});

	it('surfaces invalid dates instead of normalizing them silently', () => {
		const result = new HistoricalDateService().parse('2026-02-30');

		expect(result.status).toBe('unresolved');
		if (result.status !== 'unresolved') return;
		expect(result.reason).toMatch(/illegal/i);
	});

	it('uses Tyme JulianDay for astronomical year zero without claiming reverse SolarDay support', () => {
		const tyme = new TymeCalendarProvider();
		const bceLastDay = tyme.solarToJulianDay({ year: 0, month: 12, day: 31 });
		const ceFirstDay = tyme.solarToJulianDay({ year: 1, month: 1, day: 1 });

		expect(ceFirstDay - bceLastDay).toBe(1);
		expect(() => tyme.solarToLunar({ year: 0, month: 12, day: 31 }))
			.toThrow(/does not support BCE/i);
	});

	it('surfaces the historical 1582 calendar cutover gap used by Tyme', () => {
		const result = new HistoricalDateService().parse('1582-10-10');

		expect(result.status).toBe('unresolved');
		if (result.status !== 'unresolved') return;
		expect(result.reason).toMatch(/illegal solar day/i);
	});
});
