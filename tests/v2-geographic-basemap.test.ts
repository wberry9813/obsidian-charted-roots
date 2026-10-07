import { describe, expect, it } from 'vitest';
import {
	BUILT_IN_GEOGRAPHIC_BASEMAPS,
	CARTO_VOYAGER_BASEMAP,
	DEFAULT_GEOGRAPHIC_BASEMAP,
	getBuiltInGeographicBasemap
} from '../src/v2';

describe('M6 geographic basemap definitions', () => {
	it('declares the current Real world basemap as explicit WGS84', () => {
		expect(CARTO_VOYAGER_BASEMAP.id).toBe('carto-voyager');
		expect(CARTO_VOYAGER_BASEMAP.coordinateCRS).toBe('wgs84');
		expect(CARTO_VOYAGER_BASEMAP.tileUrl).toContain('cartocdn.com');
		expect(CARTO_VOYAGER_BASEMAP.maxZoom).toBe(19);
		expect(CARTO_VOYAGER_BASEMAP.miniMapMaxZoom).toBe(13);
		expect(CARTO_VOYAGER_BASEMAP.noReferrer).toBe(true);
	});

	it('keeps Carto Voyager as the default geographic basemap', () => {
		expect(DEFAULT_GEOGRAPHIC_BASEMAP).toBe(CARTO_VOYAGER_BASEMAP);
	});

	it('resolves built-in basemaps by stable ID', () => {
		expect(getBuiltInGeographicBasemap('carto-voyager'))
			.toBe(CARTO_VOYAGER_BASEMAP);
		expect(getBuiltInGeographicBasemap('missing')).toBeUndefined();
	});

	it('does not define an untested GCJ-02 or BD-09 basemap yet', () => {
		expect(BUILT_IN_GEOGRAPHIC_BASEMAPS).toHaveLength(1);
		expect(
			BUILT_IN_GEOGRAPHIC_BASEMAPS.every(item => item.coordinateCRS === 'wgs84')
		).toBe(true);
	});
});
