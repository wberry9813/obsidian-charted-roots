import {
	BUILT_IN_GEOGRAPHIC_BASEMAPS,
	DEFAULT_GEOGRAPHIC_BASEMAP
} from './builtins';
import type {
	GeographicBasemapDefinition,
	GeographicTileScheme
} from './types';
import type { GeographicCRS } from '../coordinates';

export interface CustomGeographicBasemapConfig {
	id: string;
	label: string;
	coordinateCRS: GeographicCRS;
	/**
	 * C2 intentionally accepts only XYZ/WebMercator raster providers.
	 * Omit for the current default.
	 */
	tileScheme?: GeographicTileScheme;
	tileUrl: string;
	attribution?: string;
	maxZoom?: number;
	miniMapMaxZoom?: number;
	noReferrer?: boolean;
}

export interface BasemapRegistryIssue {
	basemapId: string;
	code:
		| 'invalid_id'
		| 'duplicate_id'
		| 'invalid_label'
		| 'unsupported_coordinate_crs'
		| 'unsupported_tile_scheme'
		| 'invalid_tile_url'
		| 'invalid_zoom';
	message: string;
}

export interface BuildBasemapRegistryResult {
	registry: GeographicBasemapRegistry;
	issues: BasemapRegistryIssue[];
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SUPPORTED_CRS = new Set<GeographicCRS>(['wgs84', 'gcj02', 'bd09']);

function isSupportedTileUrl(url: string): boolean {
	if (!/^https?:\/\//i.test(url)) return false;
	return url.includes('{z}') && url.includes('{x}') && url.includes('{y}');
}

export function materializeCustomGeographicBasemap(
	config: CustomGeographicBasemapConfig
): GeographicBasemapDefinition {
	return {
		id: config.id.trim(),
		label: config.label.trim(),
		coordinateCRS: config.coordinateCRS,
		tileScheme: config.tileScheme ?? 'xyz-web-mercator',
		tileUrl: config.tileUrl.trim(),
		attribution: config.attribution?.trim() ?? '',
		maxZoom: config.maxZoom ?? 19,
		...(config.miniMapMaxZoom !== undefined
			? { miniMapMaxZoom: config.miniMapMaxZoom }
			: {}),
		...(config.noReferrer !== undefined
			? { noReferrer: config.noReferrer }
			: {})
	};
}

export function validateGeographicBasemapDefinition(
	definition: GeographicBasemapDefinition
): BasemapRegistryIssue[] {
	const issues: BasemapRegistryIssue[] = [];
	if (!ID_PATTERN.test(definition.id)) {
		issues.push({
			basemapId: definition.id,
			code: 'invalid_id',
			message: 'Basemap ID must use lowercase letters, numbers, dots, underscores or hyphens.'
		});
	}
	if (!definition.label.trim()) {
		issues.push({
			basemapId: definition.id,
			code: 'invalid_label',
			message: 'Basemap label cannot be empty.'
		});
	}
	if (!SUPPORTED_CRS.has(definition.coordinateCRS)) {
		issues.push({
			basemapId: definition.id,
			code: 'unsupported_coordinate_crs',
			message: `Unsupported geographic coordinate CRS: ${String(definition.coordinateCRS)}`
		});
	}
	if (definition.tileScheme !== 'xyz-web-mercator') {
		issues.push({
			basemapId: definition.id,
			code: 'unsupported_tile_scheme',
			message: `Unsupported tile scheme: ${String(definition.tileScheme)}`
		});
	}
	if (!isSupportedTileUrl(definition.tileUrl)) {
		issues.push({
			basemapId: definition.id,
			code: 'invalid_tile_url',
			message: 'XYZ tile URL must be HTTP(S) and include {z}, {x} and {y} placeholders.'
		});
	}
	if (
		!Number.isFinite(definition.maxZoom)
		|| definition.maxZoom < 0
		|| (
			definition.miniMapMaxZoom !== undefined
			&& (
				!Number.isFinite(definition.miniMapMaxZoom)
				|| definition.miniMapMaxZoom < 0
			)
		)
	) {
		issues.push({
			basemapId: definition.id,
			code: 'invalid_zoom',
			message: 'Basemap zoom levels must be finite non-negative numbers.'
		});
	}
	return issues;
}

export class GeographicBasemapRegistry {
	private readonly definitions = new Map<string, GeographicBasemapDefinition>();

	constructor(
		definitions: readonly GeographicBasemapDefinition[] =
			BUILT_IN_GEOGRAPHIC_BASEMAPS
	) {
		for (const definition of definitions) {
			const issues = validateGeographicBasemapDefinition(definition);
			if (issues.length > 0) {
				throw new Error(
					`Invalid built-in basemap ${definition.id}: ${issues
						.map(issue => issue.message)
						.join('; ')}`
				);
			}
			if (this.definitions.has(definition.id)) {
				throw new Error(`Duplicate built-in basemap ID: ${definition.id}`);
			}
			this.definitions.set(definition.id, { ...definition });
		}
	}

	tryRegister(
		definition: GeographicBasemapDefinition
	): BasemapRegistryIssue[] {
		const issues = validateGeographicBasemapDefinition(definition);
		if (this.definitions.has(definition.id)) {
			issues.push({
				basemapId: definition.id,
				code: 'duplicate_id',
				message: `Basemap ID already exists: ${definition.id}`
			});
		}
		if (issues.length === 0) {
			this.definitions.set(definition.id, { ...definition });
		}
		return issues;
	}

	get(id: string): GeographicBasemapDefinition | undefined {
		const definition = this.definitions.get(id);
		return definition ? { ...definition } : undefined;
	}

	resolve(id?: string): GeographicBasemapDefinition {
		return (
			(id ? this.get(id) : undefined)
			?? this.get(DEFAULT_GEOGRAPHIC_BASEMAP.id)
			?? { ...DEFAULT_GEOGRAPHIC_BASEMAP }
		);
	}

	list(): GeographicBasemapDefinition[] {
		return [...this.definitions.values()].map(definition => ({
			...definition
		}));
	}
}

export function buildGeographicBasemapRegistry(
	customConfigs: readonly CustomGeographicBasemapConfig[] = []
): BuildBasemapRegistryResult {
	const registry = new GeographicBasemapRegistry();
	const issues: BasemapRegistryIssue[] = [];

	for (const config of customConfigs) {
		const definition = materializeCustomGeographicBasemap(config);
		issues.push(...registry.tryRegister(definition));
	}

	return { registry, issues };
}
