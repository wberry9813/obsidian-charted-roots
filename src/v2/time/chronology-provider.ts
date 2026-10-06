import type {
	CanonicalTemporalInterval,
	HistoricalDateProvider,
	TemporalParseContext,
	TemporalParseResult
} from './types';
import type { TemporalCertainty, TemporalPrecision } from '../types';

export type ChronologyKind =
	| 'era_name'
	| 'regnal_year'
	| 'polity_year'
	| (string & {});

export interface ChronologyYearMapping {
	/** Human year number inside the chronology, e.g. 13 in 建安十三年. */
	yearNumber: number;
	canonical: CanonicalTemporalInterval;
	precision: TemporalPrecision;
	certainty?: TemporalCertainty;
	notes?: string;
}

export interface ChronologyDefinition {
	/** Stable machine identifier, not a display label. */
	id: string;
	kind: ChronologyKind;
	names: string[];
	polity?: string;
	ruler?: string;
	calendar?: string;
	mappings: ChronologyYearMapping[];
	source?: string;
}

export interface ChronologyMatch {
	definition: ChronologyDefinition;
	mapping: ChronologyYearMapping;
}

/**
 * Historical chronology is data/knowledge, not calendar math.
 *
 * Implementations may be backed by built-in JSON, Wikidata, a local dataset,
 * or another source, but all expose the same parse contract.
 */
export interface ChronologyProvider extends HistoricalDateProvider {
	findMatches(
		expression: string,
		context?: TemporalParseContext
	): ChronologyMatch[];
}

export type ChronologyParseResult = TemporalParseResult;
