import { describe, expect, it } from 'vitest';
import {
	formatAssertionTime,
	getMaterializedProfileAssertions
} from '../src/profile-view/sections/assertions-section';
import type { SemanticAssertion } from '../src/v2';

function assertion(
	overrides: Partial<SemanticAssertion> = {}
): SemanticAssertion {
	return {
		assertionType: 'office_holding',
		subject: '[[曹操]]',
		predicate: 'holds_office',
		object: '[[丞相]]',
		origin: 'assertion_note',
		...overrides
	};
}

describe('Profile structured assertions section helpers', () => {
	it('excludes virtual/frontmatter assertions to avoid duplicate family UI', () => {
		const values = [
			assertion(),
			assertion({ predicate: 'father', origin: 'frontmatter' }),
			assertion({ predicate: 'spouse', origin: 'derived' })
		];

		expect(getMaterializedProfileAssertions(values)).toHaveLength(1);
		expect(getMaterializedProfileAssertions(values)[0].predicate).toBe('holds_office');
	});

	it('formats bounded and one-sided historical time without adding precision', () => {
		expect(formatAssertionTime(assertion({
			time_start: '建安十三年',
			time_end: '建安十八年'
		}))).toBe('建安十三年 – 建安十八年');

		expect(formatAssertionTime(assertion({
			time_start: '建安十三年'
		}))).toBe('建安十三年');

		expect(formatAssertionTime(assertion({
			time_not_before: '前453年',
			time_not_after: '前450年'
		}))).toBe('前453年 … 前450年');
	});
});
