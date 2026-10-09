import type {
	CanonicalCoordinateService,
	GeographicCoordinate
} from '../coordinates';
import type { GeographicBasemapDefinition } from './types';

/**
 * Converts between canonical vault WGS84 and the geographic datum expected by
 * the active raster basemap.
 *
 * Leaflet projection is intentionally out of scope here. The adapter only
 * changes geographic longitude/latitude datum alignment.
 */
export class GeographicBasemapCoordinateAdapter {
	constructor(
		private readonly coordinateService: CanonicalCoordinateService,
		private basemap: GeographicBasemapDefinition
	) {}

	setBasemap(basemap: GeographicBasemapDefinition): void {
		this.basemap = basemap;
	}

	getBasemap(): GeographicBasemapDefinition {
		return { ...this.basemap };
	}

	toBasemap(
		canonicalWgs84: GeographicCoordinate
	): GeographicCoordinate {
		return this.coordinateService.fromCanonical(
			canonicalWgs84,
			this.basemap.coordinateCRS
		);
	}

	toCanonical(
		basemapCoordinate: GeographicCoordinate
	): GeographicCoordinate {
		return this.coordinateService.toCanonical(
			basemapCoordinate,
			this.basemap.coordinateCRS
		);
	}

	toLeafletLatLng(
		canonicalWgs84: GeographicCoordinate
	): { lat: number; lng: number } {
		const display = this.toBasemap(canonicalWgs84);
		return {
			lat: display.latitude,
			lng: display.longitude
		};
	}

	fromLeafletLatLng(
		display: { lat: number; lng: number }
	): GeographicCoordinate {
		return this.toCanonical({
			longitude: display.lng,
			latitude: display.lat
		});
	}
}
