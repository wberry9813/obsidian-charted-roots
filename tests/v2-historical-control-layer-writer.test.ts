import { describe, expect, it } from 'vitest';
import {
	buildHistoricalControlLayerManifestMarkdown,
	prepareHistoricalControlLayerImport
} from '../src/v2';

const GCJ_POINT = {
	type: 'FeatureCollection' as const,
	features: [{
		type: 'Feature' as const,
		properties: {
			name: '郑州',
			time_start: 'BCE 500'
		},
		geometry: {
			type: 'Point' as const,
			coordinates: [113.6253334, 34.7466173] as [number, number]
		}
	}]
};

describe('M6 historical control-layer import writer', () => {
	it('normalizes imported GCJ-02 geometry to canonical WGS84 before storage', () => {
		const layer = prepareHistoricalControlLayerImport({
			label: 'Historical boundary',
			sourceCRS: 'gcj02',
			rawGeoJson: JSON.stringify(GCJ_POINT),
			time_start: 'BCE 500',
			time_end: 'BCE 400',
			source: '[[Sources/Atlas]]'
		});

		expect(layer.coordinateCRS).toBe('wgs84');
		const geometry = layer.featureCollection.features[0].geometry;
		expect(geometry?.type).toBe('Point');
		if (geometry?.type === 'Point') {
			expect(Math.abs(geometry.coordinates[0] - 113.6192856))
				.toBeLessThanOrEqual(1e-5);
			expect(Math.abs(geometry.coordinates[1] - 34.7478004))
				.toBeLessThanOrEqual(1e-5);
		}
		expect(layer.time_start).toBe('BCE 500');
		expect(layer.source).toBe('[[Sources/Atlas]]');
	});

	it('builds a canonical manifest while preserving source CRS provenance', () => {
		const markdown = buildHistoricalControlLayerManifestMarkdown(
			'layer-id',
			'Han boundary',
			'han-boundary.geojson',
			'gcj02',
			{
				universe: 'History',
				source: ['[[Sources/A]]', '[[Sources/B]]'],
				confidence: 'high',
				uncertainty: 'certain',
				time_start: 'BCE 202',
				time_end: '220 CE'
			}
		);

		expect(markdown).toContain('cr_type: control_layer');
		expect(markdown).toContain('coordinate_crs: wgs84');
		expect(markdown).toContain('source_coordinate_crs: "gcj02"');
		expect(markdown).toContain('geojson_file: "han-boundary.geojson"');
		expect(markdown).toContain('time_start: "BCE 202"');
		expect(markdown).toContain('time_end: "220 CE"');
		expect(markdown).toContain('source: ["[[Sources/A]]","[[Sources/B]]"]');
	});

	it('omits source_coordinate_crs when import is already WGS84', () => {
		const markdown = buildHistoricalControlLayerManifestMarkdown(
			'layer-id',
			'WGS layer',
			'wgs.geojson',
			'wgs84',
			{}
		);
		expect(markdown).not.toContain('source_coordinate_crs');
	});

	it('rejects malformed or unsupported GeoJSON before any writer path runs', () => {
		expect(() => prepareHistoricalControlLayerImport({
			label: 'Bad',
			sourceCRS: 'wgs84',
			rawGeoJson: '{"type":"FeatureCollection","features":'
		})).toThrow(/Invalid GeoJSON JSON/i);

		expect(() => prepareHistoricalControlLayerImport({
			label: 'Unsupported',
			sourceCRS: 'wgs84',
			rawGeoJson: JSON.stringify({
				type: 'FeatureCollection',
				features: [{
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'CircularString',
						coordinates: [[108, 34], [109, 35]]
					}
				}]
			})
		})).toThrow(/supported geometry types/i);
	});
});
