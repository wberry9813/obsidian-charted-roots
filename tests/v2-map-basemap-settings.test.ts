import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS } from '../src/maps/types/map-types';

describe('M6 MapSettings basemap defaults', () => {
	it('keeps the existing Carto Real-world provider as the default', () => {
		expect(DEFAULT_MAP_SETTINGS.geographicBasemapId).toBe('carto-voyager');
		expect(DEFAULT_MAP_SETTINGS.customGeographicBasemaps).toEqual([]);
		expect(DEFAULT_MAP_SETTINGS.tileProvider).toBe('openstreetmap');
	});
});
