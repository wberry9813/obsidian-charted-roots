import { describe, expect, it } from 'vitest';
import {
	HistoricalDateService,
	axisIntervalsOverlap,
	projectTemporalValueToAxis
} from '../src/v2';

function resolved(
	service: HistoricalDateService,
	expression: string
) {
	const result = service.parse(expression);
	if (result.status !== 'resolved') {
		throw new Error(`Expected resolved expression: ${expression}`);
	}
	return result.value;
}

describe('temporal axis projection', () => {
	it('projects a year as a full interval rather than a January 1 point', () => {
		const service = new HistoricalDateService();
		const calendar = service.getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar provider is unavailable.');

		const interval = projectTemporalValueToAxis(
			resolved(service, '453 CE'),
			calendar
		);
		expect(interval).not.toBeNull();
		expect(interval!.precision).toBe('year');
		expect(interval!.endExclusive - interval!.start).toBeGreaterThan(300);
	});

	it('projects an exact day as one Julian day', () => {
		const service = new HistoricalDateService();
		const calendar = service.getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar provider is unavailable.');

		const interval = projectTemporalValueToAxis(
			resolved(service, '453-06-01'),
			calendar
		);
		expect(interval).not.toBeNull();
		expect(interval!.precision).toBe('day');
		expect(interval!.endExclusive - interval!.start).toBe(1);
	});

	it('keeps an exact day inside the containing year interval', () => {
		const service = new HistoricalDateService();
		const calendar = service.getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar provider is unavailable.');

		const year = projectTemporalValueToAxis(
			resolved(service, '453 CE'),
			calendar
		)!;
		const day = projectTemporalValueToAxis(
			resolved(service, '453-06-01'),
			calendar
		)!;

		expect(axisIntervalsOverlap(year, day)).toBe(true);
		expect(day.start).toBeGreaterThanOrEqual(year.start);
		expect(day.endExclusive).toBeLessThanOrEqual(year.endExclusive);
	});

	it('keeps 1 BCE and 1 CE contiguous without a displayed-year-zero gap', () => {
		const service = new HistoricalDateService();
		const calendar = service.getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar provider is unavailable.');

		const bce = projectTemporalValueToAxis(
			resolved(service, '1 BCE'),
			calendar
		)!;
		const ce = projectTemporalValueToAxis(
			resolved(service, '1 CE'),
			calendar
		)!;

		expect(bce.endExclusive).toBe(ce.start);
		expect(axisIntervalsOverlap(bce, ce)).toBe(false);
	});

	it('returns null for invalid canonical intervals', () => {
		const service = new HistoricalDateService();
		const calendar = service.getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar provider is unavailable.');

		expect(projectTemporalValueToAxis({
			original: 'invalid',
			precision: 'year',
			certainty: 'unknown',
			resolver: 'test',
			canonical: {
				scale: 'astronomical_year',
				start: 10,
				end: 5
			}
		}, calendar)).toBeNull();
	});
});
