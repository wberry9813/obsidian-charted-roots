import type { CanonicalCoordinateService } from '../coordinates';
import type {
	CanonicalHistoricalControlLayer,
	ControlLayerGeometry,
	ControlLayerPosition,
	HistoricalControlFeatureCollection,
	HistoricalControlLayerDefinition
} from './types';

function transformPosition(
	position: ControlLayerPosition,
	from: HistoricalControlLayerDefinition['coordinateCRS'],
	coordinates: CanonicalCoordinateService
): ControlLayerPosition {
	const transformed = coordinates.toCanonical(
		{
			longitude: position[0],
			latitude: position[1]
		},
		from
	);
	return [
		transformed.longitude,
		transformed.latitude,
		...position.slice(2)
	];
}

function transformGeometry(
	geometry: ControlLayerGeometry,
	from: HistoricalControlLayerDefinition['coordinateCRS'],
	coordinates: CanonicalCoordinateService
): ControlLayerGeometry {
	switch (geometry.type) {
		case 'Point':
			return {
				type: 'Point',
				coordinates: transformPosition(
					geometry.coordinates,
					from,
					coordinates
				)
			};
		case 'MultiPoint':
		case 'LineString':
			return {
				type: geometry.type,
				coordinates: geometry.coordinates.map(position =>
					transformPosition(position, from, coordinates)
				)
			};
		case 'MultiLineString':
		case 'Polygon':
			return {
				type: geometry.type,
				coordinates: geometry.coordinates.map(line =>
					line.map(position =>
						transformPosition(position, from, coordinates)
					)
				)
			};
		case 'MultiPolygon':
			return {
				type: 'MultiPolygon',
				coordinates: geometry.coordinates.map(polygon =>
					polygon.map(line =>
						line.map(position =>
							transformPosition(position, from, coordinates)
						)
					)
				)
			};
		case 'GeometryCollection':
			return {
				type: 'GeometryCollection',
				geometries: geometry.geometries.map(child =>
					transformGeometry(child, from, coordinates)
				)
			};
	}
}

function canonicalizeCollection(
	collection: HistoricalControlFeatureCollection,
	from: HistoricalControlLayerDefinition['coordinateCRS'],
	coordinates: CanonicalCoordinateService
): HistoricalControlFeatureCollection {
	return {
		type: 'FeatureCollection',
		features: collection.features.map(feature => ({
			...feature,
			properties: { ...feature.properties },
			geometry: feature.geometry
				? transformGeometry(feature.geometry, from, coordinates)
				: null
		}))
	};
}

/**
 * Normalize imported geographic control-layer geometry to canonical WGS84.
 *
 * This is an import/storage boundary only. Rendering against a GCJ-02/BD-09
 * basemap is a separate display adapter, just like ordinary Place markers.
 */
export function canonicalizeHistoricalControlLayer(
	layer: HistoricalControlLayerDefinition,
	coordinates: CanonicalCoordinateService
): CanonicalHistoricalControlLayer {
	return {
		...layer,
		coordinateCRS: 'wgs84',
		featureCollection: canonicalizeCollection(
			layer.featureCollection,
			layer.coordinateCRS,
			coordinates
		)
	};
}
