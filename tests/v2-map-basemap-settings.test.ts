import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_SETTINGS } from '../src/maps/types/map-types';

describe('M6 MapSettings basemap defaults', () => {
	it('uses keyless OpenStreetMap Standard as the default', () => {
		expect(DEFAULT_MAP_SETTINGS.geographicBasemapId)
			.toBe('openstreetmap-standard');
		expect(DEFAULT_MAP_SETTINGS.customGeographicBasemaps).toEqual([]);
		expect(DEFAULT_MAP_SETTINGS.tileProvider).toBe('openstreetmap');
	});
});
