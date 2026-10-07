import { describe, expect, it, vi } from 'vitest';
import { TemporalFocusService } from '../src/v2';

describe('TemporalFocusService', () => {
	it('stores point focus as a defensive copy', () => {
		const service = new TemporalFocusService();
		service.setPoint(123.5, 'timeline');

		expect(service.get()).toEqual({
			kind: 'point',
			position: 123.5,
			source: 'timeline'
		});

		const focus = service.get();
		if (focus?.kind === 'point') {
			focus.position = 999;
		}
		expect(service.get()).toEqual({
			kind: 'point',
			position: 123.5,
			source: 'timeline'
		});
	});

	it('stores valid ranges and rejects inverted ranges', () => {
		const service = new TemporalFocusService();
		service.setRange(10, 20, 'map');

		expect(service.get()).toEqual({
			kind: 'range',
			start: 10,
			endExclusive: 20,
			source: 'map'
		});
		expect(() => service.setRange(20, 20)).toThrow(/end after start/i);
		expect(() => service.setRange(20, 10)).toThrow(/end after start/i);
	});

	it('notifies subscribers and supports unsubscribe', () => {
		const service = new TemporalFocusService();
		const listener = vi.fn();
		const unsubscribe = service.subscribe(listener);

		service.setPoint(42);
		expect(listener).toHaveBeenCalledWith({
			kind: 'point',
			position: 42,
			source: undefined
		});

		unsubscribe();
		service.setPoint(43);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('notifies listeners when focus is cleared', () => {
		const service = new TemporalFocusService();
		const listener = vi.fn();
		service.subscribe(listener);

		service.setRange(1, 2);
		service.clear();

		expect(listener).toHaveBeenLastCalledWith(null);
	});

	it('re-emits the current focus for Workspace refreshes', () => {
		const service = new TemporalFocusService();
		const listener = vi.fn();
		service.setPoint(42, 'timeline');
		service.subscribe(listener);

		service.refresh();

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith({
			kind: 'point',
			position: 42,
			source: 'timeline'
		});
	});

	it('rejects non-finite point coordinates', () => {
		const service = new TemporalFocusService();

		expect(() => service.setPoint(Number.NaN)).toThrow(/finite/i);
		expect(() => service.setPoint(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
	});
});
