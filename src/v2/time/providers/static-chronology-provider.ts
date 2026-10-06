import { stripApproximationPrefix } from '../expression-utils';
import { parseChineseYearNumber } from '../chinese-numerals';
import type {
	ChronologyDefinition,
	ChronologyMatch,
	ChronologyProvider
} from '../chronology-provider';
import type {
	TemporalParseContext,
	TemporalParseResult,
	TemporalValue
} from '../types';

interface ParsedChronologyExpression {
	name: string;
	yearNumber: number;
	approximate: boolean;
}

function parseExpression(raw: string): ParsedChronologyExpression | null {
	const { expression, approximate } = stripApproximationPrefix(raw);
	const match = expression.match(/^(.+?)(元|[〇零一二两兩三四五六七八九十百\d]+)年$/u);
	if (!match) return null;

	const name = match[1].trim();
	const yearNumber = parseChineseYearNumber(match[2]);
	if (!name || yearNumber === null) return null;

	return { name, yearNumber, approximate };
}

function matchesContext(
	definition: ChronologyDefinition,
	context: TemporalParseContext
): boolean {
	if (context.polity && definition.polity && context.polity !== definition.polity) {
		return false;
	}
	if (context.ruler && definition.ruler && context.ruler !== definition.ruler) {
		return false;
	}
	if (
		context.chronology
		&& context.chronology !== definition.id
		&& !definition.names.includes(context.chronology)
	) {
		return false;
	}
	return true;
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

export class StaticChronologyProvider implements ChronologyProvider {
	readonly id: string;
	private readonly definitions: ChronologyDefinition[];

	constructor(
		id: string,
		definitions: ChronologyDefinition[]
	) {
		if (!id.trim()) throw new Error('Chronology provider id must not be empty.');
		this.id = id;
		this.definitions = definitions.map(definition => ({
			...definition,
			names: [...definition.names],
			mappings: [...definition.mappings]
		}));
	}

	findMatches(
		expression: string,
		context: TemporalParseContext = {}
	): ChronologyMatch[] {
		const parsed = parseExpression(expression);
		if (!parsed) return [];

		const matches: ChronologyMatch[] = [];
		for (const definition of this.definitions) {
			if (!definition.names.includes(parsed.name)) continue;
			if (!matchesContext(definition, context)) continue;

			for (const mapping of definition.mappings) {
				if (mapping.yearNumber === parsed.yearNumber) {
					matches.push({ definition, mapping });
				}
			}
		}
		return matches;
	}

	parse(
		expression: string,
		context: TemporalParseContext = {}
	): TemporalParseResult | null {
		const parsed = parseExpression(expression);
		if (!parsed) return null;

		const nameDefinitions = this.definitions.filter(
			definition => definition.names.includes(parsed.name)
		);
		if (nameDefinitions.length === 0) return null;

		const matches = this.findMatches(expression, context);
		if (matches.length === 0) {
			return {
				status: 'unresolved',
				original: expression,
				reason: `Chronology "${parsed.name}" is known, but year ${parsed.yearNumber} has no mapping for the supplied context.`
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
			reason: `Chronology expression "${expression}" matches multiple historical contexts.`,
			candidates: values
		};
	}
}
