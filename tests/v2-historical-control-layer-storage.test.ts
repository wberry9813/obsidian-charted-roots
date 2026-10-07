import { describe, expect, it } from 'vitest';
import { ALL_NOTE_TYPES } from '../src/utils/note-type-detection';
import {
	HistoricalControlLayerRepository,
	resolveHistoricalControlLayerGeoJsonPath
} from '../src/v2';

function mockApp(input: {
	manifests: Array<{ path: string; frontmatter: Record<string, unknown> }>;
	geojson: Record<string, string>;
}) {
	const manifestFiles = input.manifests.map(item => ({
		path: item.path,
		basename: item.path.split('/').pop()?.replace(/\.md$/, '') ?? item.path,
		extension: 'md'
	}));
	const frontmatterByPath = new Map(
		input.manifests.map(item => [item.path, item.frontmatter])
	);
	const geojsonFiles = new Map(
		Object.keys(input.geojson).map(path => [
			path,
			{
				path,
				basename: path.split('/').pop()?.replace(/\.geojson$/, '') ?? path,
				extension: 'geojson'
			}
		])
	);
	return {
		app: {
			vault: {
				getMarkdownFiles: () => manifestFiles,
				getAbstractFileByPath: (path: string) =>
					geojsonFiles.get(path) ?? null,
				read: async (file: { path: string }) => input.geojson[file.path]
			},
			metadataCache: {
				getFileCache: (file: { path: string }) => ({
					frontmatter: frontmatterByPath.get(file.path)
				})
			}
		} as never,
		files: manifestFiles as never
	};
}

describe('M6 historical control-layer storage', () => {
	it('recognizes control_layer as a valid Charted Roots note type', () => {
		expect(ALL_NOTE_TYPES).toContain('control_layer');
	});

	it('uses manifest-relative paths unless vault-root is explicit', () => {
		expect(resolveHistoricalControlLayerGeoJsonPath(
			'History/Layers/Han.md',
			'geo/han.geojson'
		)).toBe('History/Layers/geo/han.geojson');
		expect(resolveHistoricalControlLayerGeoJsonPath(
			'History/Layers/Han.md',
			'/Shared/han'
		)).toBe('Shared/han.geojson');
	});

	it('loads only Workspace-scoped manifests', async () => {
		const fixture = mockApp({
			manifests: [
				{
					path: 'History/Layers/Han.md',
					frontmatter: {
						cr_schema: 2,
						cr_type: 'control_layer',
						cr_id: 'han-boundary',
						name: 'Han boundary',
						geojson_file: 'han.geojson',
						coordinate_crs: 'wgs84',
						time_start: 'BCE 202',
						time_end: '220 CE',
						source: '[[Sources/Atlas]]'
					}
				},
				{
					path: 'Fiction/Layers/Other.md',
					frontmatter: {
						cr_schema: 2,
						cr_type: 'control_layer',
						cr_id: 'other',
						name: 'Other',
						geojson_file: 'other.geojson'
					}
				}
			],
			geojson: {
				'History/Layers/han.geojson': JSON.stringify({
					type: 'FeatureCollection',
					features: [{
						type: 'Feature',
						properties: { name: 'Han' },
						geometry: {
							type: 'Point',
							coordinates: [108.9398, 34.3416]
						}
					}]
				}),
				'Fiction/Layers/other.geojson': JSON.stringify({
					type: 'FeatureCollection',
					features: []
				})
			}
		});
		const repository = new HistoricalControlLayerRepository(
			fixture.app,
			{ fileProvider: () => [fixture.files[0]] }
		);
		const result = await repository.loadAll();

		expect(result.issues).toEqual([]);
		expect(result.layers).toHaveLength(1);
		expect(result.layers[0]).toMatchObject({
			id: 'han-boundary',
			label: 'Han boundary',
			coordinateCRS: 'wgs84',
			time_start: 'BCE 202',
			time_end: '220 CE',
			source: '[[Sources/Atlas]]'
		});
	});

	it('reports but safely normalizes non-canonical persisted geometry', async () => {
		const fixture = mockApp({
			manifests: [{
				path: 'History/Layers/Legacy.md',
				frontmatter: {
					cr_schema: 2,
					cr_type: 'control_layer',
					cr_id: 'legacy',
					name: 'Legacy',
					geojson_file: 'legacy.geojson',
					coordinate_crs: 'gcj02',
					source_coordinate_crs: 'gcj02'
				}
			}],
			geojson: {
				'History/Layers/legacy.geojson': JSON.stringify({
					type: 'FeatureCollection',
					features: [{
						type: 'Feature',
						properties: {},
						geometry: {
							type: 'Point',
							coordinates: [113.6253334, 34.7466173]
						}
					}]
				})
			}
		});
		const result = await new HistoricalControlLayerRepository(
			fixture.app
		).loadAll();

		expect(result.issues.map(issue => issue.code)).toContain(
			'non_canonical_coordinate_crs'
		);
		const point = result.layers[0].featureCollection.features[0].geometry;
		expect(point?.type).toBe('Point');
		if (point?.type === 'Point') {
			expect(Math.abs(point.coordinates[0] - 113.6192856))
				.toBeLessThanOrEqual(1e-5);
			expect(Math.abs(point.coordinates[1] - 34.7478004))
				.toBeLessThanOrEqual(1e-5);
		}
	});

	it('isolates invalid, unsupported or missing GeoJSON per manifest', async () => {
		const fixture = mockApp({
			manifests: [
				{
					path: 'Layers/Bad.md',
					frontmatter: {
						cr_schema: 2,
						cr_type: 'control_layer',
						cr_id: 'bad',
						name: 'Bad',
						geojson_file: 'bad.geojson'
					}
				},
				{
					path: 'Layers/Unsupported.md',
					frontmatter: {
						cr_schema: 2,
						cr_type: 'control_layer',
						cr_id: 'unsupported',
						name: 'Unsupported',
						geojson_file: 'unsupported.geojson'
					}
				},
				{
					path: 'Layers/Missing.md',
					frontmatter: {
						cr_schema: 2,
						cr_type: 'control_layer',
						cr_id: 'missing',
						name: 'Missing',
						geojson_file: 'missing.geojson'
					}
				}
			],
			geojson: {
				'Layers/bad.geojson': '{"type":"FeatureCollection","features":',
				'Layers/unsupported.geojson': JSON.stringify({
					type: 'FeatureCollection',
					features: [{
						type: 'Feature',
						properties: {},
						geometry: {
							type: 'CircularString',
							coordinates: [[108, 34], [109, 35]]
						}
					}]
				})
			}
		});
		const result = await new HistoricalControlLayerRepository(
			fixture.app
		).loadAll();

		expect(result.layers).toEqual([]);
		expect(result.issues.map(issue => issue.code).sort()).toEqual([
			'invalid_geojson',
			'invalid_geojson',
			'missing_geojson_file'
		]);
	});
});
