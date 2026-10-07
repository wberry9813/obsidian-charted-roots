import { describe, expect, it } from 'vitest';
import { createDateService } from '../src/dates/services/date-service';
import { MapTemporalFocusBridge } from '../src/maps/services/map-temporal-focus-bridge';
import { HistoricalDateService } from '../src/v2';

function legacyDates() {
	return createDateService({
		enableFictionalDates: true,
		showBuiltInDateSystems: true,
		fictionalDateSystems: []
	});
}

describe('M6 Map -> shared TemporalFocus chronology bridge', () => {
	it('maps a positive standard year to a full Julian Day year range', () => {
		const historical = new HistoricalDateService();
		const bridge = new MapTemporalFocusBridge(legacyDates(), historical);
		const result = bridge.resolveYear(110);

		expect(result.status).toBe('resolved');
		if (result.status !== 'resolved') return;
		const calendar = historical.getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme unavailable');
		expect(result.start).toBe(calendar.solarToJulianDay({
			year: 110, month: 1, day: 1
		}));
		expect(result.endExclusive).toBe(calendar.solarToJulianDay({
			year: 111, month: 1, day: 1
		}));
		expect(result.endExclusive).toBeGreaterThan(result.start);
	});

	it('refuses fictional canonical years instead of treating them as CE/BCE', () => {
		const bridge = new MapTemporalFocusBridge(
			legacyDates(),
			new HistoricalDateService()
		);
		expect(bridge.resolveYear(-82, 'Star Wars')).toMatchObject({
			status: 'unsupported',
			reason: 'fictional_calendar_bridge_required'
		});
		expect(bridge.resolveYear(5, 'Star Wars')).toMatchObject({
			status: 'unsupported',
			reason: 'fictional_calendar_bridge_required'
		});
	});

	it('refuses year zero and negative standard years until BCE semantics are explicit', () => {
		const bridge = new MapTemporalFocusBridge(
			legacyDates(),
			new HistoricalDateService()
		);
		expect(bridge.resolveYear(0)).toMatchObject({
			status: 'unsupported',
			reason: 'ambiguous_non_positive_standard_year'
		});
		expect(bridge.resolveYear(-453)).toMatchObject({
			status: 'unsupported',
			reason: 'ambiguous_non_positive_standard_year'
		});
	});

	it('recognizes an explicitly selected fictional universe calendar', () => {
		const dates = createDateService({
			enableFictionalDates: true,
			showBuiltInDateSystems: false,
			fictionalDateSystems: [{
				id: 'custom-calendar',
				name: 'Custom Calendar',
				universe: 'Different Label',
				eras: [{
					id: 'ce',
					name: 'Custom Era',
					abbrev: 'CX',
					epoch: 0,
					direction: 'forward'
				}],
				defaultEra: 'ce'
			}]
		});
		dates.setUniverseCalendarResolver(() => 'custom-calendar');

		expect(
			new MapTemporalFocusBridge(dates, new HistoricalDateService())
				.resolveYear(100, 'My World')
		).toMatchObject({
			status: 'unsupported',
			reason: 'fictional_calendar_bridge_required'
		});
	});

	it('rejects fractional slider years', () => {
		expect(
			new MapTemporalFocusBridge(legacyDates(), new HistoricalDateService())
				.resolveYear(110.5)
		).toMatchObject({
			status: 'unsupported',
			reason: 'invalid_year'
		});
	});
});
