import type {
	HistoricalGazetteerProviderDefinition,
	HistoricalMapSceneDefinition
} from './types';

export const WORKSPACE_GAZETTEER_PROVIDER: HistoricalGazetteerProviderDefinition = {
	id: 'workspace',
	label: 'Active Workspace',
	mode: 'workspace',
	coverage: 'workspace',
	supportsTemporalQuery: true,
	requiresNetwork: false,
	requiresLocalData: false,
	description: 'Places, historical designations and temporal state from the Active Workspace.'
};

export const OPENHISTORICALMAP_GAZETTEER_PROVIDER: HistoricalGazetteerProviderDefinition = {
	id: 'openhistoricalmap',
	label: 'OpenHistoricalMap',
	mode: 'network',
	coverage: 'global',
	supportsTemporalQuery: true,
	requiresNetwork: true,
	requiresLocalData: false,
	description: 'Optional global live historical features. Coverage is community-dependent.'
};

export const CHGIS_LOCAL_GAZETTEER_PROVIDER: HistoricalGazetteerProviderDefinition = {
	id: 'chgis-local',
	label: 'CHGIS local pack',
	mode: 'local_pack',
	coverage: 'china',
	supportsTemporalQuery: true,
	requiresNetwork: false,
	requiresLocalData: true,
	description: 'Optional user-supplied China Historical GIS dataset. Dataset contents are not bundled.'
};

export const BUILT_IN_HISTORICAL_GAZETTEER_PROVIDERS: readonly HistoricalGazetteerProviderDefinition[] = [
	WORKSPACE_GAZETTEER_PROVIDER,
	OPENHISTORICALMAP_GAZETTEER_PROVIDER,
	CHGIS_LOCAL_GAZETTEER_PROVIDER
];

export const MODERN_REFERENCE_SCENE: HistoricalMapSceneDefinition = {
	id: 'modern-reference',
	label: 'Modern reference',
	description: 'OSM reference map plus Active Workspace research layers.',
	basemapId: 'openstreetmap-standard',
	gazetteerProviderIds: ['workspace'],
	includeWorkspaceControlLayers: true,
	includeWorkspacePlaces: true,
	labelDensity: 'balanced'
};

export const HISTORICAL_TERRAIN_SCENE: HistoricalMapSceneDefinition = {
	id: 'historical-terrain',
	label: 'Historical terrain',
	description: 'Topographic terrain plus Active Workspace historical layers.',
	basemapId: 'opentopomap-terrain',
	gazetteerProviderIds: ['workspace'],
	includeWorkspaceControlLayers: true,
	includeWorkspacePlaces: true,
	labelDensity: 'dense'
};

export const BUILT_IN_HISTORICAL_MAP_SCENES: readonly HistoricalMapSceneDefinition[] = [
	MODERN_REFERENCE_SCENE,
	HISTORICAL_TERRAIN_SCENE
];
