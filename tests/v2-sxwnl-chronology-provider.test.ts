import { describe, expect, it } from 'vitest';
import {
	HistoricalDateService,
	SxwnlChronologyProvider,
	type SxwnlChronologyRecord
} from '../src/v2';

const records: readonly SxwnlChronologyRecord[] = [
	{
		startAstronomicalYear: 196,
		spanYears: 25,
		usedYears: 0,
		dynasty: '东汉',
		reignTitle: '献帝',
		ruler: '刘协',
		eraName: '建安'
	},
	{
		startAstronomicalYear: -139,
		spanYears: 6,
		usedYears: 0,
		dynasty: '西汉',
		reignTitle: '武帝',
		ruler: '刘彻',
		eraName: '建元'
	},
	{
		startAstronomicalYear: 365,
		spanYears: 21,
		usedYears: 0,
		dynasty: '前秦',
		reignTitle: '世祖',
		ruler: '苻坚',
		eraName: '建元'
	}
];

function service() {
	return new HistoricalDateService({
		providers: [new SxwnlChronologyProvider(records)]
	});
}

describe('SxwnlChronologyProvider', () => {
	it('resolves a known era year from injected records', () => {
		const result = service().parse('建安十三年');

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		expect(result.value.canonical).toEqual({
			scale: 'astronomical_year',
			start: 208,
			end: 208
		});
		expect(result.value.resolver).toBe('sxwnl-chronology');
	});

	it('returns ambiguity for repeated era names without context', () => {
		const result = service().parse('建元元年');

		expect(result.status).toBe('ambiguous');
		if (result.status !== 'ambiguous') return;
		expect(result.candidates).toHaveLength(2);
	});

	it('uses polity context to disambiguate repeated era names', () => {
		const result = service().parse('建元元年', { polity: '前秦' });

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		expect(result.value.canonical.start).toBe(365);
		expect(result.value.chronology).toContain('前秦');
	});

	it('does not infer years outside the supplied record span', () => {
		const result = service().parse('建安二十六年');

		expect(result.status).toBe('unresolved');
	});
});
