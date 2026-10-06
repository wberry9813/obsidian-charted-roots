import type {
	TemporalCertainty,
	TemporalPrecision
} from './types';

export interface SchemaValidationResult {
	valid: boolean;
	errors: string[];
}

const TEMPORAL_PRECISIONS = new Set<TemporalPrecision>([
	'day',
	'month',
	'year',
	'decade',
	'unknown'
]);

const TEMPORAL_CERTAINTIES = new Set<TemporalCertainty>([
	'certain',
	'approximate',
	'inferred',
	'uncertain',
	'disputed',
	'unknown'
]);

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function validateOptionalString(
	record: Record<string, unknown>,
	key: string,
	errors: string[]
): void {
	const value = record[key];
	if (value !== undefined && typeof value !== 'string') {
		errors.push(`${key} must be a string when present.`);
	}
}

function validateOptionalEnum(
	record: Record<string, unknown>,
	key: string,
	allowed: ReadonlySet<string>,
	errors: string[]
): void {
	const value = record[key];
	if (value !== undefined && (typeof value !== 'string' || !allowed.has(value))) {
		errors.push(`${key} has an unsupported value.`);
	}
}

/**
 * Validate structural v2 Assertion invariants.
 *
 * Ontology applicability and referenced-entity existence are intentionally
 * deferred to the semantic linter because they require vault/index context.
 */
export function validateAssertionShape(
	assertion: Record<string, unknown>
): SchemaValidationResult {
	const errors: string[] = [];

	if (assertion.cr_schema !== 2) {
		errors.push('Assertion must use cr_schema: 2.');
	}
	if (assertion.cr_type !== 'assertion') {
		errors.push('Assertion must use cr_type: assertion.');
	}
	if (!isNonEmptyString(assertion.cr_id)) {
		errors.push('Assertion requires cr_id.');
	}
	if (!isNonEmptyString(assertion.assertion_type)) {
		errors.push('Assertion requires assertion_type.');
	}
	if (!isNonEmptyString(assertion.subject)) {
		errors.push('Assertion requires subject.');
	}
	if (!isNonEmptyString(assertion.predicate)) {
		errors.push('Assertion requires predicate.');
	}

	const hasObject = assertion.object !== undefined;
	const hasValue = assertion.value !== undefined;

	if (hasObject === hasValue) {
		errors.push('Assertion requires exactly one of object or value.');
	}

	if (hasObject && !isNonEmptyString(assertion.object)) {
		errors.push('Assertion object must be a non-empty wikilink/reference string.');
	}

	if (
		hasValue
		&& typeof assertion.value !== 'string'
		&& typeof assertion.value !== 'number'
		&& typeof assertion.value !== 'boolean'
	) {
		errors.push('Assertion value must be a string, number, or boolean.');
	}

	for (const key of [
		'time_start',
		'time_end',
		'time_not_before',
		'time_not_after',
		'confidence',
		'research_status',
		'notes'
	]) {
		validateOptionalString(assertion, key, errors);
	}

	validateOptionalEnum(assertion, 'time_start_precision', TEMPORAL_PRECISIONS, errors);
	validateOptionalEnum(assertion, 'time_end_precision', TEMPORAL_PRECISIONS, errors);
	validateOptionalEnum(assertion, 'time_start_certainty', TEMPORAL_CERTAINTIES, errors);
	validateOptionalEnum(assertion, 'time_end_certainty', TEMPORAL_CERTAINTIES, errors);

	return {
		valid: errors.length === 0,
		errors
	};
}
