import type { OntologyRegistry } from '../ontology-registry';
import type {
	TemporalAssertionRangeSnapshot,
	TemporalAssertionStateEntry,
	TemporalAssertionStateSnapshot
} from './temporal-assertion-state-service';
import type { TimelineDomain, TimelineItemFilter } from './index';
import type {
	TemporalGroupingRef,
	TemporalItem
} from './types';

export type TemporalInstitutionRelationKind =
	| 'affiliation'
	| 'office_holding'
	| 'organization_relation';

export interface TemporalInstitutionEntityRef {
	kind: 'person' | 'organization' | 'office';
	key: string;
	label: string;
	reference: string;
	crId?: string;
	filePath?: string;
}

export interface TemporalInstitutionStateEntry {
	state: 'active' | 'possible';
	relationKind: TemporalInstitutionRelationKind;
	assertionId: string;
	predicate: string;
	subject: TemporalInstitutionEntityRef;
	object: TemporalInstitutionEntityRef;
	item: TemporalItem;
}

export interface TemporalInstitutionStateSnapshot {
	active: TemporalInstitutionStateEntry[];
	possible: TemporalInstitutionStateEntry[];
}

export interface TemporalInstitutionAssertionReader {
	getAt(
		position: number,
		filter?: TimelineItemFilter
	): TemporalAssertionStateSnapshot;
	getRange(
		range: TimelineDomain,
		filter?: TimelineItemFilter
	): TemporalAssertionRangeSnapshot;
}

function groupForReference(
	entry: TemporalAssertionStateEntry,
	reference: string | undefined
): TemporalGroupingRef | undefined {
	if (!reference) return undefined;
	return entry.item.groups.find(group => group.reference === reference);
}

function asInstitutionEntity(
	group: TemporalGroupingRef | undefined
): TemporalInstitutionEntityRef | undefined {
	if (
		!group
		|| (
			group.kind !== 'person'
			&& group.kind !== 'organization'
			&& group.kind !== 'office'
		)
	) {
		return undefined;
	}
	return {
		kind: group.kind,
		key: group.key,
		label: group.label,
		reference: group.reference,
		crId: group.crId,
		filePath: group.filePath
	};
}

function relationKindFor(
	subject: TemporalInstitutionEntityRef,
	object: TemporalInstitutionEntityRef
): TemporalInstitutionRelationKind | null {
	if (subject.kind === 'person' && object.kind === 'organization') {
		return 'affiliation';
	}
	if (subject.kind === 'person' && object.kind === 'office') {
		return 'office_holding';
	}
	if (subject.kind === 'organization' && object.kind === 'organization') {
		return 'organization_relation';
	}
	return null;
}

/**
 * Ontology-safe projection of time-sliced Assertions into institutional state.
 *
 * The service classifies by the resolved subject/object entity types and also
 * verifies those types are allowed by the predicate definition. Custom packs
 * therefore participate automatically when they declare compatible temporal
 * predicates; unresolved links are dropped instead of guessed by label.
 */
export class TemporalInstitutionStateService {
	constructor(
		private readonly assertionState: TemporalInstitutionAssertionReader,
		private readonly ontology: OntologyRegistry
	) {}

	getAt(
		position: number,
		filter: TimelineItemFilter = {}
	): TemporalInstitutionStateSnapshot {
		return this.project(this.assertionState.getAt(position, filter));
	}

	getRange(
		range: TimelineDomain,
		filter: TimelineItemFilter = {}
	): TemporalInstitutionStateSnapshot {
		return this.project(this.assertionState.getRange(range, filter));
	}

	private project(
		snapshot: Pick<
			TemporalAssertionStateSnapshot,
			'active' | 'possible'
		>
	): TemporalInstitutionStateSnapshot {
		return {
			active: this.projectEntries(snapshot.active),
			possible: this.projectEntries(snapshot.possible)
		};
	}

	private projectEntries(
		entries: TemporalAssertionStateEntry[]
	): TemporalInstitutionStateEntry[] {
		const result: TemporalInstitutionStateEntry[] = [];

		for (const entry of entries) {
			const predicate = this.ontology.getPredicate(entry.predicate);
			if (!predicate?.temporal || !entry.object) continue;

			const subject = asInstitutionEntity(
				groupForReference(entry, entry.subject)
			);
			const object = asInstitutionEntity(
				groupForReference(entry, entry.object)
			);
			if (!subject || !object) continue;

			if (
				!predicate.subjectTypes.includes(subject.kind)
				|| !predicate.objectTypes?.includes(object.kind)
			) {
				continue;
			}

			const relationKind = relationKindFor(subject, object);
			if (!relationKind) continue;

			result.push({
				state: entry.state,
				relationKind,
				assertionId: entry.id,
				predicate: entry.predicate,
				subject,
				object,
				item: entry.item
			});
		}

		return result;
	}
}
