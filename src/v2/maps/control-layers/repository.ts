import type { App, TFile } from 'obsidian';
import {
	CanonicalCoordinateService,
	GcoordCoordinateTransformProvider,
	type GeographicCRS
} from '../coordinates';
import { canonicalizeHistoricalControlLayer } from './geojson-coordinate-adapter';
import type {
	CanonicalHistoricalControlLayer,
	ControlLayerGeometry,
	ControlLayerPosition,
	HistoricalControlFeatureCollection,
	HistoricalControlLayerDefinition
} from './types';
import type { TemporalCertainty, TemporalPrecision } from '../../types';

export interface HistoricalControlLayerRepositoryOptions {
	/** Dynamic Active Workspace boundary. */
	fileProvider?: () => TFile[];
}

export type HistoricalControlLayerStorageIssueCode =
	| 'invalid_manifest'
	| 'missing_geojson_file'
	| 'invalid_geojson'
	| 'non_canonical_coordinate_crs'
	| 'coordinate_error';

export interface HistoricalControlLayerStorageIssue {
	code: HistoricalControlLayerStorageIssueCode;
	manifestPath: string;
	geojsonPath?: string;
	message: string;
}

export interface HistoricalControlLayerLoadResult {
	layers: CanonicalHistoricalControlLayer[];
	issues: HistoricalControlLayerStorageIssue[];
}

const CRS = new Set<GeographicCRS>(['wgs84', 'gcj02', 'bd09']);
const PRECISION = new Set<TemporalPrecision>([
	'day', 'month', 'year', 'decade', 'unknown'
]);
const CERTAINTY = new Set<TemporalCertainty>([
	'certain', 'approximate', 'inferred', 'uncertain',
	'disputed', 'unknown'
]);

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim()
		? value.trim()
		: undefined;
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

