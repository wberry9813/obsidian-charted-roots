import { describe, expect, it } from 'vitest';
import {
	CanonicalCoordinateService,
	GeographicBasemapCoordinateAdapter,
	GcoordCoordinateTransformProvider,
	type GeographicBasemapDefinition
} from '../src/v2';

const WGS_BASEMAP: GeographicBasemapDefinition = {
	id: 'test-wgs',
	label: 'WGS test',
	coordinateCRS: 'wgs84',
	tileUrl: 'https://example.invalid/{z}/{x}/{y}.png',
	attribution: '',
	maxZoom: 19
};

const GCJ_BASEMAP: GeographicBasemapDefinition = {
	...WGS_BASEMAP,
	id: 'test-gcj',
	label: 'GCJ test',
	coordinateCRS: 'gcj02'
};

function adapter(
	basemap: GeographicBasemapDefinition
): GeographicBasemapCoordinateAdapter {
	return new GeographicBasemapCoordinateAdapter(
		new CanonicalCoordinateService(
			new GcoordCoordinateTransformProvider()
		),
		basemap
	);
}

describe('M6 basemap coordinate adapter', () => {
	it('is identity-preserving for the current WGS84 basemap', () => {
		const input = {
			longitude: 113.6192856,
			latitude: 34.7478004
		};
		expect(adapter(WGS_BASEMAP).toBasemap(input)).toEqual(input);
		expect(adapter(WGS_BASEMAP).toLeafletLatLng(input)).toEqual({
			lat: input.latitude,
			lng: input.longitude
		});
	});

	it('converts canonical WGS84 into the basemap geographic datum', () => {
		const result = adapter(GCJ_BASEMAP).toBasemap({
			longitude: 113.6192856,
			latitude: 34.7478004
		});

		expect(Math.abs(result.longitude - 113.6253334)).toBeLessThanOrEqual(1e-5);
		expect(Math.abs(result.latitude - 34.7466173)).toBeLessThanOrEqual(1e-5);
	});

	it('converts Leaflet display coordinates back to canonical WGS84', () => {
		const result = adapter(GCJ_BASEMAP).fromLeafletLatLng({
			lat: 34.7466173,
			lng: 113.6253334
		});

		expect(Math.abs(result.longitude - 113.6192856)).toBeLessThanOrEqual(1e-5);
		expect(Math.abs(result.latitude - 34.7478004)).toBeLessThanOrEqual(1e-5);
	});

	it('can change basemap datum without changing canonical input', () => {
		const subject = adapter(WGS_BASEMAP);
		const input = {
			longitude: 113.6192856,
			latitude: 34.7478004
		};

		expect(subject.toBasemap(input)).toEqual(input);
		subject.setBasemap(GCJ_BASEMAP);
		const shifted = subject.toBasemap(input);

		expect(shifted).not.toEqual(input);
		expect(input).toEqual({
			longitude: 113.6192856,
			latitude: 34.7478004
		});
	});
});
