import type { App, TFile } from 'obsidian';
import type { TemporalCertainty, TemporalPrecision } from '../../types';
import type {
	HistoricalRasterLayerDefinition,
	HistoricalRasterLayerRole
} from './types';

export interface HistoricalRasterLayerRepositoryOptions {
	fileProvider?: () => TFile[];
}

export type HistoricalRasterLayerStorageIssueCode =
	| 'invalid_manifest'
	| 'unsupported_coordinate_crs'
	| 'invalid_tile_url'
	| 'invalid_opacity'
	| 'invalid_zoom'
	| 'invalid_z_index';

export interface HistoricalRasterLayerStorageIssue {
	code: HistoricalRasterLayerStorageIssueCode;
	manifestPath: string;
	message: string;
}

export interface HistoricalRasterLayerLoadResult {
	layers: HistoricalRasterLayerDefinition[];
	issues: HistoricalRasterLayerStorageIssue[];
}

const ROLES = new Set<HistoricalRasterLayerRole>(['terrain', 'historical', 'reference']);
const PRECISION = new Set<TemporalPrecision>(['day', 'month', 'year', 'decade', 'unknown']);
const CERTAINTY = new Set<TemporalCertainty>([
	'certain', 'approximate', 'inferred', 'uncertain', 'disputed', 'unknown'
]);

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sourceValue(value: unknown): string | string[] | undefined {
	if (typeof value === 'string' && value.trim()) return value.trim();
	if (!Array.isArray(value)) return undefined;
	const values = value
		.filter((item): item is string => typeof item === 'string')
		.map(item => item.trim())
		.filter(Boolean);
	return values.length ? values : undefined;
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value !== 'string' || !value.trim()) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function roleValue(value: unknown): HistoricalRasterLayerRole {
	return typeof value === 'string' && ROLES.has(value as HistoricalRasterLayerRole)
		? value as HistoricalRasterLayerRole
		: 'historical';
}

function precisionValue(value: unknown): TemporalPrecision | undefined {
	return typeof value === 'string' && PRECISION.has(value as TemporalPrecision)
		? value as TemporalPrecision
		: undefined;
}

function certaintyValue(value: unknown): TemporalCertainty | undefined {
	return typeof value === 'string' && CERTAINTY.has(value as TemporalCertainty)
		? value as TemporalCertainty
		: undefined;
}

function validTileUrl(url: string): boolean {
	return /^https?:\/\//i.test(url)
		&& url.includes('{z}')
		&& url.includes('{x}')
		&& url.includes('{y}');
}

function defaultOpacity(role: HistoricalRasterLayerRole): number {
	return role === 'terrain' ? 1 : role === 'reference' ? 0.55 : 0.72;
}

function defaultZIndex(role: HistoricalRasterLayerRole): number {
	return role === 'terrain' ? 150 : role === 'historical' ? 220 : 260;
}

/**
 * Loads Workspace-scoped raster-layer manifests.
 *
 * `tile_url` deliberately accepts any HTTP(S) URL template containing
 * `{z}`, `{x}` and `{y}`. This covers ordinary XYZ providers and WMTS
 * endpoints that expose a GoogleMapsCompatible tile matrix via query
 * parameters, without pretending to support arbitrary WMTS projections.
 */
export class HistoricalRasterLayerRepository {
	constructor(
		private readonly app: App,
		private readonly options: HistoricalRasterLayerRepositoryOptions = {}
	) {}

	async loadAll(): Promise<HistoricalRasterLayerLoadResult> {
		const layers: HistoricalRasterLayerDefinition[] = [];
		const issues: HistoricalRasterLayerStorageIssue[] = [];
		const files = this.options.fileProvider?.() ?? this.app.vault.getMarkdownFiles();

		for (const manifest of files) {
			const frontmatter = this.app.metadataCache.getFileCache(manifest)
				?.frontmatter as Record<string, unknown> | undefined;
			if (frontmatter?.cr_type !== 'raster_layer') continue;

			const id = stringValue(frontmatter.cr_id);
			const label = stringValue(frontmatter.name);
			const tileUrl = stringValue(frontmatter.tile_url);
			if (!id || !label || !tileUrl) {
				issues.push({
					code: 'invalid_manifest',
					manifestPath: manifest.path,
					message: 'Raster layer requires cr_id, name and tile_url.'
				});
				continue;
			}

			const coordinateCRS = stringValue(frontmatter.coordinate_crs) ?? 'wgs84';
			if (coordinateCRS !== 'wgs84') {
				issues.push({
					code: 'unsupported_coordinate_crs',
					manifestPath: manifest.path,
					message: `Historical raster layers currently require WGS84/GoogleMapsCompatible tiles, not ${coordinateCRS}.`
				});
				continue;
			}
			if (!validTileUrl(tileUrl)) {
				issues.push({
					code: 'invalid_tile_url',
					manifestPath: manifest.path,
					message: 'tile_url must be HTTP(S) and contain {z}, {x} and {y} placeholders.'
				});
				continue;
			}

			const role = roleValue(frontmatter.role);
			const opacity = numberValue(frontmatter.opacity) ?? defaultOpacity(role);
			if (opacity < 0 || opacity > 1) {
				issues.push({
					code: 'invalid_opacity',
					manifestPath: manifest.path,
					message: 'Raster layer opacity must be between 0 and 1.'
				});
				continue;
			}

			const minZoom = numberValue(frontmatter.min_zoom) ?? 0;
			const maxZoom = numberValue(frontmatter.max_zoom) ?? 19;
			if (minZoom < 0 || maxZoom < minZoom) {
				issues.push({
					code: 'invalid_zoom',
					manifestPath: manifest.path,
					message: 'Raster layer zoom range is invalid.'
				});
				continue;
			}

			const zIndex = numberValue(frontmatter.z_index) ?? defaultZIndex(role);
			if (!Number.isFinite(zIndex)) {
				issues.push({
					code: 'invalid_z_index',
					manifestPath: manifest.path,
					message: 'Raster layer z_index must be a finite number.'
				});
				continue;
			}

			layers.push({
				id,
				label,
				tileUrl,
				coordinateCRS: 'wgs84',
				role,
				opacity,
				zIndex,
				minZoom,
				maxZoom,
				attribution: stringValue(frontmatter.attribution) ?? '',
				noReferrer: booleanValue(frontmatter.no_referrer, false),
				enabled: booleanValue(frontmatter.enabled, true),
				universe: stringValue(frontmatter.universe),
				source: sourceValue(frontmatter.source),
				confidence: stringValue(frontmatter.confidence),
				uncertainty: certaintyValue(frontmatter.uncertainty),
				time_start: stringValue(frontmatter.time_start),
				time_end: stringValue(frontmatter.time_end),
				time_not_before: stringValue(frontmatter.time_not_before),
				time_not_after: stringValue(frontmatter.time_not_after),
				time_start_precision: precisionValue(frontmatter.time_start_precision),
				time_end_precision: precisionValue(frontmatter.time_end_precision),
				time_start_certainty: certaintyValue(frontmatter.time_start_certainty),
				time_end_certainty: certaintyValue(frontmatter.time_end_certainty)
			});
		}

		return { layers, issues };
	}
}
