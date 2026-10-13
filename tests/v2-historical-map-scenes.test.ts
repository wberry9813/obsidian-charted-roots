import { describe, expect, it } from 'vitest';
import {
	GeographicBasemapRegistry,
	HistoricalGazetteerProviderRegistry,
	HistoricalMapSceneRegistry,
	HISTORICAL_TERRAIN_SCENE,
	MODERN_REFERENCE_SCENE,
	OPENTOPOMAP_TERRAIN_BASEMAP
} from '../src/v2';

describe('Historical Map Scene foundation', () => {
	it('registers OpenTopoMap as an optional terrain basemap', () => {
		const basemaps = new GeographicBasemapRegistry();
		expect(basemaps.get('opentopomap-terrain')).toEqual(
			OPENTOPOMAP_TERRAIN_BASEMAP
		);
		expect(basemaps.resolve().id).toBe('openstreetmap-standard');
	});

	it('registers workspace, OHM and CHGIS provider metadata without claiming availability', () => {
		const registry = new HistoricalGazetteerProviderRegistry();
		expect(registry.get('workspace')).toMatchObject({
			mode: 'workspace',
			requiresNetwork: false,
			requiresLocalData: false
		});
		expect(registry.get('openhistoricalmap')).toMatchObject({
			mode: 'network',
			coverage: 'global',
			requiresNetwork: true
		});
		expect(registry.get('chgis-local')).toMatchObject({
			mode: 'local_pack',
			coverage: 'china',
			requiresLocalData: true
		});
	});

	it('builds modern-reference and historical-terrain scenes over registered basemaps', () => {
		const scenes = new HistoricalMapSceneRegistry(
			new GeographicBasemapRegistry()
		);
		expect(scenes.get('modern-reference')).toEqual(MODERN_REFERENCE_SCENE);
		expect(scenes.get('historical-terrain')).toEqual(
			HISTORICAL_TERRAIN_SCENE
		);
		expect(scenes.get('historical-terrain')).toMatchObject({
			basemapId: 'opentopomap-terrain',
			gazetteerProviderIds: ['workspace'],
			includeWorkspaceControlLayers: true,
			labelDensity: 'dense'
		});
	});

	it('rejects scenes that reference an unknown gazetteer provider', () => {
		const basemaps = new GeographicBasemapRegistry();
		const gazetteers = new HistoricalGazetteerProviderRegistry();
		expect(() => new HistoricalMapSceneRegistry(
			basemaps,
			gazetteers,
			[{
				id: 'broken-scene',
				label: 'Broken scene',
				basemapId: 'openstreetmap-standard',
				gazetteerProviderIds: ['missing-provider'],
				includeWorkspaceControlLayers: true,
				includeWorkspacePlaces: true,
				labelDensity: 'balanced'
			}]
		)).toThrow(/Unknown gazetteer provider ID/);
	});
});
