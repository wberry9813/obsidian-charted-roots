import type { TFile } from 'obsidian';

export type HistoricalFamilyChartTemporalState =
	| 'all_time'
	| 'active'
	| 'possible';

export interface HistoricalFamilyChartPersonRef {
	crId: string;
	name: string;
	filePath: string;
	file: TFile;
}

export interface HistoricalFamilyChartEdge {
	id: string;
	subject: HistoricalFamilyChartPersonRef;
	object: HistoricalFamilyChartPersonRef;
	predicate: string;
	label: string;
	directed: boolean;
	symmetric: boolean;
	temporalState: HistoricalFamilyChartTemporalState;
	timeStart?: string;
	timeEnd?: string;
	confidence?: string;
	researchStatus?: string;
	qualifiers?: Record<string, string | number | boolean>;
	sourceFilePath: string;
}

export interface HistoricalFamilyChartProjection {
	edges: HistoricalFamilyChartEdge[];
	focusApplied: boolean;
	focusIgnoredReason?:
		| 'unsupported_axis'
		| 'temporal_state_unavailable';
	skipped: {
		nonRelationship: number;
		nonPersonEndpoint: number;
		structuralFamilyPredicate: number;
		outsideTemporalFocus: number;
		undatedAtFocus: number;
		symmetricDuplicate: number;
	};
}
