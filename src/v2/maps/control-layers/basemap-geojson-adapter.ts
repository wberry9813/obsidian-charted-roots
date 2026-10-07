import type { GeographicBasemapCoordinateAdapter } from '../basemaps';
import type {
	ControlLayerGeometry,
	ControlLayerPosition,
	HistoricalControlFeature
} from './types';

function projectPosition(
	position: ControlLayerPosition,
	adapter: GeographicBasemapCoordinateAdapter
): ControlLayerPosition {
	const projected = adapter.toBasemap({
		longitude: position[0],
		latitude: position[1]
	});
	return [
		projected.longitude,
		projected.latitude,
		...position.slice(2)
	];
}

function projectGeometry(
	geometry: ControlLayerGeometry,
	adapter: GeographicBasemapCoordinateAdapter
): ControlLayerGeometry {
	switch (geometry.type) {
		case 'Point':
			return {
				type: 'Point',
				coordinates: projectPosition(geometry.coordinates, adapter)
			};
		case 'MultiPoint':
		case 'LineString':
			return {
				type: geometry.type,
				coordinates: geometry.coordinates.map(position =>
					projectPosition(position, adapter)
				)
			};
		case 'MultiLineString':
		case 'Polygon':
			return {
				type: geometry.type,
				coordinates: geometry.coordinates.map(line =>
					line.map(position => projectPosition(position, adapter))
				)
			};
		case 'MultiPolygon':
			return {
				type: 'MultiPolygon',
				coordinates: geometry.coordinates.map(polygon =>
					polygon.map(line =>
						line.map(position => projectPosition(position, adapter))
					)
				)
			};
		case 'GeometryCollection':
			return {
				type: 'GeometryCollection',
				geometries: geometry.geometries.map(child =>
					projectGeometry(child, adapter)
				)
			};
	}
}

/**
 * Project one canonical WGS84 feature into the geographic datum expected by
 * the active basemap. Caller-owned canonical GeoJSON is never mutated.
 */
export function projectCanonicalControlFeatureToBasemap(
	feature: HistoricalControlFeature,
	adapter: GeographicBasemapCoordinateAdapter
): HistoricalControlFeature {
	return {
		...feature,
		properties: { ...feature.properties },
		geometry: feature.geometry
			? projectGeometry(feature.geometry, adapter)
			: null
	};
}
