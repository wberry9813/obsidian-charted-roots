import { parseChineseYearNumber } from './chinese-numerals';
import { stripApproximationPrefix } from './expression-utils';

export interface ParsedChronologyExpression {
	name: string;
	yearNumber: number;
	approximate: boolean;
}

/**
 * Parse name + year-number forms such as 建安十三年 / 建元元年.
 *
 * This only recognizes syntax. Historical resolution belongs to chronology
 * providers because the same name may refer to multiple eras/polities.
 */
export function parseChronologyExpression(
	raw: string
): ParsedChronologyExpression | null {
	const { expression, approximate } = stripApproximationPrefix(raw);
	const match = expression.match(/^(.+?)(元|[〇零一二两兩三四五六七八九十百\d]+)年$/u);
	if (!match) return null;

	const name = match[1].trim();
	const yearNumber = parseChineseYearNumber(match[2]);
	if (!name || yearNumber === null) return null;

	return { name, yearNumber, approximate };
}
