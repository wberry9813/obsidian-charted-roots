/**
 * Charted Roots v2 schema and ontology contracts.
 *
 * These types are intentionally storage-oriented and dependency-free so they
 * can be shared by migration, indexing, providers, UI and tests.
 */

export const V2_NOTE_TYPES = [
	'office',
	'process',
	'period',
	'assertion',
	'claim',
	'control_layer'
] as const;

export type V2NoteType = typeof V2_NOTE_TYPES[number];

export type TemporalPrecision =
	| 'day'
	| 'month'
	| 'year'
	| 'decade'
	| 'unknown';

export type TemporalCertainty =
	| 'certain'
	| 'approximate'
	| 'inferred'
	| 'uncertain'
	| 'disputed'
	| 'unknown';

export interface TemporalFields {
	time_start?: string;
	time_end?: string;
	time_not_before?: string;
	time_not_after?: string;
	time_start_precision?: TemporalPrecision;
	time_end_precision?: TemporalPrecision;
	time_start_certainty?: TemporalCertainty;
	time_end_certainty?: TemporalCertainty;
}

export interface V2BaseFrontmatter {
	cr_schema: 2;
	cr_type: string;
	cr_id: string;
	name?: string;
	aliases?: string[];
	universe?: string;
	research_sets?: string[];
	external_ids?: string[];
}

export interface OfficeFrontmatter extends V2BaseFrontmatter {
	cr_type: 'office';
	name: string;
	office_type?: string;
}

export interface ProcessFrontmatter extends V2BaseFrontmatter, TemporalFields {
	cr_type: 'process';
	name: string;
	process_type?: string;
}

export interface PeriodFrontmatter extends V2BaseFrontmatter, TemporalFields {
	cr_type: 'period';
	name: string;
	period_type?: string;
}

export interface ClaimFrontmatter extends V2BaseFrontmatter {
	cr_type: 'claim';
	claim_type: string;
	statement: string;
	asserted_by?: string;
	about?: string[];
	evidence?: string[];
	research_status?: string;
	confidence?: string;
}

export interface AssertionFrontmatter extends V2BaseFrontmatter, TemporalFields {
	cr_type: 'assertion';
	assertion_type: string;
	subject: string;
	predicate: string;
	object?: string;
	value?: string | number | boolean;
	confidence?: string;
	research_status?: string;
	notes?: string;
}

export interface ControlLayerFrontmatter extends V2BaseFrontmatter, TemporalFields {
	cr_type: 'control_layer';
	name: string;
	geojson_file: string;
	/** Persisted geometry datum. Canonical v2 storage is WGS84. */
	coordinate_crs?: 'wgs84' | 'gcj02' | 'bd09';
	/** Original import datum retained only as provenance after normalization. */
	source_coordinate_crs?: 'wgs84' | 'gcj02' | 'bd09';
	source?: string | string[];
	confidence?: string;
	uncertainty?: TemporalCertainty;
}

/**
 * Domain definition kind. The registry accepts custom strings so future packs
 * do not require a core TypeScript union change.
 */
export type TypeKind =
	| 'organization_type'
	| 'office_type'
	| 'designation_type'
	| 'event_type'
	| 'process_type'
	| 'period_type'
	| 'source_type'
	| 'place_type'
	| 'assertion_type'
	| 'relationship_category'
	| (string & {});

export type LocalizedText = Record<string, string>;
export type LocalizedAliases = Record<string, string[]>;

export interface TypeDefinition {
	kind: TypeKind;
	id: string;
	labels: LocalizedText;
	descriptions?: LocalizedText;
	aliases?: LocalizedAliases;
	category?: string;
	pack: string;
	builtIn: boolean;
}

export interface PredicateDefinition extends Omit<TypeDefinition, 'kind'> {
	kind: 'predicate';
	subjectTypes: string[];
	objectTypes?: string[];
	temporal: boolean;
	symmetric?: boolean;
	inverse?: string;
	qualifiers?: string[];
	includeOnFamilyTree?: boolean;
	familyGraphMapping?: string;
}

export interface DefinitionPack {
	id: string;
	types?: TypeDefinition[];
	predicates?: PredicateDefinition[];
}
