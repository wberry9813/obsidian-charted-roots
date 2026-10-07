import {
	normalizePath,
	TFile,
	TFolder,
	type App
} from 'obsidian';
import { generateCrId } from '../../../core/uuid';
import { sanitizeFilename } from '../../../utils/name-sanitization';
import type {
	TemporalCertainty,
	TemporalFields
} from '../../types';
import {
	CanonicalCoordinateService,
	GcoordCoordinateTransformProvider,
	type GeographicCRS
} from '../coordinates';
import { canonicalizeHistoricalControlLayer } from './geojson-coordinate-adapter';
import { parseHistoricalControlFeatureCollection } from './repository';
import type {
	CanonicalHistoricalControlLayer,
	HistoricalControlFeatureCollection,
	HistoricalControlLayerDefinition
} from './types';

export interface CreateHistoricalControlLayerData extends TemporalFields {
	label: string;
	sourceCRS: GeographicCRS;
	featureCollection: HistoricalControlFeatureCollection;
	universe?: string;
	source?: string | string[];
	confidence?: string;
	uncertainty?: TemporalCertainty;
}

export interface CreateHistoricalControlLayerOptions {
	folder: string;
	fileName?: string;
}

export interface HistoricalControlLayerWriteResult {
	manifestFile: TFile;
	geojsonFile: TFile;
	layer: CanonicalHistoricalControlLayer;
}

const coordinates = new CanonicalCoordinateService(
	new GcoordCoordinateTransformProvider()
);

