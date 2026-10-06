import { describe, expect, it } from 'vitest';
import {
	HistoricalDateService,
	type HistoricalDateProvider
} from '../src/v2';

describe('HistoricalDateService', () => {
	it.each([
		['前453年', -452],
		['公元前453年', -452],
		['453 BCE', -452],
		['BCE 453', -452],
		['453 BC', -452],
		['公元453年', 453],
		['453 CE', 453],
		['AD 453', 453],
		['453年', 453]
	])('parses %s as astronomical year %i', (expression, year) => {
		const result = new HistoricalDateService().parse(expression);

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		expect(result.value.original).toBe(expression);
		expect(result.value.precision).toBe('year');
		expect(result.value.canonical).toEqual({
			scale: 'astronomical_year',
			start: year,
			end: year
		});
	});

	it('keeps precision and certainty independent', () => {
		const result = new HistoricalDateService().parse('约前453年');

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		expect(result.value.precision).toBe('year');
		expect(result.value.certainty).toBe('approximate');
	});

	it('orders BCE years chronologically', () => {
		const service = new HistoricalDateService();
		const older = service.parse('BCE 497');
		const newer = service.parse('BCE 453');

		expect(older.status).toBe('resolved');
		expect(newer.status).toBe('resolved');
		if (older.status !== 'resolved' || newer.status !== 'resolved') return;
		expect(service.compare(older.value, newer.value)).toBe(-1);
	});

	it('rejects historical year zero', () => {
		const result = new HistoricalDateService().parse('0 BCE');

		expect(result.status).toBe('unresolved');
		if (result.status !== 'unresolved') return;
		expect(result.reason).toMatch(/no year zero/i);
	});

	it('leaves unsupported regnal expressions unresolved until a chronology provider is installed', () => {
		const result = new HistoricalDateService().parse('建安十三年');

		expect(result.status).toBe('unresolved');
	});

	it('surfaces conflicting provider resolutions as ambiguity', () => {
		const providerA: HistoricalDateProvider = {
			id: 'test-a',
			parse: expression => expression === 'X' ? {
				status: 'resolved',
				value: {
					original: expression,
					precision: 'year',
					certainty: 'certain',
					resolver: 'test-a',
					canonical: { scale: 'astronomical_year', start: 1, end: 1 }
				}
			} : null
		};
		const providerB: HistoricalDateProvider = {
			id: 'test-b',
			parse: expression => expression === 'X' ? {
				status: 'resolved',
				value: {
					original: expression,
					precision: 'year',
					certainty: 'certain',
					resolver: 'test-b',
					canonical: { scale: 'astronomical_year', start: 2, end: 2 }
				}
			} : null
		};

		const service = new HistoricalDateService({
			includeBuiltInBceCeProvider: false,
			providers: [providerA, providerB]
		});
		const result = service.parse('X');

		expect(result.status).toBe('ambiguous');
		if (result.status !== 'ambiguous') return;
		expect(result.candidates).toHaveLength(2);
	});

	it('deduplicates equivalent resolutions from multiple providers', () => {
		const providerA: HistoricalDateProvider = {
			id: 'test-a',
			parse: expression => ({
				status: 'resolved',
				value: {
					original: expression,
					precision: 'year',
					certainty: 'certain',
					resolver: 'test-a',
					canonical: { scale: 'astronomical_year', start: 10, end: 10 }
				}
			})
		};
		const providerB: HistoricalDateProvider = {
			id: 'test-b',
			parse: expression => ({
				status: 'resolved',
				value: {
					original: expression,
					precision: 'year',
					certainty: 'certain',
					resolver: 'test-b',
					canonical: { scale: 'astronomical_year', start: 10, end: 10 }
				}
			})
		};

		const result = new HistoricalDateService({
			includeBuiltInBceCeProvider: false,
			providers: [providerA, providerB]
		}).parse('same');

		expect(result.status).toBe('resolved');
	});
});
