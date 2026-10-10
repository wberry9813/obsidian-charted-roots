import type { TemporalCertainty, TemporalFields } from '../../types';

export type HistoricalRasterLayerRole = 'terrain' | 'historical' | 'reference';
export type HistoricalRasterLayerTemporalState = 'active' | 'possible';

export interface HistoricalRasterLayerDefinition extends TemporalFields {
	id: string;
	label: string;
	tileUrl: string;
	coordinateCRS: 'wgs84';
	role: HistoricalRasterLayerRole;
	opacity: number;
	zIndex: number;
	minZoom: number;
	maxZoom: number;
	attribution: string;
	noReferrer?: boolean;
	enabled: boolean;
	universe?: string;
	source?: string | string[];
	confidence?: string;
	uncertainty?: TemporalCertainty;
}

export interface HistoricalRasterVisibleLayer {
	layer: HistoricalRasterLayerDefinition;
	state: HistoricalRasterLayerTemporalState;
}

export interface HistoricalRasterLayerStateSnapshot {
	active: HistoricalRasterVisibleLayer[];
	possible: HistoricalRasterVisibleLayer[];
}
