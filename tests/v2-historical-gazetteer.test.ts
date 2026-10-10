import { describe, expect, it } from 'vitest';
import { ALL_NOTE_TYPES } from '../src/utils/note-type-detection';
import {
	HistoricalDateService,
	HistoricalGazetteerRepository,
	HistoricalGazetteerStateService,
	resolveHistoricalGazetteerGeoJsonPath
} from '../src/v2';

function fixture(input: {
	manifests: Array<{ path: string; frontmatter: Record<string, unknown> }>;
	geojson: Record<string, string>;
}) {
	const manifests = input.manifests.map(item => ({
		path: item.path,
		basename: item.path.split('/').pop()?.replace(/\.md$/, '') ?? item.path,
		extension: 'md'
	}));
	const frontmatter = new Map(
		input.manifests.map(item => [item.path, item.frontmatter])
	);
	const geojson = new Map(
		Object.keys(input.geojson).map(path => [
			path,
			{ path, basename: path.split('/').pop()?.replace(/\.geojson$/, '') ?? path, extension: 'geojson' }
		])
	);
	return {
		app: {
			vault: {
				getMarkdownFiles: () => manifests,
				getAbstractFileByPath: (path: string) => geojson.get(path) ?? null,
				read: async (file: { path: string }) => input.geojson[file.path]
			},
			metadataCache: {
				getFileCache: (file: { path: string }) => ({
					frontmatter: frontmatter.get(file.path)
				})
			}
		} as never,
		files: manifests as never
	};
}

describe('historical gazetteer storage', () => {
	it('recognizes gazetteer_layer as a Charted Roots note type', () => {
		expect(ALL_NOTE_TYPES).toContain('gazetteer_layer');
	});

	it('resolves manifest-relative and vault-root GeoJSON references', () => {
		expect(resolveHistoricalGazetteerGeoJsonPath(
			'History/Gazetteers/Han.md',
			'data/han'
		)).toBe('History/Gazetteers/data/han.geojson');
		expect(resolveHistoricalGazetteerGeoJsonPath(
			'History/Gazetteers/Han.md',
			'/Shared/han.geojson'
		)).toBe('Shared/han.geojson');
	});

	it('loads only the Workspace scope and preserves settlement metadata', async () => {
		const f = fixture({
			manifests: [
				{
					path: 'History/Gazetteers/Han.md',
					frontmatter: {
						cr_type: 'gazetteer_layer',
						cr_id: 'han-settlements',
						name: 'Han settlements',
						geojson_file: 'han.geojson',
						source: '[[Sources/Gazetteer]]'
					}
				},
				{
					path: 'Other/Gazetteers/Other.md',
					frontmatter: {
						cr_type: 'gazetteer_layer',
						cr_id: 'other',
						name: 'Other',
						geojson_file: 'other.geojson'
					}
				}
			],
			geojson: {
				'History/Gazetteers/han.geojson': JSON.stringify({
					type: 'FeatureCollection',
					features: [{
						type: 'Feature',
						id: 'changan',
						geometry: { type: 'Point', coordinates: [108.94, 34.34] },
						properties: {
							name: '长安',
							aliases: ['京兆', '西京'],
							settlement_type: 'capital',
							importance: 1,
							time_start: 'BCE 202',
							time_end: '220 CE'
						}
					}]
				}),
				'Other/Gazetteers/other.geojson': JSON.stringify({
					type: 'FeatureCollection',
					features: []
				})
			}
		});
		const result = await new HistoricalGazetteerRepository(
			f.app,
			{ fileProvider: () => [f.files[0]] }
		).loadAll();
		expect(result.issues).toEqual([]);
		expect(result.layers).toHaveLength(1);
		expect(result.layers[0]).toMatchObject({
			id: 'han-settlements',
			label: 'Han settlements',
			coordinateCRS: 'wgs84',
			source: '[[Sources/Gazetteer]]'
		});
		expect(result.layers[0].featureCollection.features[0]).toMatchObject({
			id: 'changan',
			properties: {
				name: '长安',
				aliases: ['京兆', '西京'],
				settlement_type: 'capital',
				importance: 1
			}
		});
	});

	it('normalizes GCJ-02 gazetteer points into canonical WGS84', async () => {
		const f = fixture({
			manifests: [{
				path: 'History/Gazetteers/GCJ.md',
				frontmatter: {
					cr_type: 'gazetteer_layer',
					cr_id: 'gcj',
					name: 'GCJ import',
					geojson_file: 'gcj.geojson',
					coordinate_crs: 'gcj02'
				}
			}],
			geojson: {
				'History/Gazetteers/gcj.geojson': JSON.stringify({
					type: 'FeatureCollection',
					features: [{
						type: 'Feature',
						geometry: {
							type: 'Point',
							coordinates: [113.6253334, 34.7466173]
						},
						properties: { name: '郑州' }
					}]
				})
			}
		});
		const result = await new HistoricalGazetteerRepository(f.app).loadAll();
		expect(result.issues.map(issue => issue.code)).toContain(
			'non_canonical_coordinate_crs'
		);
		const [longitude, latitude] =
			result.layers[0].featureCollection.features[0].geometry.coordinates;
		expect(Math.abs(longitude - 113.6192856)).toBeLessThanOrEqual(1e-5);
		expect(Math.abs(latitude - 34.7478004)).toBeLessThanOrEqual(1e-5);
	});

	it('isolates malformed non-point or unnamed features', async () => {
		const f = fixture({
			manifests: [{
				path: 'History/Gazetteers/Bad.md',
				frontmatter: {
					cr_type: 'gazetteer_layer',
					cr_id: 'bad',
					name: 'Bad',
					geojson_file: 'bad.geojson'
				}
			}],
			geojson: {
				'History/Gazetteers/bad.geojson': JSON.stringify({
					type: 'FeatureCollection',
					features: [{
						type: 'Feature',
						geometry: { type: 'LineString', coordinates: [[108, 34], [109, 35]] },
						properties: {}
					}]
				})
			}
		});
		const result = await new HistoricalGazetteerRepository(f.app).loadAll();
		expect(result.layers).toEqual([]);
		expect(result.issues.map(issue => issue.code)).toEqual(['invalid_geojson']);
	});
});

