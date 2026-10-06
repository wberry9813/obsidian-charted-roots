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
		const result = service.parse('公元前1年12月31日');

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;

		const tyme = service.getCalendarProvider('tyme');
		expect(tyme).toBeDefined();
		expect(tyme?.julianDayToSolar(result.value.canonical.start)).toEqual({
			year: 0,
			month: 12,
			day: 31
		});
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

	it('keeps Tyme calendar conversion reversible across astronomical year zero', () => {
		const tyme = new TymeCalendarProvider();
		const source = { year: 0, month: 12, day: 31 };
		const jd = tyme.solarToJulianDay(source);

		expect(tyme.julianDayToSolar(jd)).toEqual(source);
	});

	it('surfaces the historical 1582 calendar cutover gap used by Tyme', () => {
		const result = new HistoricalDateService().parse('1582-10-10');

		expect(result.status).toBe('unresolved');
		if (result.status !== 'unresolved') return;
		expect(result.reason).toMatch(/illegal solar day/i);
	});
});
