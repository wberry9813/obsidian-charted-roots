import type { RelationshipTypeDefinition } from '../../relationships/types/relationship-types';
import { DEFAULT_RELATIONSHIP_TYPES } from '../../relationships/constants/default-relationship-types';
import type { PredicateDefinition } from '../types';

/**
 * Adapt the mature Charted Roots relationship vocabulary into v2 predicates.
 *
 * Stable relationship ids are deliberately preserved. Migration should not
 * rename a well-established machine id merely because v2 changes storage.
 */
export function relationshipTypeToV2Predicate(
	type: RelationshipTypeDefinition,
	pack = type.builtIn ? 'core' : 'vault-custom'
): PredicateDefinition {
	return {
		kind: 'predicate',
		id: type.id,
		labels: { en: type.name },
		descriptions: type.description ? { en: type.description } : undefined,
		category: type.category,
		pack,
		builtIn: type.builtIn,
		subjectTypes: ['person'],
		objectTypes: ['person'],
		// Legacy relationships already support from/to qualifiers. Keeping them
		// temporal in v2 preserves all existing information even for relations
		// that are usually treated as persistent.
		temporal: true,
		symmetric: type.symmetric,
		inverse: type.inverse,
		includeOnFamilyTree: type.includeOnFamilyTree,
		familyGraphMapping: type.familyGraphMapping
	};
}

/**
 * Built-in relationship predicates that can be reused directly by v2.
 * The spouse id is excluded because the core pack provides a richer localized
 * definition for that same stable id.
 */
export const LEGACY_BUILTIN_RELATIONSHIP_PREDICATES: PredicateDefinition[] =
	DEFAULT_RELATIONSHIP_TYPES
		.filter(type => type.id !== 'spouse')
		.map(type => relationshipTypeToV2Predicate(type, 'core'));
