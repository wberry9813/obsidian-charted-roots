import { describe, expect, it } from 'vitest';
import {
	CanonicalCoordinateService,
	canonicalizeHistoricalControlLayer,
	GcoordCoordinateTransformProvider,
	type HistoricalControlLayerDefinition
} from '../src/v2';

function coordinates() {
	return new CanonicalCoordinateService(
		new GcoordCoordinateTransformProvider()
	);
}

function layer(
	overrides: Partial<HistoricalControlLayerDefinition> = {}
): HistoricalControlLayerDefinition {
	return {
		id: 'history-boundary',
		label: 'Historical boundary',
		coordinateCRS: 'gcj02',
		time_start: 'BCE 500',
		time_end: 'BCE 400',
		source: '[[Sources/Atlas]]',
		confidence: 'high',
		featureCollection: {
			type: 'FeatureCollection',
			features: []
		},
		...overrides
	};
}

describe('M6 historical control-layer GeoJSON normalization', () => {
	it('normalizes GCJ-02 Point geometry to canonical WGS84', () => {
		const result = canonicalizeHistoricalControlLayer(layer({
			featureCollection: {
				type: 'FeatureCollection',
				features: [{
					type: 'Feature',
					id: 'capital',
					properties: {
						name: '郑州',
						time_start: 'BCE 500',
						source: ['[[Sources/A]]']
					},
					geometry: {
						type: 'Point',
						coordinates: [113.6253334, 34.7466173]
					}
				}]
			}
		}), coordinates());

		expect(result.coordinateCRS).toBe('wgs84');
		const geometry = result.featureCollection.features[0].geometry;
		expect(geometry?.type).toBe('Point');
		if (geometry?.type === 'Point') {
			expect(Math.abs(geometry.coordinates[0] - 113.6192856))
				.toBeLessThanOrEqual(1e-5);
			expect(Math.abs(geometry.coordinates[1] - 34.7478004))
				.toBeLessThanOrEqual(1e-5);
		}
		expect(result.featureCollection.features[0].properties).toEqual({
			name: '郑州',
			time_start: 'BCE 500',
			source: ['[[Sources/A]]']
		});
		expect(result.source).toBe('[[Sources/Atlas]]');
		expect(result.time_start).toBe('BCE 500');
	});

	it('preserves altitude and polygon ring topology while transforming vertices', () => {
		const input = layer({
			featureCollection: {
				type: 'FeatureCollection',
				features: [{
					type: 'Feature',
					properties: { name: 'Boundary' },
					geometry: {
						type: 'Polygon',
						coordinates: [[
							[113.6253334, 34.7466173, 88],
							[113.7253334, 34.7466173, 90],
							[113.6253334, 34.7466173, 88]
						]]
					}
				}]
			}
		});
		const result = canonicalizeHistoricalControlLayer(
			input,
			coordinates()
		);
		const geometry = result.featureCollection.features[0].geometry;
		expect(geometry?.type).toBe('Polygon');
		if (geometry?.type === 'Polygon') {
			expect(geometry.coordinates[0]).toHaveLength(3);
			expect(geometry.coordinates[0][0][2]).toBe(88);
			expect(geometry.coordinates[0][0]).toEqual(
				geometry.coordinates[0][2]
			);
		}
		// Import normalization must not mutate caller-owned GeoJSON.
		const original = input.featureCollection.features[0].geometry;
		if (original?.type === 'Polygon') {
			expect(original.coordinates[0][0][0]).toBe(113.6253334);
		}
	});

	it('recurses through GeometryCollection and leaves WGS84 values unchanged', () => {
		const input = layer({
			coordinateCRS: 'wgs84',
			featureCollection: {
				type: 'FeatureCollection',
				features: [{
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'GeometryCollection',
						geometries: [
							{
								type: 'Point',
								coordinates: [-74.006, 40.7128]
							},
							{
								type: 'LineString',
								coordinates: [
									[-74.006, 40.7128],
									[-73.9, 40.8]
								]
							}
						]
					}
				}]
			}
		});
		const result = canonicalizeHistoricalControlLayer(
			input,
			coordinates()
		);
		expect(result.featureCollection).toEqual(input.featureCollection);
		expect(result.featureCollection).not.toBe(input.featureCollection);
	});

	it('rejects invalid geometry coordinates before they enter canonical cache', () => {
		expect(() => canonicalizeHistoricalControlLayer(layer({
			featureCollection: {
				type: 'FeatureCollection',
				features: [{
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'Point',
						coordinates: [181, 34]
					}
				}]
			}
		}), coordinates())).toThrow(/longitude/i);
	});
});
