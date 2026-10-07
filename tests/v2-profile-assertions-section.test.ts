import { describe, expect, it } from 'vitest';
import {
	formatAssertionTime,
	getMaterializedProfileAssertions,
	summarizeHistoricalNameFocus
} from '../src/profile-view/sections/assertions-section';
import {
	buildHistoricalNameAssertionData
} from '../src/profile-view/historical-name-modal';
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

	it('summarizes active historical names before possible names', () => {
		const item = {
			id: 'designation',
			kind: 'assertion',
			file: {} as never,
			filePath: 'Assertions/Designation.md',
			title: '长安',
			groups: [],
			status: 'resolved',
			source: 'v2'
		} as never;
		const entry = (state: 'active' | 'possible', name: string) => ({
			state,
			id: `${state}-${name}`,
			name,
			designationType: 'historical_name',
			item
		});

		expect(summarizeHistoricalNameFocus({
			active: [entry('active', '长安')],
			possible: [entry('possible', '京兆')]
		})).toEqual({
			state: 'active',
			names: ['长安']
		});

		expect(summarizeHistoricalNameFocus({
			active: [],
			possible: [entry('possible', '京兆')]
		})).toEqual({
			state: 'possible',
			names: ['京兆']
		});
	});

	it('builds a time-bounded designation Assertion without changing Place identity', () => {
		expect(buildHistoricalNameAssertionData(
			'[[History/Places/Xian|西安]]',
			'西安',
			{
				name: '长安',
				timeStart: 'BCE 202',
				timeEnd: '904 CE',
				source: '[[Sources/Book of Han]]'
			}
		)).toMatchObject({
			assertionType: 'designation',
			subject: '[[History/Places/Xian|西安]]',
			predicate: 'has_designation',
			value: '长安',
			timeStart: 'BCE 202',
			timeEnd: '904 CE',
			qualifiers: {
				designation_type: 'historical_name',
				source: '[[Sources/Book of Han]]'
			}
		});
	});
});
