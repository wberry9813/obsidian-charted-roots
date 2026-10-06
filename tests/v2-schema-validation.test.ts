import { describe, expect, it } from 'vitest';
import { validateAssertionShape } from '../src/v2';

describe('v2 assertion schema invariants', () => {
	const base = {
		cr_schema: 2 as const,
		cr_type: 'assertion' as const,
		cr_id: 'assertion-1',
		assertion_type: 'relationship',
		subject: '[[李世民]]',
		predicate: 'political_rival'
	};

	it('accepts an entity-object assertion', () => {
		const result = validateAssertionShape({
			...base,
			object: '[[李建成]]'
		});

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
	});

	it('accepts a literal-value assertion', () => {
		const result = validateAssertionShape({
			...base,
			assertion_type: 'designation',
			predicate: 'has_designation',
			value: '武皇帝'
		});

		expect(result.valid).toBe(true);
	});

	it('rejects assertions with neither object nor value', () => {
		const result = validateAssertionShape(base);

		expect(result.valid).toBe(false);
		expect(result.errors).toContain('Assertion requires exactly one of object or value.');
	});

	it('rejects assertions with both object and value', () => {
		const result = validateAssertionShape({
			...base,
			object: '[[李建成]]',
			value: 'duplicate target'
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toContain('Assertion requires exactly one of object or value.');
	});

	it('reports missing structural fields', () => {
		const result = validateAssertionShape({
			cr_schema: 1 as never,
			cr_type: 'event' as never
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toContain('Assertion must use cr_schema: 2.');
		expect(result.errors).toContain('Assertion must use cr_type: assertion.');
		expect(result.errors).toContain('Assertion requires cr_id.');
		expect(result.errors).toContain('Assertion requires assertion_type.');
		expect(result.errors).toContain('Assertion requires subject.');
		expect(result.errors).toContain('Assertion requires predicate.');
	});
	it('rejects unsupported temporal precision/certainty values', () => {
		const result = validateAssertionShape({
			...base,
			object: '[[李建成]]',
			time_start_precision: 'estimated' as never,
			time_start_certainty: 'exact' as never
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toContain('time_start_precision has an unsupported value.');
		expect(result.errors).toContain('time_start_certainty has an unsupported value.');
	});

	it('rejects non-string entity references', () => {
		const result = validateAssertionShape({
			...base,
			object: 42 as never
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toContain('Assertion object must be a non-empty wikilink/reference string.');
	});

});
