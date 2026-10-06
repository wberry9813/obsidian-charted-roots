import type {
	ChronologyDefinition,
	ChronologyMatch,
	ChronologyProvider,
	ChronologyYearMapping
} from '../chronology-provider';
import { parseChronologyExpression } from '../chronology-expression';
import type {
	TemporalParseContext,
	TemporalParseResult,
	TemporalValue
} from '../types';

export interface SxwnlChronologyRecord {
	startAstronomicalYear: number;
	spanYears: number;
	usedYears: number;
	dynasty: string;
	reignTitle: string;
	ruler: string;
	eraName: string;
}

function stableRecordId(record: SxwnlChronologyRecord): string {
	const parts = [
		record.startAstronomicalYear,
		record.dynasty,
		record.ruler || record.reignTitle,
		record.eraName
	]
		.map(value => String(value).trim().replace(/\s+/g, '_'))
		.filter(Boolean);
	return `sxwnl:${parts.join(':')}`;
}

function matchesContext(
	record: SxwnlChronologyRecord,
	context: TemporalParseContext
): boolean {
	if (context.polity && context.polity !== record.dynasty) return false;

	if (
		context.ruler
		&& context.ruler !== record.ruler
		&& context.ruler !== record.reignTitle
	) {
		return false;
	}

	const id = stableRecordId(record);
	if (
		context.chronology
		&& context.chronology !== id
		&& context.chronology !== record.eraName
	) {
		return false;
	}

	return true;
}

function mappingFor(
	record: SxwnlChronologyRecord,
	yearNumber: number
): ChronologyYearMapping | null {
	const offset = yearNumber - 1 - record.usedYears;
	if (offset < 0 || offset >= record.spanYears) return null;

	const astronomicalYear = record.startAstronomicalYear + offset;
	return {
		yearNumber,
		canonical: {
			scale: 'astronomical_year',
			start: astronomicalYear,
			end: astronomicalYear
		},
		precision: 'year'
	};
}

function definitionFor(
	record: SxwnlChronologyRecord,
	mapping: ChronologyYearMapping
): ChronologyDefinition {
	return {
		id: stableRecordId(record),
		kind: 'era_name',
		names: [record.eraName],
		polity: record.dynasty || undefined,
		ruler: record.ruler || record.reignTitle || undefined,
		calendar: 'chinese-historical',
		mappings: [mapping],
		source: '寿星天文历 5.10 / lunar.js JNB'
	};
}

function toTemporalValue(
	expression: string,
	match: ChronologyMatch,
	approximate: boolean,
	resolver: string
): TemporalValue {
	return {
		original: expression,
		precision: match.mapping.precision,
		certainty: approximate
			? 'approximate'
			: (match.mapping.certainty ?? 'certain'),
		calendar: match.definition.calendar,
		chronology: match.definition.id,
		resolver,
		canonical: match.mapping.canonical
	};
}

/**
 * Adapter for 寿星天文历 JNB chronology records.
 *
 * SXWNL's source data stores: start astronomical year, span, already-used era
 * years, dynasty, reign title, ruler and era name. The arithmetic here mirrors
 * SXWNL getNH(): eraYear = year - start + 1 + usedYears.
 *
 * The upstream documentation explicitly notes that its chronology list is
 * basic/incomplete and not guaranteed fully correct. Therefore this provider
 * is a resolver/provenance source, not an authority that may overwrite local
 * research.
 */
export class SxwnlChronologyProvider implements ChronologyProvider {
	readonly id = 'sxwnl-chronology';

	constructor(
		private readonly records: readonly SxwnlChronologyRecord[]
	) {}

	findMatches(
		expression: string,
		context: TemporalParseContext = {}
	): ChronologyMatch[] {
		const parsed = parseChronologyExpression(expression);
		if (!parsed) return [];

		const matches: ChronologyMatch[] = [];
		for (const record of this.records) {
			if (record.eraName !== parsed.name) continue;
			if (!matchesContext(record, context)) continue;

			const mapping = mappingFor(record, parsed.yearNumber);
			if (!mapping) continue;

			matches.push({
				definition: definitionFor(record, mapping),
				mapping
			});
		}
		return matches;
	}

	parse(
		expression: string,
		context: TemporalParseContext = {}
	): TemporalParseResult | null {
		const parsed = parseChronologyExpression(expression);
		if (!parsed) return null;

		const knownName = this.records.some(record => record.eraName === parsed.name);
		if (!knownName) return null;

		const matches = this.findMatches(expression, context);
		if (matches.length === 0) {
			return {
				status: 'unresolved',
				original: expression,
				reason: `SXWNL knows chronology "${parsed.name}", but year ${parsed.yearNumber} has no matching record for the supplied context.`
			};
		}

		const values = matches.map(match =>
			toTemporalValue(expression, match, parsed.approximate, this.id)
		);

		if (values.length === 1) {
			return { status: 'resolved', value: values[0] };
		}

		return {
			status: 'ambiguous',
			original: expression,
			reason: `SXWNL chronology "${parsed.name}" matches multiple historical contexts.`,
			candidates: values
		};
	}
}
