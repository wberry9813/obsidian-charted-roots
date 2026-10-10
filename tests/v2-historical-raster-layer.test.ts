import { describe, expect, it } from 'vitest';
import { ALL_NOTE_TYPES } from '../src/utils/note-type-detection';
import {
	HistoricalDateService,
	HistoricalRasterLayerRepository,
	HistoricalRasterLayerStateService
} from '../src/v2';

function mockApp(manifests: Array<{ path: string; frontmatter: Record<string, unknown> }>) {
	const files = manifests.map(item => ({
		path: item.path,
		basename: item.path.split('/').pop()?.replace(/\.md$/, '') ?? item.path,
		extension: 'md'
	}));
	const frontmatter = new Map(manifests.map(item => [item.path, item.frontmatter]));
	return {
		app: {
			vault: { getMarkdownFiles: () => files },
			metadataCache: {
				getFileCache: (file: { path: string }) => ({ frontmatter: frontmatter.get(file.path) })
			}
		} as never,
		files: files as never
	};
}

describe('historical raster-layer storage', () => {
	it('recognizes raster_layer as a Charted Roots note type', () => {
		expect(ALL_NOTE_TYPES).toContain('raster_layer');
	});

	it('loads Workspace-scoped WMTS/XYZ templates with role defaults', async () => {
		const fixture = mockApp([
			{
				path: 'History/Layers/Terrain.md',
				frontmatter: {
					cr_type: 'raster_layer',
					cr_id: 'terrain',
					name: 'Terrain',
					role: 'terrain',
					tile_url: 'https://tiles.example/{z}/{x}/{y}.png'
				}
			},
			{
				path: 'History/Layers/Han.md',
				frontmatter: {
					cr_type: 'raster_layer',
					cr_id: 'han-map',
					name: 'Han historical map',
					tile_url: 'https://example.test/wmts?SERVICE=WMTS&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}',
					time_start: 'BCE 202',
					time_end: '220 CE',
					opacity: 0.64,
					z_index: 240,
					attribution: 'Academic source'
				}
			},
			{
				path: 'Fiction/Layers/Other.md',
				frontmatter: {
					cr_type: 'raster_layer',
					cr_id: 'other',
					name: 'Other',
					tile_url: 'https://other.example/{z}/{x}/{y}.png'
				}
			}
		]);
		const result = await new HistoricalRasterLayerRepository(
			fixture.app,
			{ fileProvider: () => [fixture.files[0], fixture.files[1]] }
		).loadAll();
		expect(result.issues).toEqual([]);
		expect(result.layers).toHaveLength(2);
		expect(result.layers[0]).toMatchObject({
			id: 'terrain', role: 'terrain', opacity: 1, zIndex: 150, coordinateCRS: 'wgs84'
		});
		expect(result.layers[1]).toMatchObject({
			id: 'han-map', role: 'historical', opacity: 0.64, zIndex: 240,
			time_start: 'BCE 202', time_end: '220 CE', attribution: 'Academic source'
		});
	});

	it('isolates unsupported CRS, malformed URLs and invalid opacity', async () => {
		const fixture = mockApp([
			{ path: 'A.md', frontmatter: { cr_type: 'raster_layer', cr_id: 'a', name: 'A', coordinate_crs: 'gcj02', tile_url: 'https://a/{z}/{x}/{y}.png' } },
			{ path: 'B.md', frontmatter: { cr_type: 'raster_layer', cr_id: 'b', name: 'B', tile_url: 'https://b/static.png' } },
			{ path: 'C.md', frontmatter: { cr_type: 'raster_layer', cr_id: 'c', name: 'C', tile_url: 'https://c/{z}/{x}/{y}.png', opacity: 1.5 } }
		]);
		const result = await new HistoricalRasterLayerRepository(fixture.app).loadAll();
		expect(result.layers).toEqual([]);
		expect(result.issues.map(issue => issue.code).sort()).toEqual([
			'invalid_opacity', 'invalid_tile_url', 'unsupported_coordinate_crs'
		]);
	});
});

describe('historical raster-layer temporal state', () => {
	function service() {
		const dates = new HistoricalDateService();
		const calendar = dates.getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar unavailable');
		return { calendar, service: new HistoricalRasterLayerStateService(dates, calendar) };
	}

	const terrain = {
		id: 'terrain', label: 'Terrain', tileUrl: 'https://t/{z}/{x}/{y}.png',
		coordinateCRS: 'wgs84' as const, role: 'terrain' as const, opacity: 1,
		zIndex: 150, minZoom: 0, maxZoom: 19, attribution: '', enabled: true
	};
	const han = {
		id: 'han', label: 'Han', tileUrl: 'https://h/{z}/{x}/{y}.png',
		coordinateCRS: 'wgs84' as const, role: 'historical' as const, opacity: 0.7,
		zIndex: 220, minZoom: 0, maxZoom: 19, attribution: '', enabled: true,
		time_start: 'BCE 202', time_end: '220 CE'
	};

	it('keeps timeless terrain visible without focus and activates dated maps at matching dates', () => {
		const { calendar, service: state } = service();
		expect(state.getWithoutFocus([terrain, han]).active.map(x => x.layer.id)).toEqual(['terrain']);
		const point = calendar.solarToJulianDay({ year: -100, month: 1, day: 1 });
		expect(state.getAt([terrain, han], point).active.map(x => x.layer.id)).toEqual(['terrain', 'han']);
	});

	it('hides dated maps outside their span and keeps unresolved chronology possible', () => {
		const { calendar, service: state } = service();
		const unknown = { ...han, id: 'legend', time_start: 'Legendary era', time_end: undefined };
		const point = calendar.solarToJulianDay({ year: 500, month: 1, day: 1 });
		const result = state.getAt([terrain, han, unknown], point);
		expect(result.active.map(x => x.layer.id)).toEqual(['terrain']);
		expect(result.possible.map(x => x.layer.id)).toEqual(['legend']);
	});
});
