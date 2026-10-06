const DIGITS: Record<string, number> = {
	'〇': 0,
	'零': 0,
	'一': 1,
	'二': 2,
	'两': 2,
	'兩': 2,
	'三': 3,
	'四': 4,
	'五': 5,
	'六': 6,
	'七': 7,
	'八': 8,
	'九': 9
};

/**
 * Parse the limited positive integer forms used by Chinese era/regnal years.
 *
 * Supports Arabic digits, 元, digit-by-digit forms such as 二〇二, and the
 * common unit forms 十三 / 二十三 / 一百零三.
 */
export function parseChineseYearNumber(input: string): number | null {
	const value = input.trim();
	if (!value) return null;
	if (value === '元') return 1;
	if (/^\d+$/.test(value)) {
		const n = Number(value);
		return Number.isInteger(n) && n > 0 ? n : null;
	}

	if ([...value].every(char => char in DIGITS)) {
		const n = Number([...value].map(char => DIGITS[char]).join(''));
		return Number.isInteger(n) && n > 0 ? n : null;
	}

	let total = 0;
	let current = 0;
	let sawUnit = false;

	for (const char of value) {
		if (char in DIGITS) {
			current = DIGITS[char];
			continue;
		}
		if (char === '十') {
			sawUnit = true;
			total += (current || 1) * 10;
			current = 0;
			continue;
		}
		if (char === '百') {
			sawUnit = true;
			total += (current || 1) * 100;
			current = 0;
			continue;
		}
		return null;
	}

	const result = total + current;
	return sawUnit && result > 0 ? result : null;
}
