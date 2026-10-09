import type {
	TemporalCertainty,
	TemporalFields
} from '../../types';
import type { GeographicCRS } from '../coordinates';

export type ControlLayerPosition = [
	longitude: number,
	latitude: number,
	...extra: number[]
];

export interface ControlLayerPointGeometry {
	type: 'Point';
	coordinates: ControlLayerPosition;
}

export interface ControlLayerMultiPointGeometry {
	type: 'MultiPoint';
	coordinates: ControlLayerPosition[];
}

export interface ControlLayerLineStringGeometry {
	type: 'LineString';
	coordinates: ControlLayerPosition[];
}

export interface ControlLayerMultiLineStringGeometry {
	type: 'MultiLineString';
	coordinates: ControlLayerPosition[][];
}

export interface ControlLayerPolygonGeometry {
	type: 'Polygon';
	coordinates: ControlLayerPosition[][];
}

export interface ControlLayerMultiPolygonGeometry {
	type: 'MultiPolygon';
	coordinates: ControlLayerPosition[][][];
}

export interface ControlLayerGeometryCollection {
	type: 'GeometryCollection';
	geometries: ControlLayerGeometry[];
}

export type ControlLayerGeometry =
	| ControlLayerPointGeometry
	| ControlLayerMultiPointGeometry
	| ControlLayerLineStringGeometry
	| ControlLayerMultiLineStringGeometry
	| ControlLayerPolygonGeometry
	| ControlLayerMultiPolygonGeometry
	| ControlLayerGeometryCollection;

export interface HistoricalControlFeatureProperties extends Record<string, unknown> {
	name?: string;
	time_start?: string;
	time_end?: string;
	time_not_before?: string;
	time_not_after?: string;
	source?: string | string[];
	confidence?: string;
	uncertainty?: TemporalCertainty;
}

export interface HistoricalControlFeature<
	P extends HistoricalControlFeatureProperties = HistoricalControlFeatureProperties
> {
	type: 'Feature';
	id?: string | number;
	geometry: ControlLayerGeometry | null;
	properties: P;
}

export interface HistoricalControlFeatureCollection<
	P extends HistoricalControlFeatureProperties = HistoricalControlFeatureProperties
> {
	type: 'FeatureCollection';
	features: HistoricalControlFeature<P>[];
}

/**
 * Runtime/import contract for a geographic historical control layer.
 *
 * coordinateCRS describes only the incoming geometry datum. Canonical layers
 * are normalized to WGS84 before being cached, filtered or rendered.
 */
export interface HistoricalControlLayerDefinition extends TemporalFields {
	id: string;
	label: string;
	coordinateCRS: GeographicCRS;
	featureCollection: HistoricalControlFeatureCollection;
	universe?: string;
	source?: string | string[];
	confidence?: string;
	uncertainty?: TemporalCertainty;
}

export interface CanonicalHistoricalControlLayer
extends Omit<HistoricalControlLayerDefinition, 'coordinateCRS'> {
	coordinateCRS: 'wgs84';
}
