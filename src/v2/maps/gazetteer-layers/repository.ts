import type { App, TFile } from 'obsidian';
import {
	CanonicalCoordinateService,
	GcoordCoordinateTransformProvider,
	type GeographicCRS
} from '../coordinates';
import type {
	TemporalCertainty,
	TemporalPrecision
} from '../../types';
import type {
	CanonicalHistoricalGazetteerLayer,
	HistoricalGazetteerFeature,
	HistoricalGazetteerFeatureCollection,
	HistoricalGazetteerFeatureProperties,
	HistoricalGazetteerLayerDefinition
} from './types';

export interface HistoricalGazetteerRepositoryOptions {
	fileProvider?: () => TFile[];
}

export type HistoricalGazetteerStorageIssueCode =
	| 'invalid_manifest'
	| 'missing_geojson_file'
	| 'invalid_geojson'
	| 'non_canonical_coordinate_crs'
	| 'coordinate_error';

export interface HistoricalGazetteerStorageIssue {
	code: HistoricalGazetteerStorageIssueCode;
	manifestPath: string;
	geojsonPath?: string;
	message: string;
}

export interface HistoricalGazetteerLoadResult {
	layers: CanonicalHistoricalGazetteerLayer[];
	issues: HistoricalGazetteerStorageIssue[];
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

function dirname(path: string): string {
	const parts = path.split('/');
	parts.pop();
	return parts.join('/');
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

function normalizeVaultPath(path: string): string {
	const out: string[] = [];
	for (const part of path.replace(/^\/+/, '').split('/')) {
		if (!part || part === '.') continue;
		if (part === '..') out.pop();
		else out.push(part);
	}
	return out.join('/');
}

export function resolveHistoricalGazetteerGeoJsonPath(
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

function parseAliases(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const aliases = value
		.filter((item): item is string => typeof item === 'string')
		.map(item => item.trim())
		.filter(Boolean);
	return aliases.length ? aliases : undefined;
}

function parseImportance(value: unknown): number | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const number = typeof value === 'number' ? value : Number(value);
	if (!Number.isFinite(number) || number < 1 || number > 5) {
		throw new Error('Gazetteer importance must be between 1 and 5.');
	}
	return number;
}

function parsePosition(value: unknown): [number, number] {
	if (
		!Array.isArray(value)
		|| value.length < 2
		|| typeof value[0] !== 'number'
		|| typeof value[1] !== 'number'
		|| !Number.isFinite(value[0])
		|| !Number.isFinite(value[1])
	) {
		throw new Error('Gazetteer Point coordinates must be finite [longitude, latitude].');
	}
	return [value[0], value[1]];
}

export function parseHistoricalGazetteerFeatureCollection(
	raw: string
): HistoricalGazetteerFeatureCollection {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(
			`Invalid gazetteer GeoJSON JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	if (!parsed || typeof parsed !== 'object') {
		throw new Error('Gazetteer GeoJSON must be a FeatureCollection.');
	}
	const record = parsed as Record<string, unknown>;
	if (record.type !== 'FeatureCollection' || !Array.isArray(record.features)) {
		throw new Error('Gazetteer GeoJSON must be a FeatureCollection.');
	}

	const features: HistoricalGazetteerFeature[] = record.features.map(
		(value, index) => {
			if (!value || typeof value !== 'object') {
				throw new Error(`Gazetteer feature ${index} is invalid.`);
			}
			const feature = value as Record<string, unknown>;
			const geometry = feature.geometry as Record<string, unknown> | undefined;
			const rawProperties = feature.properties as Record<string, unknown> | undefined;
			if (feature.type !== 'Feature' || geometry?.type !== 'Point') {
				throw new Error(`Gazetteer feature ${index} must use Point geometry.`);
			}
			const name = stringValue(rawProperties?.name);
			if (!name) {
				throw new Error(`Gazetteer feature ${index} requires properties.name.`);
			}
			const properties: HistoricalGazetteerFeatureProperties = {
				...(rawProperties ?? {}),
				name
			};
			const aliases = parseAliases(rawProperties?.aliases);
			if (aliases) properties.aliases = aliases;
			const importance = parseImportance(rawProperties?.importance);
			if (importance !== undefined) properties.importance = importance;

			return {
				type: 'Feature',
				id: typeof feature.id === 'string' || typeof feature.id === 'number'
					? feature.id
					: undefined,
				geometry: {
					type: 'Point',
					coordinates: parsePosition(geometry.coordinates)
				},
				properties
			};
		}
	);

	return { type: 'FeatureCollection', features };
}

export class HistoricalGazetteerRepository {
	private readonly coordinates = new CanonicalCoordinateService(
		new GcoordCoordinateTransformProvider()
	);

	constructor(
		private readonly app: App,
		private readonly options: HistoricalGazetteerRepositoryOptions = {}
	) {}

	async loadAll(): Promise<HistoricalGazetteerLoadResult> {
		const layers: CanonicalHistoricalGazetteerLayer[] = [];
		const issues: HistoricalGazetteerStorageIssue[] = [];
		const files = this.options.fileProvider?.()
			?? this.app.vault.getMarkdownFiles();

		for (const manifest of files) {
			const frontmatter = this.app.metadataCache.getFileCache(manifest)
				?.frontmatter as Record<string, unknown> | undefined;
			if (frontmatter?.cr_type !== 'gazetteer_layer') continue;

			const id = stringValue(frontmatter.cr_id);
			const label = stringValue(frontmatter.name);
			const geojsonRef = stringValue(frontmatter.geojson_file);
			const declaredCRS = stringValue(frontmatter.coordinate_crs);
			const coordinateCRS = declaredCRS && CRS.has(declaredCRS as GeographicCRS)
				? declaredCRS as GeographicCRS
				: declaredCRS
					? undefined
					: 'wgs84';
			if (!id || !label || !geojsonRef || !coordinateCRS) {
				issues.push({
					code: 'invalid_manifest',
					manifestPath: manifest.path,
					message: !coordinateCRS && declaredCRS
						? `Unsupported coordinate_crs: ${declaredCRS}`
						: 'Gazetteer layer requires cr_id, name and geojson_file.'
				});
				continue;
			}

			const geojsonPath = resolveHistoricalGazetteerGeoJsonPath(
				manifest.path,
				geojsonRef
			);
			const file = this.app.vault.getAbstractFileByPath(geojsonPath);
			if (
				!file
				|| !('extension' in file)
				|| String(file.extension).toLowerCase() !== 'geojson'
			) {
				issues.push({
					code: 'missing_geojson_file',
					manifestPath: manifest.path,
					geojsonPath,
					message: `Gazetteer GeoJSON file not found: ${geojsonPath}`
				});
				continue;
			}

			let collection: HistoricalGazetteerFeatureCollection;
			try {
				collection = parseHistoricalGazetteerFeatureCollection(
					await this.app.vault.read(file as TFile)
				);
			} catch (error) {
				issues.push({
					code: 'invalid_geojson',
					manifestPath: manifest.path,
					geojsonPath,
					message: error instanceof Error ? error.message : String(error)
				});
				continue;
			}

			if (coordinateCRS !== 'wgs84') {
				issues.push({
					code: 'non_canonical_coordinate_crs',
					manifestPath: manifest.path,
					geojsonPath,
					message: `Imported gazetteer coordinates are normalized from ${coordinateCRS} to WGS84.`
				});
			}

			try {
				const canonicalFeatures = collection.features.map(feature => {
					const [longitude, latitude] = feature.geometry.coordinates;
					const canonical = this.coordinates.toCanonical(
						{ longitude, latitude },
						coordinateCRS
					);
					return {
						...feature,
						geometry: {
							type: 'Point' as const,
							coordinates: [
								canonical.longitude,
								canonical.latitude
							] as [number, number]
						},
						properties: { ...feature.properties }
					};
				});
				const definition: HistoricalGazetteerLayerDefinition = {
					id,
					label,
					coordinateCRS: 'wgs84',
					featureCollection: {
						type: 'FeatureCollection',
						features: canonicalFeatures
					},
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
				layers.push(definition as CanonicalHistoricalGazetteerLayer);
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
