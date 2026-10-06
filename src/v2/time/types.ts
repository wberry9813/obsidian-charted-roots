import type { TemporalCertainty, TemporalPrecision } from '../types';

export type CanonicalTemporalScale = 'astronomical_year' | 'julian_day';

export interface CanonicalTemporalInterval {
	scale: CanonicalTemporalScale;
	start: number;
	end: number;
}

export interface TemporalValue {
	/** User/source expression preserved verbatim. */
	original: string;
	precision: TemporalPrecision;
	certainty: TemporalCertainty;
	calendar?: string;
	chronology?: string;
	resolver: string;
	canonical: CanonicalTemporalInterval;
}

export interface TemporalParseContext {
	locale?: string;
	calendar?: string;
	chronology?: string;
	polity?: string;
	ruler?: string;
}

export interface ResolvedTemporalParseResult {
	status: 'resolved';
	value: TemporalValue;
}

export interface AmbiguousTemporalParseResult {
	status: 'ambiguous';
	original: string;
	reason: string;
	candidates: TemporalValue[];
}

export interface UnresolvedTemporalParseResult {
	status: 'unresolved';
	original: string;
	reason?: string;
}

export type TemporalParseResult =
	| ResolvedTemporalParseResult
	| AmbiguousTemporalParseResult
	| UnresolvedTemporalParseResult;

export interface HistoricalDateProvider {
	readonly id: string;

	/**
	 * Return null when the provider does not recognize the expression.
	 * Return unresolved only when it recognizes the syntax but cannot resolve it.
	 */
	parse(
		expression: string,
		context?: TemporalParseContext
	): TemporalParseResult | null;
}
