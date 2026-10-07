import { describe, expect, it } from 'vitest';
import {
	CanonicalCoordinateService,
	canonicalizeHistoricalControlLayer,
	GeographicBasemapCoordinateAdapter,
	GcoordCoordinateTransformProvider,
	HistoricalControlLayerStateService,
	HistoricalDateService,
	projectCanonicalControlFeatureToBasemap,
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


describe('M6 historical control-layer temporal state', () => {
	function stateService() {
		const dates = new HistoricalDateService();
		const calendar = dates.getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar unavailable');
		return { dates, calendar, service: new HistoricalControlLayerStateService(dates, calendar) };
	}

	it('separates definite active features from possible constraint windows', () => {
		const { calendar, service } = stateService();
		const canonical = canonicalizeHistoricalControlLayer(layer({
			coordinateCRS: 'wgs84',
			time_start: undefined,
			time_end: undefined,
			featureCollection: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						id: 'active',
						properties: {
							name: 'Active boundary',
							time_start: 'BCE 500',
							time_end: 'BCE 400'
						},
						geometry: {
							type: 'LineString',
							coordinates: [[108, 34], [109, 35]]
						}
					},
					{
						type: 'Feature',
						id: 'possible',
						properties: {
							name: 'Possible boundary',
							time_not_before: 'BCE 500',
							time_not_after: 'BCE 400'
						},
						geometry: {
							type: 'LineString',
							coordinates: [[110, 34], [111, 35]]
						}
					}
				]
			}
		}), coordinates());
		const point = calendar.solarToJulianDay({
			year: -455,
			month: 6,
			day: 1
		});
		const result = service.getAt([canonical], point);
		expect(result.active.map(entry => entry.feature.id)).toEqual(['active']);
		expect(result.possible.map(entry => entry.feature.id)).toEqual(['possible']);
	});

	it('hides features outside resolved temporal spans and keeps unresolved authored dates possible', () => {
		const { calendar, service } = stateService();
		const canonical = canonicalizeHistoricalControlLayer(layer({
			coordinateCRS: 'wgs84',
			time_start: undefined,
			time_end: undefined,
			featureCollection: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						id: 'past',
						properties: {
							time_start: 'BCE 500',
							time_end: 'BCE 400'
						},
						geometry: { type: 'Point', coordinates: [108, 34] }
					},
					{
						type: 'Feature',
						id: 'unknown',
						properties: { time_start: 'Some legendary age' },
						geometry: { type: 'Point', coordinates: [109, 35] }
					}
				]
			}
		}), coordinates());
		const point = calendar.solarToJulianDay({
			year: 100,
			month: 1,
			day: 1
		});
		const result = service.getAt([canonical], point);
		expect(result.active).toEqual([]);
		expect(result.possible.map(entry => entry.feature.id)).toEqual(['unknown']);
	});

	it('intersects layer and feature temporal state and filters universe', () => {
		const { calendar, service } = stateService();
		const canonical = canonicalizeHistoricalControlLayer(layer({
			coordinateCRS: 'wgs84',
			universe: 'History',
			time_start: 'BCE 500',
			time_end: 'BCE 400',
			featureCollection: {
				type: 'FeatureCollection',
				features: [{
					type: 'Feature',
					id: 'feature',
					properties: {
						time_not_before: 'BCE 480',
						time_not_after: 'BCE 430'
					},
					geometry: { type: 'Point', coordinates: [108, 34] }
				}]
			}
		}), coordinates());
		const point = calendar.solarToJulianDay({
			year: -455,
			month: 1,
			day: 1
		});
		expect(service.getAt([canonical], point, 'History').possible).toHaveLength(1);
		expect(service.getAt([canonical], point, 'Fiction')).toEqual({
			active: [],
			possible: []
		});
	});

	it('renders only timeless features when shared focus is absent', () => {
		const { service } = stateService();
		const canonical = canonicalizeHistoricalControlLayer(layer({
			coordinateCRS: 'wgs84',
			time_start: undefined,
			time_end: undefined,
			featureCollection: {
				type: 'FeatureCollection',
				features: [
					{
						type: 'Feature',
						id: 'timeless',
						properties: {},
						geometry: { type: 'Point', coordinates: [108, 34] }
					},
					{
						type: 'Feature',
						id: 'dated',
						properties: { time_start: '100 CE' },
						geometry: { type: 'Point', coordinates: [109, 35] }
					}
				]
			}
		}), coordinates());
		expect(service.getWithoutFocus([canonical]).active.map(
			entry => entry.feature.id
		)).toEqual(['timeless']);
	});
});

describe('M6 historical control-layer basemap projection', () => {
	it('projects canonical WGS84 GeoJSON into the active GCJ-02 basemap datum', () => {
		const coordinateService = coordinates();
		const adapter = new GeographicBasemapCoordinateAdapter(
			coordinateService,
			{
				id: 'test-gcj',
				label: 'Test GCJ',
				coordinateCRS: 'gcj02',
				tileUrl: 'https://example.invalid/{z}/{x}/{y}.png',
				attribution: '',
				maxZoom: 19
			}
		);
		const feature = {
			type: 'Feature' as const,
			id: 'zhengzhou',
			properties: { name: '郑州' },
			geometry: {
				type: 'Point' as const,
				coordinates: [113.6192856, 34.7478004, 88] as [number, number, number]
			}
		};
		const projected = projectCanonicalControlFeatureToBasemap(
			feature,
			adapter
		);
		expect(projected.geometry?.type).toBe('Point');
		if (projected.geometry?.type === 'Point') {
			expect(Math.abs(projected.geometry.coordinates[0] - 113.6253334))
				.toBeLessThanOrEqual(1e-5);
			expect(Math.abs(projected.geometry.coordinates[1] - 34.7466173))
				.toBeLessThanOrEqual(1e-5);
			expect(projected.geometry.coordinates[2]).toBe(88);
		}
		expect(feature.geometry.coordinates[0]).toBe(113.6192856);
	});
});
