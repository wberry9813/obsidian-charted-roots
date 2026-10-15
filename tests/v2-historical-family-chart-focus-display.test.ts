import { describe, expect, it } from 'vitest';
import type {
	CalendarProvider,
	LunarCalendarDate,
	SexagenaryDate,
	SolarCalendarDate
} from '../src/v2/time/calendar-provider';
import {
	describeHistoricalFamilyChartFocus
} from '../src/v2/historical-family-chart/focus-display';
import type { TemporalFocus } from '../src/v2/temporal/temporal-focus-service';

const calendar: CalendarProvider = {
	id: 'test',
	solarToJulianDay: () => 0,
	julianDayToSolar: (julianDay: number): SolarCalendarDate => {
		if (julianDay === 10) return { year: 208, month: 9, day: 1 };
		if (julianDay === 20) return { year: 0, month: 1, day: 1 };
		if (julianDay === 30) return { year: 1, month: 1, day: 1 };
		return { year: 200, month: 1, day: 1 };
	},
	solarToLunar: (): LunarCalendarDate => ({
		year: 1,
		month: 1,
		day: 1,
		leapMonth: false
	}),
	lunarToSolar: (): SolarCalendarDate => ({
		year: 1,
		month: 1,
		day: 1
	}),
	getSexagenaryDate: (): SexagenaryDate => ({
		year: '甲子',
		month: '甲子',
		day: '甲子'
	})
};

describe('Historical Family Chart shared temporal focus display', () => {
	it('shows all time when no focus is active', () => {
		expect(describeHistoricalFamilyChartFocus(null, calendar)).toEqual({
			label: 'All time',
			kind: 'all_time',
			axis: 'none',
			supported: true
		});
	});

	it('formats a JDN point through the historical calendar', () => {
		const focus: TemporalFocus = {
			kind: 'point',
			position: 10,
			source: 'timeline'
		};
		expect(describeHistoricalFamilyChartFocus(focus, calendar)).toEqual({
			label: '208 CE · 09-01',
			kind: 'point',
			axis: 'julian_day',
			supported: true
		});
	});

	it('formats BCE/CE range boundaries without inventing year zero', () => {
		const focus: TemporalFocus = {
			kind: 'range',
			start: 20,
			endExclusive: 30,
			source: 'map-time-slider'
		};
		expect(describeHistoricalFamilyChartFocus(focus, calendar)).toEqual({
			label: '1 BCE · 01-01 → <1 CE · 01-01',
			kind: 'range',
			axis: 'julian_day',
			supported: true
		});
	});

	it('surfaces chronology-local focus as unsupported', () => {
		const focus: TemporalFocus = {
			kind: 'range',
			start: 12,
			endExclusive: 13,
			axis: {
				kind: 'chronology_year',
				chronologyId: 'shushan-calendar',
				label: '蜀山纪年',
				universe: '蜀山世界'
			},
			source: 'timeline'
		};
		expect(describeHistoricalFamilyChartFocus(focus, calendar)).toEqual({
			label: '蜀山纪年 · chronology-local focus unsupported',
			kind: 'range',
			axis: 'chronology_year',
			supported: false
		});
	});
});
