import type { GeographicBasemapDefinition } from './types';

/**
 * Existing Charted Roots "Real world" basemap.
 *
 * CARTO Voyager uses the standard WebMercator tile grid and is aligned to
 * ordinary WGS84 geographic coordinates as consumed by Leaflet markers.
 */
export const CARTO_VOYAGER_BASEMAP: GeographicBasemapDefinition = {
	id: 'carto-voyager',
	label: 'Real world',
	coordinateCRS: 'wgs84',
	tileUrl:
		'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
	attribution:
		'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	maxZoom: 19,
	miniMapMaxZoom: 13,
	noReferrer: true
};

export const DEFAULT_GEOGRAPHIC_BASEMAP = CARTO_VOYAGER_BASEMAP;

export const BUILT_IN_GEOGRAPHIC_BASEMAPS: readonly GeographicBasemapDefinition[] = [
	CARTO_VOYAGER_BASEMAP
];

export function getBuiltInGeographicBasemap(
	id: string
): GeographicBasemapDefinition | undefined {
	return BUILT_IN_GEOGRAPHIC_BASEMAPS.find(definition => definition.id === id);
}
