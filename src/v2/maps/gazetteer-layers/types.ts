import type {
	TemporalCertainty,
	TemporalFields
} from '../../types';
import type { GeographicCRS } from '../coordinates';

export type GazetteerSettlementType =
	| 'capital'
	| 'prefecture'
	| 'commandery'
	| 'county'
	| 'city'
	| 'settlement'
	| 'fort'
	| 'pass'
	| 'port'
	| 'other';

export interface HistoricalGazetteerFeatureProperties
extends TemporalFields, Record<string, unknown> {
	name: string;
	aliases?: string[];
	settlement_type?: GazetteerSettlementType | string;
	importance?: number;
	modern_name?: string;
	source?: string | string[];
	confidence?: string;
	uncertainty?: TemporalCertainty;
}

export interface HistoricalGazetteerFeature {
	type: 'Feature';
	id?: string | number;
	geometry: {
		type: 'Point';
		coordinates: [longitude: number, latitude: number];
	};
	properties: HistoricalGazetteerFeatureProperties;
}

export interface HistoricalGazetteerFeatureCollection {
	type: 'FeatureCollection';
	features: HistoricalGazetteerFeature[];
}

export interface HistoricalGazetteerLayerDefinition extends TemporalFields {
	id: string;
	label: string;
	coordinateCRS: GeographicCRS;
	featureCollection: HistoricalGazetteerFeatureCollection;
	universe?: string;
	source?: string | string[];
	confidence?: string;
	uncertainty?: TemporalCertainty;
}

export interface CanonicalHistoricalGazetteerLayer
extends Omit<HistoricalGazetteerLayerDefinition, 'coordinateCRS'> {
	coordinateCRS: 'wgs84';
}

export type HistoricalGazetteerTemporalState = 'active' | 'possible';

export interface HistoricalGazetteerVisibleFeature {
	layerId: string;
	layerLabel: string;
	layerUniverse?: string;
	state: HistoricalGazetteerTemporalState;
	feature: HistoricalGazetteerFeature;
	layer: CanonicalHistoricalGazetteerLayer;
}

export interface HistoricalGazetteerStateSnapshot {
	active: HistoricalGazetteerVisibleFeature[];
	possible: HistoricalGazetteerVisibleFeature[];
}
