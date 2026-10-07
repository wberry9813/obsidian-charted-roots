import type { TFile } from 'obsidian';
import type { TemporalCertainty, TemporalPrecision } from '../types';
import type { TemporalParseResult } from '../time/types';

export type TemporalItemKind = 'event' | 'process' | 'period' | 'assertion';

export type TemporalGroupingKind =
	| 'person'
	| 'place'
	| 'organization'
	| 'office'
	| 'universe';

export interface TemporalGroupingRef {
	kind: TemporalGroupingKind;
	/**
	 * Stable grouping key. Prefer cr_id when the linked entity resolves;
	 * otherwise fall back to a normalized link/path value.
	 */
	key: string;
	label: string;
	reference: string;
	crId?: string;
	filePath?: string;
}

export type TemporalProjectionStatus =
	| 'resolved'
	| 'partial'
	| 'ambiguous'
	| 'unresolved'
	| 'undated';

export type TemporalProjectionSource =
	| 'v2'
	| 'legacy_event'
	| 'mixed_event';

/**
 * One temporal boundary exactly as authored plus its historical-date parse.
 *
 * Declared precision/certainty are v2 metadata. Effective values use those
 * declarations when present, otherwise the parser's non-lossy inference.
 */
export interface TemporalBoundaryProjection {
	expression: string;
	declaredPrecision?: TemporalPrecision;
	declaredCertainty?: TemporalCertainty;
	effectivePrecision?: TemporalPrecision;
	effectiveCertainty?: TemporalCertainty;
	/**
	 * True when explicit v2 precision metadata contradicts the precision that
	 * can actually be inferred from the authored expression. Renderers must
	 * never use the declaration to manufacture finer coordinates.
	 */
	precisionConflict: boolean;
	result: TemporalParseResult;
}

/**
 * Normalized data contract consumed by future timeline/map/graph views.
 *
 * The projection deliberately preserves the source note and parse status. A
 * renderer must not invent a point date for year/month precision merely to fit
 * a visualization library.
 */
export interface TemporalItem {
	id: string;
	kind: TemporalItemKind;
	file: TFile;
	filePath: string;
	title: string;
	typeId?: string;
	predicate?: string;
	universe?: string;
	subject?: string;
	object?: string;
	value?: string | number | boolean;
	groups: TemporalGroupingRef[];
	start?: TemporalBoundaryProjection;
	end?: TemporalBoundaryProjection;
	notBefore?: TemporalBoundaryProjection;
	notAfter?: TemporalBoundaryProjection;
	status: TemporalProjectionStatus;
	source: TemporalProjectionSource;
}
