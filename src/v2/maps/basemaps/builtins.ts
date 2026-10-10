import type { GeographicBasemapDefinition } from './types';

/**
 * Keyless OpenStreetMap Standard raster tiles.
 *
 * This is the built-in Real world provider because it works without requiring
 * users to create or store a third-party API key. Place coordinates remain
 * canonical WGS84 and Leaflet renders the XYZ/WebMercator tile grid.
 */
export const OPENSTREETMAP_STANDARD_BASEMAP: GeographicBasemapDefinition = {
	id: 'openstreetmap-standard',
	label: 'OpenStreetMap Standard',
	coordinateCRS: 'wgs84',
	tileScheme: 'xyz-web-mercator',
	tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
	attribution:
		'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
	maxZoom: 19,
	miniMapMaxZoom: 13
};

/**
 * Optional terrain-oriented reference basemap.
 *
 * OpenTopoMap combines OSM data with SRTM-derived topographic rendering. It is
 * intentionally not the default Real world provider; Historical Map Scenes can
 * select it when physical geography is more useful than a modern street map.
 */
export const OPENTOPOMAP_TERRAIN_BASEMAP: GeographicBasemapDefinition = {
	id: 'opentopomap-terrain',
	label: 'OpenTopoMap Terrain',
	coordinateCRS: 'wgs84',
	tileScheme: 'xyz-web-mercator',
	tileUrl: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
	attribution:
		'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap (CC-BY-SA)',
	maxZoom: 17,
	miniMapMaxZoom: 13
};

/**
 * Legacy CARTO Voyager definition retained as a source-level compatibility
 * export only. CARTO's former unauthenticated raster endpoint now returns
 * "API KEY REQUIRED", so this definition is intentionally NOT registered as
 * a built-in provider. Saved legacy IDs therefore fall back to OSM.
 */
export const CARTO_VOYAGER_BASEMAP: GeographicBasemapDefinition = {
	id: 'carto-voyager',
	label: 'CARTO Voyager (legacy)',
	coordinateCRS: 'wgs84',
	tileScheme: 'xyz-web-mercator',
	tileUrl:
		'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
	attribution:
		'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
	maxZoom: 19,
	miniMapMaxZoom: 13,
	noReferrer: true
};

export const DEFAULT_GEOGRAPHIC_BASEMAP = OPENSTREETMAP_STANDARD_BASEMAP;

export const BUILT_IN_GEOGRAPHIC_BASEMAPS: readonly GeographicBasemapDefinition[] = [
	OPENSTREETMAP_STANDARD_BASEMAP,
	OPENTOPOMAP_TERRAIN_BASEMAP
];

export function getBuiltInGeographicBasemap(
	id: string
): GeographicBasemapDefinition | undefined {
	return BUILT_IN_GEOGRAPHIC_BASEMAPS.find(definition => definition.id === id);
}