function crsValue(value: unknown): GeographicCRS | undefined {
	return typeof value === 'string' && CRS.has(value as GeographicCRS)
		? value as GeographicCRS
		: undefined;
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

function stripWikiReference(value: string): string {
	const trimmed = value.trim();
	const inner = trimmed.startsWith('[[') && trimmed.endsWith(']]')
		? trimmed.slice(2, -2)
		: trimmed;
	return (inner.split('|', 1)[0] ?? '')
		.split('#', 1)[0]
		.trim();
}

function dirname(path: string): string {
	const parts = path.split('/');
	parts.pop();
	return parts.join('/');
}

function normalizeVaultPath(path: string): string {
	const out: string[] = [];
	for (const part of path.replace(/^\/+/, '').split('/')) {
		if (!part || part === '.') continue;
		if (part === '..') out.pop();
		else out.push(part);
	}
	return out.join('/');
}

/**
 * geojson_file is manifest-relative by default. A leading slash explicitly
 * selects a vault-root path.
 */
export function resolveHistoricalControlLayerGeoJsonPath(
	manifestPath: string,
	reference: string
): string {
	const target = stripWikiReference(reference);
	if (!target) return '';
	const absolute = target.startsWith('/');
	const withExtension = /\.geojson$/i.test(target)
		? target
		: `${target}.geojson`;
	if (absolute) return normalizeVaultPath(withExtension);
	const parent = dirname(manifestPath);
	return normalizeVaultPath(
		parent ? `${parent}/${withExtension}` : withExtension
	);
}

function isPosition(value: unknown): value is ControlLayerPosition {
	return Array.isArray(value)
		&& value.length >= 2
		&& value.every(item => typeof item === 'number' && Number.isFinite(item));
}

function isPositionArray(value: unknown): value is ControlLayerPosition[] {
	return Array.isArray(value) && value.every(isPosition);
}

function isGeometry(value: unknown): value is ControlLayerGeometry {
	if (!value || typeof value !== 'object') return false;
	const geometry = value as Record<string, unknown>;
	switch (geometry.type) {
		case 'Point':
			return isPosition(geometry.coordinates);
		case 'MultiPoint':
		case 'LineString':
			return isPositionArray(geometry.coordinates);
		case 'MultiLineString':
		case 'Polygon':
			return Array.isArray(geometry.coordinates)
				&& geometry.coordinates.every(isPositionArray);
		case 'MultiPolygon':
			return Array.isArray(geometry.coordinates)
				&& geometry.coordinates.every(polygon =>
					Array.isArray(polygon) && polygon.every(isPositionArray)
				);
		case 'GeometryCollection':
			return Array.isArray(geometry.geometries)
				&& geometry.geometries.every(isGeometry);
		default:
			return false;
	}
}

function isFeatureCollection(
	value: unknown
): value is HistoricalControlFeatureCollection {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return record.type === 'FeatureCollection'
		&& Array.isArray(record.features)
		&& record.features.every(feature => {
			if (!feature || typeof feature !== 'object') return false;
			const f = feature as Record<string, unknown>;
			return f.type === 'Feature'
				&& (f.geometry === null || isGeometry(f.geometry))
				&& !!f.properties
				&& typeof f.properties === 'object'
				&& !Array.isArray(f.properties);
		});
}

export function parseHistoricalControlFeatureCollection(
	raw: string
): HistoricalControlFeatureCollection {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`Invalid GeoJSON JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	if (!isFeatureCollection(parsed)) {
		throw new Error(
			'GeoJSON must be a valid FeatureCollection using supported geometry types.'
		);
	}
	return parsed;
}

/**
 * Workspace-scoped manifest/GeoJSON loader for M6 historical control layers.
 *
 * Markdown manifests are indexed entities; geometry remains in separate
 * .geojson files. Runtime output is always canonical WGS84.
 */
export class HistoricalControlLayerRepository {
	private readonly coordinates = new CanonicalCoordinateService(
		new GcoordCoordinateTransformProvider()
	);

	constructor(
		private readonly app: App,
		private readonly options: HistoricalControlLayerRepositoryOptions = {}
	) {}

	async loadAll(): Promise<HistoricalControlLayerLoadResult> {
		const layers: CanonicalHistoricalControlLayer[] = [];
		const issues: HistoricalControlLayerStorageIssue[] = [];
		const files = this.options.fileProvider?.()
			?? this.app.vault.getMarkdownFiles();

		for (const manifest of files) {
			const frontmatter = this.app.metadataCache.getFileCache(manifest)
				?.frontmatter as Record<string, unknown> | undefined;
			if (frontmatter?.cr_type !== 'control_layer') continue;

			const crId = stringValue(frontmatter.cr_id);
			const name = stringValue(frontmatter.name);
			const geojsonRef = stringValue(frontmatter.geojson_file);
			const declaredCRS = frontmatter.coordinate_crs;
			const coordinateCRS = crsValue(declaredCRS);
			if (
				!crId
				|| !name
				|| !geojsonRef
				|| (declaredCRS !== undefined && !coordinateCRS)
			) {
				issues.push({
					code: 'invalid_manifest',
					manifestPath: manifest.path,
					message: declaredCRS !== undefined && !coordinateCRS
						? `Unsupported coordinate_crs: ${String(declaredCRS)}`
						: 'Control layer requires cr_id, name and geojson_file.'
				});
				continue;
			}

			const geojsonPath = resolveHistoricalControlLayerGeoJsonPath(
				manifest.path,
				geojsonRef
			);
			const abstractFile = this.app.vault.getAbstractFileByPath(geojsonPath);
			if (
				!abstractFile
				|| !('extension' in abstractFile)
				|| String(abstractFile.extension).toLowerCase() !== 'geojson'
			) {
				issues.push({
					code: 'missing_geojson_file',
					manifestPath: manifest.path,
					geojsonPath,
					message: `GeoJSON file not found: ${geojsonPath}`
				});
				continue;
			}

			let collection: HistoricalControlFeatureCollection;
			try {
				const raw = await this.app.vault.read(abstractFile as TFile);
				collection = parseHistoricalControlFeatureCollection(raw);
			} catch (error) {
				issues.push({
					code: 'invalid_geojson',
					manifestPath: manifest.path,
					geojsonPath,
					message: error instanceof Error ? error.message : String(error)
				});
				continue;
			}

			const sourceCRS = coordinateCRS ?? 'wgs84';
			if (sourceCRS !== 'wgs84') {
				issues.push({
					code: 'non_canonical_coordinate_crs',
					manifestPath: manifest.path,
					geojsonPath,
					message: `Persisted control-layer geometry should be WGS84, not ${sourceCRS}.`
				});
			}

			const definition: HistoricalControlLayerDefinition = {
				id: crId,
				label: name,
				coordinateCRS: sourceCRS,
				featureCollection: collection,
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
			};

			try {
				layers.push(
					canonicalizeHistoricalControlLayer(definition, this.coordinates)
				);
			} catch (error) {
				issues.push({
					code: 'coordinate_error',
					manifestPath: manifest.path,
					geojsonPath,
					message: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return { layers, issues };
	}
}
