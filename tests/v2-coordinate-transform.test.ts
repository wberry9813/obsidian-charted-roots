import { describe, expect, it } from 'vitest';
import {
	CANONICAL_GEOGRAPHIC_CRS,
	CanonicalCoordinateService,
	GcoordCoordinateTransformProvider
} from '../src/v2';

function service() {
	return new CanonicalCoordinateService(
		new GcoordCoordinateTransformProvider()
	);
}

const GOLDEN_DEGREES_TOLERANCE = 1e-5;

function expectCoordinateWithin(
	actual: { longitude: number; latitude: number },
	expected: { longitude: number; latitude: number },
	tolerance = GOLDEN_DEGREES_TOLERANCE
): void {
	expect(Math.abs(actual.longitude - expected.longitude)).toBeLessThanOrEqual(tolerance);
	expect(Math.abs(actual.latitude - expected.latitude)).toBeLessThanOrEqual(tolerance);
}

describe('M6 canonical geographic coordinates', () => {
	it('defines WGS84 as the only canonical vault geographic CRS', () => {
		expect(CANONICAL_GEOGRAPHIC_CRS).toBe('wgs84');
		expect(service().canonicalCRS).toBe('wgs84');
	});

	it('matches a known China-city WGS84 -> GCJ-02 fixture', () => {
		// Zhengzhou fixture from gcoord's MIT-licensed test dataset.
		const result = service().fromCanonical(
			{ longitude: 113.6192856, latitude: 34.7478004 },
			'gcj02'
		);

		expectCoordinateWithin(result, {
			longitude: 113.6253334,
			latitude: 34.7466173
		});
	});

	it('matches the corresponding WGS84 -> BD-09 fixture', () => {
		const result = service().fromCanonical(
			{ longitude: 113.6192856, latitude: 34.7478004 },
			'bd09'
		);

		expectCoordinateWithin(result, {
			longitude: 113.6317519,
			latitude: 34.7528605
		});
	});

	it('normalizes GCJ-02 input back to canonical WGS84', () => {
		const result = service().toCanonical(
			{ longitude: 113.6253334, latitude: 34.7466173 },
			'gcj02'
		);

		expectCoordinateWithin(result, {
			longitude: 113.6192856,
			latitude: 34.7478004
		});
	});

	it('round-trips canonical WGS84 through BD-09 within map precision', () => {
		const canonical = {
			longitude: 113.6192856,
			latitude: 34.7478004
		};
		const bd09 = service().fromCanonical(canonical, 'bd09');
		const restored = service().toCanonical(bd09, 'bd09');

		expect(restored.longitude).toBeCloseTo(canonical.longitude, 5);
		expect(restored.latitude).toBeCloseTo(canonical.latitude, 5);
	});

	it('leaves WGS84 -> GCJ-02 coordinates outside China unchanged', () => {
		const newYork = {
			longitude: -74.006,
			latitude: 40.7128
		};
		expect(service().fromCanonical(newYork, 'gcj02')).toEqual(newYork);
	});

	it('does not mutate the caller coordinate object', () => {
		const input = {
			longitude: 113.6192856,
			latitude: 34.7478004
		};
		const before = { ...input };
		service().fromCanonical(input, 'gcj02');
		expect(input).toEqual(before);
	});

	it('rejects invalid coordinate ranges before transformation', () => {
		expect(() => service().fromCanonical({
			longitude: 181,
			latitude: 34
		}, 'gcj02')).toThrow(/longitude/i);

		expect(() => service().toCanonical({
			longitude: 113,
			latitude: 91
		}, 'gcj02')).toThrow(/latitude/i);
	});

	it('transforms batches without changing ordering', () => {
		const input = [
			{ longitude: 113.6192856, latitude: 34.7478004 },
			{ longitude: -74.006, latitude: 40.7128 }
		];
		const result = service().transformMany(input, 'wgs84', 'gcj02');

		expect(result).toHaveLength(2);
		expectCoordinateWithin(result[0], {
			longitude: 113.6253334,
			latitude: 34.7466173
		});
		expect(result[1]).toEqual(input[1]);
	});
});
