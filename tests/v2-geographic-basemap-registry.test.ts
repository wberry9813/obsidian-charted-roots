import { describe, expect, it } from 'vitest';
import {
	buildGeographicBasemapRegistry,
	CARTO_VOYAGER_BASEMAP,
	materializeCustomGeographicBasemap,
	validateGeographicBasemapDefinition,
	type GeographicBasemapDefinition
} from '../src/v2';

describe('M6 geographic basemap registry', () => {
	it('starts with the stable built-in Real world basemap', () => {
		const { registry, issues } = buildGeographicBasemapRegistry();
		expect(issues).toEqual([]);
		expect(registry.resolve().id).toBe(CARTO_VOYAGER_BASEMAP.id);
		expect(registry.list().map(item => item.id)).toEqual(['carto-voyager']);
	});

	it('registers a user XYZ provider with explicit datum metadata', () => {
		const { registry, issues } = buildGeographicBasemapRegistry([{
			id: 'example-gcj',
			label: 'Example GCJ',
			coordinateCRS: 'gcj02',
			tileUrl: 'https://tiles.example.invalid/{z}/{x}/{y}.png',
			attribution: 'Example',
			maxZoom: 18
		}]);

		expect(issues).toEqual([]);
		expect(registry.resolve('example-gcj')).toMatchObject({
			id: 'example-gcj',
			coordinateCRS: 'gcj02',
			tileScheme: 'xyz-web-mercator',
			maxZoom: 18
		});
	});

	it('rejects duplicate IDs without replacing the built-in provider', () => {
		const { registry, issues } = buildGeographicBasemapRegistry([{
			id: 'carto-voyager',
			label: 'Collision',
			coordinateCRS: 'gcj02',
			tileUrl: 'https://tiles.example.invalid/{z}/{x}/{y}.png'
		}]);

		expect(issues.map(issue => issue.code)).toContain('duplicate_id');
		expect(registry.resolve('carto-voyager').coordinateCRS).toBe('wgs84');
	});

	it('rejects URLs that are not ordinary XYZ templates', () => {
		const definition = materializeCustomGeographicBasemap({
			id: 'wmts-like',
			label: 'WMTS-like',
			coordinateCRS: 'wgs84',
			tileUrl: 'https://example.invalid/wmts?TileMatrix={z}&TileRow={y}'
		});

		expect(
			validateGeographicBasemapDefinition(definition).map(issue => issue.code)
		).toContain('invalid_tile_url');
	});

	it('reports unsupported runtime coordinate CRS separately from tile scheme', () => {
		const definition = {
			...CARTO_VOYAGER_BASEMAP,
			id: 'bad-crs',
			coordinateCRS: 'cgcs2000'
		} as unknown as GeographicBasemapDefinition;

		expect(
			validateGeographicBasemapDefinition(definition).map(issue => issue.code)
		).toContain('unsupported_coordinate_crs');
	});

	it('does not echo provider URL secrets in validation issues', () => {
		const secret = 'super-secret-token';
		const { issues } = buildGeographicBasemapRegistry([{
			id: 'broken-secret-provider',
			label: 'Broken secret provider',
			coordinateCRS: 'wgs84',
			tileUrl: `https://tiles.example.invalid/static.png?key=${secret}`
		}]);

		expect(issues.map(issue => issue.code)).toContain('invalid_tile_url');
		expect(JSON.stringify(issues)).not.toContain(secret);
	});

	it('falls back to the built-in provider for unknown saved IDs', () => {
		const { registry } = buildGeographicBasemapRegistry();
		expect(registry.resolve('removed-provider').id)
			.toBe(CARTO_VOYAGER_BASEMAP.id);
	});
});
