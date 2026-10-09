import type { GeographicCRS } from '../coordinates';

/**
 * Geographic datum expected by a raster basemap.
 *
 * This is deliberately distinct from Leaflet's map projection. A provider may
 * still use the ordinary WebMercator tile grid while its imagery is aligned
 * to GCJ-02 or BD-09 geographic coordinates.
 */
export type GeographicTileScheme = 'xyz-web-mercator';

export interface GeographicBasemapDefinition {
	id: string;
	label: string;
	coordinateCRS: GeographicCRS;
	/**
	 * Tile matrix/projection contract. M6 currently supports ordinary XYZ
	 * WebMercator only. WMTS/EPSG:4490 requires a dedicated adapter.
	 */
	tileScheme: GeographicTileScheme;
	tileUrl: string;
	attribution: string;
	maxZoom: number;
	miniMapMaxZoom?: number;
	/**
	 * Obsidian/Electron may send an app:// referrer that public tile servers
	 * reject. Keep this explicit per provider instead of baking it into all
	 * tile layers.
	 */
	noReferrer?: boolean;
}
