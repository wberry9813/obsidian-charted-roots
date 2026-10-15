import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_GEOGRAPHIC_BASEMAPS,
	CARTO_VOYAGER_BASEMAP,
	DEFAULT_GEOGRAPHIC_BASEMAP,
	OPENSTREETMAP_STANDARD_BASEMAP,
	OPENTOPOMAP_TERRAIN_BASEMAP,
	getBuiltInGeographicBasemap
} from '../src/v2';

describe('M6 geographic basemap definitions', () => {
	it('uses keyless OpenStreetMap Standard as the Real world default', () => {
		expect(OPENSTREETMAP_STANDARD_BASEMAP.id).toBe('openstreetmap-standard');
		expect(OPENSTREETMAP_STANDARD_BASEMAP.coordinateCRS).toBe('wgs84');
		expect(OPENSTREETMAP_STANDARD_BASEMAP.tileScheme).toBe('xyz-web-mercator');
		expect(OPENSTREETMAP_STANDARD_BASEMAP.tileUrl)
			.toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
		expect(OPENSTREETMAP_STANDARD_BASEMAP.maxZoom).toBe(19);
		expect(OPENSTREETMAP_STANDARD_BASEMAP.miniMapMaxZoom).toBe(13);
		expect(DEFAULT_GEOGRAPHIC_BASEMAP).toBe(OPENSTREETMAP_STANDARD_BASEMAP);
	});

	it('keeps the old CARTO definition only as a compatibility export', () => {
		expect(CARTO_VOYAGER_BASEMAP.id).toBe('carto-voyager');
		expect(CARTO_VOYAGER_BASEMAP.tileUrl).toContain('cartocdn.com');
		expect(getBuiltInGeographicBasemap('carto-voyager')).toBeUndefined();
	});

	it('registers keyless OSM and optional terrain providers', () => {
		expect(BUILT_IN_GEOGRAPHIC_BASEMAPS.map(item => item.id))
			.toEqual(['openstreetmap-standard', 'opentopomap-terrain']);
		expect(getBuiltInGeographicBasemap('openstreetmap-standard'))
			.toBe(OPENSTREETMAP_STANDARD_BASEMAP);
		expect(getBuiltInGeographicBasemap('opentopomap-terrain'))
			.toBe(OPENTOPOMAP_TERRAIN_BASEMAP);
		expect(getBuiltInGeographicBasemap('missing')).toBeUndefined();
		expect(
			BUILT_IN_GEOGRAPHIC_BASEMAPS.every(item => item.coordinateCRS === 'wgs84')
		).toBe(true);
	});
});
