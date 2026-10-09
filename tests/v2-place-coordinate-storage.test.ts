import { describe, expect, it } from 'vitest';
import { normalizePlaceCoordinatesForStorage } from '../src/core/place-note-writer';

const WGS = {
	lat: 34.7478004,
	long: 113.6192856
};
const GCJ = {
	lat: 34.7466173,
	long: 113.6253334
};
const BD = {
	lat: 34.7528605,
	long: 113.6317519
};

function expectNearWgs(actual: { lat: number; long: number }): void {
	expect(Math.abs(actual.lat - WGS.lat)).toBeLessThanOrEqual(1e-5);
	expect(Math.abs(actual.long - WGS.long)).toBeLessThanOrEqual(1e-5);
}

describe('Place writer canonical coordinate policy', () => {
	it('keeps existing WGS84 callers unchanged by default', () => {
		expect(normalizePlaceCoordinatesForStorage(WGS)).toEqual(WGS);
	});

	it('normalizes GCJ-02 input to WGS84 before storage', () => {
		expectNearWgs(
			normalizePlaceCoordinatesForStorage(GCJ, 'gcj02')
		);
	});

	it('normalizes BD-09 input to WGS84 before storage', () => {
		expectNearWgs(
			normalizePlaceCoordinatesForStorage(BD, 'bd09')
		);
	});

	it('does not mutate transient input coordinate objects', () => {
		const input = { ...GCJ };
		normalizePlaceCoordinatesForStorage(input, 'gcj02');
		expect(input).toEqual(GCJ);
	});

	it('rejects invalid source coordinates instead of persisting them', () => {
		expect(() => normalizePlaceCoordinatesForStorage(
			{ lat: 95, long: 113 },
			'gcj02'
		)).toThrow(/latitude/i);
	});
});