function yamlScalar(value: string | number | boolean): string {
	return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function yamlValue(value: string | string[] | number | boolean): string {
	return Array.isArray(value)
		? JSON.stringify(value)
		: yamlScalar(value);
}

function optionalLine(
	lines: string[],
	key: string,
	value: string | string[] | number | boolean | undefined
): void {
	if (value === undefined) return;
	if (typeof value === 'string' && !value.trim()) return;
	if (Array.isArray(value) && value.length === 0) return;
	lines.push(`${key}: ${yamlValue(value)}`);
}

/**
 * Deterministic manifest serializer kept separate from Obsidian cache timing.
 * Geometry is stored in the sibling .geojson file, never duplicated here.
 */
export function buildHistoricalControlLayerManifestMarkdown(
	crId: string,
	label: string,
	geojsonFileName: string,
	sourceCRS: GeographicCRS,
	data: Omit<CreateHistoricalControlLayerData, 'label' | 'sourceCRS' | 'featureCollection'>
): string {
	const lines = [
		'---',
		'cr_schema: 2',
		'cr_type: control_layer',
		`cr_id: ${yamlScalar(crId)}`,
		`name: ${yamlScalar(label)}`,
		`geojson_file: ${yamlScalar(geojsonFileName)}`,
		'coordinate_crs: wgs84'
	];

	if (sourceCRS !== 'wgs84') {
		lines.push(`source_coordinate_crs: ${yamlScalar(sourceCRS)}`);
	}

	optionalLine(lines, 'universe', data.universe);
	optionalLine(lines, 'source', data.source);
	optionalLine(lines, 'confidence', data.confidence);
	optionalLine(lines, 'uncertainty', data.uncertainty);
	optionalLine(lines, 'time_start', data.time_start);
	optionalLine(lines, 'time_end', data.time_end);
	optionalLine(lines, 'time_not_before', data.time_not_before);
	optionalLine(lines, 'time_not_after', data.time_not_after);
	optionalLine(lines, 'time_start_precision', data.time_start_precision);
	optionalLine(lines, 'time_end_precision', data.time_end_precision);
	optionalLine(lines, 'time_start_certainty', data.time_start_certainty);
	optionalLine(lines, 'time_end_certainty', data.time_end_certainty);

	lines.push('---', '', `# ${label}`, '');
	return lines.join('\n');
}

/**
 * Parse and normalize raw imported GeoJSON into the canonical WGS84 contract.
 */
export function prepareHistoricalControlLayerImport(
	input: Omit<CreateHistoricalControlLayerData, 'featureCollection'> & {
		rawGeoJson: string;
	}
): CanonicalHistoricalControlLayer {
	const label = input.label.trim();
	if (!label) throw new Error('Control layer name is required.');

	const featureCollection = parseHistoricalControlFeatureCollection(
		input.rawGeoJson
	);
	const definition: HistoricalControlLayerDefinition = {
		id: 'preview',
		label,
		coordinateCRS: input.sourceCRS,
		featureCollection,
		universe: input.universe,
		source: input.source,
		confidence: input.confidence,
		uncertainty: input.uncertainty,
		time_start: input.time_start,
		time_end: input.time_end,
		time_not_before: input.time_not_before,
		time_not_after: input.time_not_after,
		time_start_precision: input.time_start_precision,
		time_end_precision: input.time_end_precision,
		time_start_certainty: input.time_start_certainty,
		time_end_certainty: input.time_end_certainty
	};
	return canonicalizeHistoricalControlLayer(definition, coordinates);
}

export class HistoricalControlLayerWriter {
	constructor(private readonly app: App) {}

	async create(
		data: CreateHistoricalControlLayerData,
		options: CreateHistoricalControlLayerOptions
	): Promise<HistoricalControlLayerWriteResult> {
		const label = data.label.trim();
		if (!label) throw new Error('Control layer name is required.');

		const canonical = canonicalizeHistoricalControlLayer({
			id: 'pending',
			label,
			coordinateCRS: data.sourceCRS,
			featureCollection: data.featureCollection,
			universe: data.universe,
			source: data.source,
			confidence: data.confidence,
			uncertainty: data.uncertainty,
			time_start: data.time_start,
			time_end: data.time_end,
			time_not_before: data.time_not_before,
			time_not_after: data.time_not_after,
			time_start_precision: data.time_start_precision,
			time_end_precision: data.time_end_precision,
			time_start_certainty: data.time_start_certainty,
			time_end_certainty: data.time_end_certainty
		}, coordinates);

		const folder = normalizePath(options.folder);
		await this.ensureFolderExists(folder);

		const crId = generateCrId();
		const baseStem = sanitizeFilename(
			options.fileName?.trim() || label
		) || `control-layer-${crId.slice(0, 8)}`;
		const pair = await this.nextAvailablePair(folder, baseStem);
		const geojsonFileName = pair.geojsonPath.split('/').pop()
			?? `${baseStem}.geojson`;

		const manifest = buildHistoricalControlLayerManifestMarkdown(
			crId,
			label,
			geojsonFileName,
			data.sourceCRS,
			data
		);
		const geojson = `${JSON.stringify(canonical.featureCollection, null, 2)}\n`;

		let geojsonFile: TFile | null = null;
		try {
			geojsonFile = await this.app.vault.create(pair.geojsonPath, geojson);
			const manifestFile = await this.app.vault.create(
				pair.manifestPath,
				manifest
			);
			return {
				manifestFile,
				geojsonFile,
				layer: { ...canonical, id: crId }
			};
		} catch (error) {
			if (geojsonFile) {
				try {
					await this.app.vault.delete(geojsonFile);
				} catch {
					// Best-effort rollback; preserve the original write error.
				}
			}
			throw error;
		}
	}

	private async nextAvailablePair(
		folder: string,
		stem: string
	): Promise<{ manifestPath: string; geojsonPath: string }> {
		for (let suffix = 0;; suffix++) {
			const candidate = suffix === 0 ? stem : `${stem}-${suffix + 1}`;
			const manifestPath = normalizePath(`${folder}/${candidate}.md`);
			const geojsonPath = normalizePath(`${folder}/${candidate}.geojson`);
			if (
				!this.app.vault.getAbstractFileByPath(manifestPath)
				&& !this.app.vault.getAbstractFileByPath(geojsonPath)
			) {
				return { manifestPath, geojsonPath };
			}
		}
	}

	private async ensureFolderExists(folder: string): Promise<void> {
		if (!folder || folder === '/') return;
		let current = '';
		for (const segment of folder.split('/').filter(Boolean)) {
			current = current ? `${current}/${segment}` : segment;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (existing instanceof TFolder) continue;
			if (existing) {
				throw new Error(
					`Cannot create control-layer folder "${current}": a file exists at that path.`
				);
			}
			await this.app.vault.createFolder(current);
		}
	}
}
