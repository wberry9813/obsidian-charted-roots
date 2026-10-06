import { describe, expect, it } from 'vitest';
import { parseChineseYearNumber } from '../src/v2';

describe('parseChineseYearNumber', () => {
	it.each([
		['元', 1],
		['一', 1],
		['九', 9],
		['十', 10],
		['十三', 13],
		['二十', 20],
		['二十三', 23],
		['一百', 100],
		['一百零三', 103],
		['二〇二', 202],
		['13', 13]
	])('parses %s as %i', (input, expected) => {
		expect(parseChineseYearNumber(input)).toBe(expected);
	});

	it.each(['', '零', '〇', 'abc', '十三甲'])('rejects invalid year number %s', input => {
		expect(parseChineseYearNumber(input)).toBeNull();
	});
});
