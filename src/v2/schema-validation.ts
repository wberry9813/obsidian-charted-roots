import type { AssertionFrontmatter } from './types';

export interface SchemaValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validate invariants that are structural rather than ontology-specific.
 * Entity existence/type validation belongs to the semantic index/linter.
 */
export function validateAssertionShape(
	assertion: Partial<AssertionFrontmatter>
): SchemaValidationResult {
	const errors: string[] = [];

	if (assertion.cr_schema !== 2) {
		errors.push('Assertion must use cr_schema: 2.');
	}
	if (assertion.cr_type !== 'assertion') {
		errors.push('Assertion must use cr_type: assertion.');
	}
	if (!assertion.cr_id) {
		errors.push('Assertion requires cr_id.');
	}
	if (!assertion.assertion_type) {
		errors.push('Assertion requires assertion_type.');
	}
	if (!assertion.subject) {
		errors.push('Assertion requires subject.');
	}
	if (!assertion.predicate) {
		errors.push('Assertion requires predicate.');
	}

	const hasObject = assertion.object !== undefined && assertion.object !== '';
	const hasValue = assertion.value !== undefined;

	if (hasObject === hasValue) {
		errors.push('Assertion requires exactly one of object or value.');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
