import type {
	DefinitionPack,
	PredicateDefinition,
	TypeDefinition,
	TypeKind
} from './types';

const TYPE_ID_PATTERN = /^[a-z][a-z0-9_]*$/;

function assertDefinitionBase(definition: TypeDefinition): void {
	if (!TYPE_ID_PATTERN.test(definition.id)) {
		throw new Error(`Invalid ontology id "${definition.id}". Use lowercase snake_case.`);
	}
	if (!definition.pack.trim()) {
		throw new Error(`Ontology definition "${definition.id}" is missing a pack id.`);
	}
	if (Object.keys(definition.labels).length === 0) {
		throw new Error(`Ontology definition "${definition.id}" requires at least one label.`);
	}
}

export interface OntologyValidationIssue {
	severity: 'error' | 'warning';
	code: string;
	message: string;
	definitionId?: string;
}

function localizedValue(
	values: Record<string, string> | undefined,
	locale: string,
	fallbackLocale = 'en'
): string | undefined {
	if (!values) return undefined;
	return values[locale]
		?? values[fallbackLocale]
		?? values['zh-CN']
		?? Object.values(values)[0];
}

/**
 * Registry for extensible ontology definitions.
 *
 * Definitions are keyed by (kind, id), allowing the same id to exist in
 * different namespaces without collisions.
 */
export class OntologyRegistry {
	private readonly definitions = new Map<string, TypeDefinition>();
	private readonly predicates = new Map<string, PredicateDefinition>();
	private readonly packs = new Set<string>();

	private key(kind: TypeKind, id: string): string {
		return `${kind}:${id}`;
	}

	registerType(definition: TypeDefinition, replace = false): void {
		assertDefinitionBase(definition);
		const key = this.key(definition.kind, definition.id);
		if (!replace && this.definitions.has(key)) {
			throw new Error(`Ontology definition already registered: ${key}`);
		}
		this.definitions.set(key, definition);
		this.packs.add(definition.pack);
	}

	registerPredicate(definition: PredicateDefinition, replace = false): void {
		assertDefinitionBase(definition);
		if (definition.subjectTypes.length === 0) {
			throw new Error(`Predicate "${definition.id}" requires at least one subject type.`);
		}
		if (!replace && this.predicates.has(definition.id)) {
			throw new Error(`Predicate already registered: ${definition.id}`);
		}
		this.predicates.set(definition.id, definition);
		this.packs.add(definition.pack);
	}

	registerPack(pack: DefinitionPack, replace = false): void {
		if (!pack.id.trim()) {
			throw new Error('Definition pack id must not be empty.');
		}
		for (const definition of pack.types ?? []) {
			if (definition.pack !== pack.id) {
				throw new Error(
					`Definition "${definition.id}" declares pack "${definition.pack}" but was registered through "${pack.id}".`
				);
			}
			this.registerType(definition, replace);
		}
		for (const predicate of pack.predicates ?? []) {
			if (predicate.pack !== pack.id) {
				throw new Error(
					`Predicate "${predicate.id}" declares pack "${predicate.pack}" but was registered through "${pack.id}".`
				);
			}
			this.registerPredicate(predicate, replace);
		}
		this.packs.add(pack.id);
	}

	getType(kind: TypeKind, id: string): TypeDefinition | undefined {
		return this.definitions.get(this.key(kind, id));
	}

	getPredicate(id: string): PredicateDefinition | undefined {
		return this.predicates.get(id);
	}

	hasType(kind: TypeKind, id: string): boolean {
		return this.definitions.has(this.key(kind, id));
	}

	hasPredicate(id: string): boolean {
		return this.predicates.has(id);
	}

	listTypes(kind?: TypeKind): TypeDefinition[] {
		const values = [...this.definitions.values()];
		return kind ? values.filter(definition => definition.kind === kind) : values;
	}

	listPredicates(): PredicateDefinition[] {
		return [...this.predicates.values()];
	}

	listPacks(): string[] {
		return [...this.packs.values()];
	}

	getTypeLabel(kind: TypeKind, id: string, locale: string, fallbackLocale = 'en'): string {
		const definition = this.getType(kind, id);
		return localizedValue(definition?.labels, locale, fallbackLocale) ?? id;
	}

	getPredicateLabel(id: string, locale: string, fallbackLocale = 'en'): string {
		const definition = this.getPredicate(id);
		return localizedValue(definition?.labels, locale, fallbackLocale) ?? id;
	}

	getTypeDescription(
		kind: TypeKind,
		id: string,
		locale: string,
		fallbackLocale = 'en'
	): string | undefined {
		return localizedValue(this.getType(kind, id)?.descriptions, locale, fallbackLocale);
	}

	getAliases(kind: TypeKind, id: string, locale: string): string[] {
		const aliases = this.getType(kind, id)?.aliases;
		if (!aliases) return [];
		return aliases[locale] ?? [];
	}

	isPredicateApplicable(id: string, subjectType: string, objectType?: string): boolean {
		const predicate = this.getPredicate(id);
		if (!predicate || !predicate.subjectTypes.includes(subjectType)) return false;
		if (!objectType || !predicate.objectTypes || predicate.objectTypes.length === 0) return true;
		return predicate.objectTypes.includes(objectType);
	}

	/**
	 * Validate cross-definition invariants after all desired packs are loaded.
	 * Registration validates local shape; this validates references between
	 * predicates without making pack registration order significant.
	 */
	validate(): OntologyValidationIssue[] {
		const issues: OntologyValidationIssue[] = [];

		for (const definition of this.definitions.values()) {
			for (const [locale, label] of Object.entries(definition.labels)) {
				if (!locale.trim() || !label.trim()) {
					issues.push({
						severity: 'error',
						code: 'empty_localized_label',
						definitionId: definition.id,
						message: `Definition "${definition.id}" contains an empty locale or label.`
					});
				}
			}
		}

		for (const predicate of this.predicates.values()) {
			if (new Set(predicate.subjectTypes).size !== predicate.subjectTypes.length) {
				issues.push({
					severity: 'warning',
					code: 'duplicate_subject_type',
					definitionId: predicate.id,
					message: `Predicate "${predicate.id}" contains duplicate subject types.`
				});
			}

			if (
				predicate.objectTypes
				&& new Set(predicate.objectTypes).size !== predicate.objectTypes.length
			) {
				issues.push({
					severity: 'warning',
					code: 'duplicate_object_type',
					definitionId: predicate.id,
					message: `Predicate "${predicate.id}" contains duplicate object types.`
				});
			}

			if (!predicate.inverse) continue;

			const inverse = this.predicates.get(predicate.inverse);
			if (!inverse) {
				issues.push({
					severity: 'error',
					code: 'missing_inverse_predicate',
					definitionId: predicate.id,
					message: `Predicate "${predicate.id}" references missing inverse "${predicate.inverse}".`
				});
				continue;
			}

			if (inverse.inverse !== predicate.id) {
				issues.push({
					severity: 'error',
					code: 'nonreciprocal_inverse_predicate',
					definitionId: predicate.id,
					message: `Predicate "${predicate.id}" and inverse "${inverse.id}" must reference each other.`
				});
			}

			if (predicate.symmetric && predicate.inverse !== predicate.id) {
				issues.push({
					severity: 'warning',
					code: 'symmetric_predicate_with_distinct_inverse',
					definitionId: predicate.id,
					message: `Symmetric predicate "${predicate.id}" normally should not declare a distinct inverse.`
				});
			}
		}

		return issues;
	}
}
