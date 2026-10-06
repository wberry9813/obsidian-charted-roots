import {
	historicalYearToAstronomical
} from '../historical-year';
import { stripApproximationPrefix } from '../expression-utils';
import type {
	HistoricalDateProvider,
	TemporalParseContext,
	TemporalParseResult
} from '../types';

interface ParsedHistoricalYearExpression {
	year: number;
	era: 'BCE' | 'CE';
	approximate: boolean;
}


function parseHistoricalYear(
	raw: string
): ParsedHistoricalYearExpression | null {
	const { expression, approximate } = stripApproximationPrefix(raw);
	let match: RegExpMatchArray | null;

	match = expression.match(/^(?:公元)?前\s*(\d+)\s*年?$/u);
	if (match) {
		return { year: Number(match[1]), era: 'BCE', approximate };
	}

	match = expression.match(/^(\d+)\s*(?:BCE|BC)$/iu);
	if (match) {
		return { year: Number(match[1]), era: 'BCE', approximate };
	}

	match = expression.match(/^(?:BCE|BC)\s*(\d+)$/iu);
	if (match) {
		return { year: Number(match[1]), era: 'BCE', approximate };
	}

	match = expression.match(/^公元\s*(\d+)\s*年?$/u);
	if (match) {
		return { year: Number(match[1]), era: 'CE', approximate };
	}

	match = expression.match(/^(\d+)\s*(?:CE|AD)$/iu);
	if (match) {
		return { year: Number(match[1]), era: 'CE', approximate };
	}

	match = expression.match(/^(?:CE|AD)\s*(\d+)$/iu);
	if (match) {
		return { year: Number(match[1]), era: 'CE', approximate };
	}

	// Plain Chinese/Arabic year defaults to CE. This mirrors ordinary modern
	// year notation while keeping explicit BCE forms unambiguous.
	match = expression.match(/^(\d+)\s*年?$/u);
	if (match) {
		return { year: Number(match[1]), era: 'CE', approximate };
	}

	return null;
}

export class BceCeYearProvider implements HistoricalDateProvider {
	readonly id = 'bce-ce-year';

	parse(
		expression: string,
		_context?: TemporalParseContext
	): TemporalParseResult | null {
		const parsed = parseHistoricalYear(expression);
		if (!parsed) return null;

		if (!Number.isInteger(parsed.year) || parsed.year < 1) {
			return {
				status: 'unresolved',
				original: expression,
				reason: 'Historical BCE/CE notation has no year zero.'
			};
		}

		const year = historicalYearToAstronomical(parsed.year, parsed.era);

		return {
			status: 'resolved',
			value: {
				original: expression,
				precision: 'year',
				certainty: parsed.approximate ? 'approximate' : 'certain',
				calendar: 'historical-year-numbering',
				resolver: this.id,
				canonical: {
					scale: 'astronomical_year',
					start: year,
					end: year
				}
			}
		};
	}
}
