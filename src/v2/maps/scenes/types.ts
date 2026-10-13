export type HistoricalGazetteerProviderMode =
	| 'workspace'
	| 'network'
	| 'local_pack';

export type HistoricalGazetteerCoverage =
	| 'workspace'
	| 'global'
	| 'china';

export interface HistoricalGazetteerProviderDefinition {
	id: string;
	label: string;
	mode: HistoricalGazetteerProviderMode;
	coverage: HistoricalGazetteerCoverage;
	supportsTemporalQuery: boolean;
	requiresNetwork: boolean;
	requiresLocalData: boolean;
	description?: string;
}

export type HistoricalMapLabelDensity = 'sparse' | 'balanced' | 'dense';

export interface HistoricalMapSceneDefinition {
	id: string;
	label: string;
	description?: string;
	basemapId: string;
	gazetteerProviderIds: string[];
	includeWorkspaceControlLayers: boolean;
	includeWorkspacePlaces: boolean;
	labelDensity: HistoricalMapLabelDensity;
}

export interface HistoricalMapSceneRegistryIssue {
	sceneId: string;
	code:
		| 'invalid_id'
		| 'duplicate_id'
		| 'invalid_label'
		| 'missing_basemap_id'
		| 'unknown_gazetteer_provider';
	message: string;
}

export interface HistoricalGazetteerProviderRegistryIssue {
	providerId: string;
	code:
		| 'invalid_id'
		| 'duplicate_id'
		| 'invalid_label';
	message: string;
}
