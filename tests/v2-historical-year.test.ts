import { describe, expect, it } from 'vitest';
import {
	astronomicalYearToHistorical,
	formatHistoricalYearEn,
	formatHistoricalYearZhCN,
	historicalYearToAstronomical
} from '../src/v2';

describe('historical year numbering', () => {
	it('converts BCE years to astronomical numbering without a display year zero', () => {
		expect(historicalYearToAstronomical(1, 'BCE')).toBe(0);
		expect(historicalYearToAstronomical(2, 'BCE')).toBe(-1);
		expect(historicalYearToAstronomical(453, 'BCE')).toBe(-452);
		expect(historicalYearToAstronomical(1, 'CE')).toBe(1);
	});

	it('round-trips astronomical years to BCE/CE', () => {
		expect(astronomicalYearToHistorical(0)).toEqual({ era: 'BCE', year: 1 });
		expect(astronomicalYearToHistorical(-452)).toEqual({ era: 'BCE', year: 453 });
		expect(astronomicalYearToHistorical(1)).toEqual({ era: 'CE', year: 1 });
	});

	it('formats historical display without year zero', () => {
		expect(formatHistoricalYearZhCN(0)).toBe('前1年');
		expect(formatHistoricalYearZhCN(-452)).toBe('前453年');
		expect(formatHistoricalYearEn(0)).toBe('1 BCE');
		expect(formatHistoricalYearEn(1)).toBe('1 CE');
	});

	it('rejects historical year zero', () => {
		expect(() => historicalYearToAstronomical(0, 'BCE')).toThrow(/no year zero/i);
		expect(() => historicalYearToAstronomical(0, 'CE')).toThrow(/no year zero/i);
	});
});
