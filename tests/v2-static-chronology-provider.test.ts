import { describe, expect, it } from 'vitest';
import {
	HistoricalDateService,
	StaticChronologyProvider,
	type ChronologyDefinition
} from '../src/v2';

const definitions: ChronologyDefinition[] = [
	{
		id: 'han-jianan',
		kind: 'era_name',
		names: ['建安'],
		polity: '汉',
		ruler: '汉献帝',
		calendar: 'chinese-historical',
		source: 'test-fixture',
		mappings: [
			{
				yearNumber: 13,
				canonical: {
					scale: 'astronomical_year',
					start: 208,
					end: 208
				},
				precision: 'year'
			}
		]
	},
	{
		id: 'han-jianyuan',
		kind: 'era_name',
		names: ['建元'],
		polity: '汉',
		ruler: '汉武帝',
		calendar: 'chinese-historical',
		source: 'test-fixture',
		mappings: [
			{
				yearNumber: 1,
				canonical: {
					scale: 'astronomical_year',
					start: -139,
					end: -139
				},
				precision: 'year'
			}
		]
	},
	{
		id: 'former-qin-jianyuan',
		kind: 'era_name',
		names: ['建元'],
		polity: '前秦',
		ruler: '苻坚',
		calendar: 'chinese-historical',
		source: 'test-fixture',
		mappings: [
			{
				yearNumber: 1,
				canonical: {
					scale: 'astronomical_year',
					start: 365,
					end: 365
				},
				precision: 'year'
			}
		]
	}
];

function service() {
	return new HistoricalDateService({
		providers: [
			new StaticChronologyProvider('test-chronology', definitions)
		]
	});
}

describe('StaticChronologyProvider', () => {
	it('resolves a mapped Chinese era year without arithmetic inference', () => {
		const result = service().parse('建安十三年');

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		expect(result.value.chronology).toBe('han-jianan');
		expect(result.value.canonical).toEqual({
			scale: 'astronomical_year',
			start: 208,
			end: 208
		});
		expect(result.value.precision).toBe('year');
	});

	it('supports 元年 and preserves approximation independently', () => {
		const result = service().parse('约建元元年', {
			polity: '汉'
		});

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		expect(result.value.chronology).toBe('han-jianyuan');
		expect(result.value.certainty).toBe('approximate');
	});

	it('returns ambiguity for duplicate era names without context', () => {
		const result = service().parse('建元元年');

		expect(result.status).toBe('ambiguous');
		if (result.status !== 'ambiguous') return;
		expect(result.candidates).toHaveLength(2);
		expect(result.candidates.map(candidate => candidate.chronology).sort())
			.toEqual(['former-qin-jianyuan', 'han-jianyuan']);
	});

	it('uses polity context to disambiguate duplicate era names', () => {
		const result = service().parse('建元元年', {
			polity: '前秦'
		});

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		expect(result.value.chronology).toBe('former-qin-jianyuan');
		expect(result.value.canonical.start).toBe(365);
	});

	it('uses chronology id as the strongest explicit context', () => {
		const result = service().parse('建元元年', {
			chronology: 'han-jianyuan'
		});

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		expect(result.value.chronology).toBe('han-jianyuan');
	});

	it('does not invent an unmapped year from a start-year formula', () => {
		const result = service().parse('建安十二年');

		expect(result.status).toBe('unresolved');
		if (result.status !== 'unresolved') return;
		expect(result.reason).toMatch(/no mapping/i);
	});
});