describe('historical gazetteer temporal state', () => {
	function services() {
		const dates = new HistoricalDateService();
		const calendar = dates.getCalendarProvider('tyme');
		if (!calendar) throw new Error('Tyme calendar unavailable');
		return {
			calendar,
			state: new HistoricalGazetteerStateService(dates, calendar)
		};
	}

	function layer(features: Array<{
		id: string;
		name: string;
		time_start?: string;
		time_end?: string;
		time_not_before?: string;
		time_not_after?: string;
	}>) {
		return {
			id: 'gazetteer',
			label: 'Gazetteer',
			coordinateCRS: 'wgs84' as const,
			featureCollection: {
				type: 'FeatureCollection' as const,
				features: features.map((feature, index) => ({
					type: 'Feature' as const,
					id: feature.id,
					geometry: {
						type: 'Point' as const,
						coordinates: [108 + index, 34] as [number, number]
					},
					properties: {
						name: feature.name,
						time_start: feature.time_start,
						time_end: feature.time_end,
						time_not_before: feature.time_not_before,
						time_not_after: feature.time_not_after
					}
				}))
			}
		};
	}

	it('shows only temporally matching ancient settlements', () => {
		const { calendar, state } = services();
		const source = layer([
			{ id: 'old', name: 'Old City', time_start: 'BCE 700', time_end: 'BCE 600' },
			{ id: 'later', name: 'Later City', time_start: '100 CE', time_end: '200 CE' }
		]);
		const point = calendar.solarToJulianDay({
			year: -649,
			month: 6,
			day: 1
		});
		expect(state.getAt([source], point).active.map(entry => entry.feature.id))
			.toEqual(['old']);
	});

	it('keeps uncertain windows possible and timeless entries visible without focus', () => {
		const { calendar, state } = services();
		const source = layer([
			{ id: 'timeless', name: 'Known anchor' },
			{ id: 'possible', name: 'Possible City', time_not_before: 'BCE 700', time_not_after: 'BCE 600' }
		]);
		expect(state.getWithoutFocus([source]).active.map(entry => entry.feature.id))
			.toEqual(['timeless']);
		const point = calendar.solarToJulianDay({
			year: -649,
			month: 6,
			day: 1
		});
		expect(state.getAt([source], point).possible.map(entry => entry.feature.id))
			.toEqual(['possible']);
	});
});
