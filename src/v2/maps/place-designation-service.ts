import type {
	TemporalAssertionRangeSnapshot,
	TemporalAssertionStateEntry,
	TemporalAssertionStateService,
	TemporalAssertionStateSnapshot
} from '../temporal/temporal-assertion-state-service';
import type { TimelineDomain } from '../temporal/timeline-model';
import type { TemporalItem } from '../temporal/types';

export interface PlaceDesignationEntry {
	state: 'active' | 'possible';
	id: string;
	name: string;
	designationType?: string;
	source?: string;
	item: TemporalItem;
}

export interface PlaceDesignationPointSnapshot {
	position: number;
	active: PlaceDesignationEntry[];
	possible: PlaceDesignationEntry[];
}

export interface PlaceDesignationRangeSnapshot {
	range: TimelineDomain;
	active: PlaceDesignationEntry[];
	possible: PlaceDesignationEntry[];
}

function isForPlaceCrId(
	entry: TemporalAssertionStateEntry,
	placeCrId: string
): boolean {
	return entry.item.groups.some(group =>
		group.kind === 'place' && group.crId === placeCrId
	);
}

function toDesignation(
	entry: TemporalAssertionStateEntry
): PlaceDesignationEntry | null {
	if (
		entry.predicate !== 'has_designation'
		|| typeof entry.value !== 'string'
		|| !entry.value.trim()
	) {
		return null;
	}
	const qualifiers = entry.item.qualifiers;
	return {
		state: entry.state,
		id: entry.id,
		name: entry.value.trim(),
		designationType: typeof qualifiers?.designation_type === 'string'
			? qualifiers.designation_type
			: undefined,
		source: typeof qualifiers?.source === 'string'
			? qualifiers.source
			: undefined,
		item: entry.item
	};
}

function collect(
	entries: TemporalAssertionStateEntry[],
	placeCrId: string
): PlaceDesignationEntry[] {
	return entries
		.filter(entry => isForPlaceCrId(entry, placeCrId))
		.map(toDesignation)
		.filter((entry): entry is PlaceDesignationEntry => entry !== null);
}

/**
 * Stable-identity read model for historical Place names.
 *
 * Place identity remains the Place note / cr_id. Time-bounded names are
 * designation Assertions and can change without renaming or duplicating the
 * underlying Place entity.
 */
export class PlaceDesignationService {
	constructor(
		private readonly temporalAssertions: TemporalAssertionStateService
	) {}

	getAt(placeCrId: string, position: number): PlaceDesignationPointSnapshot {
		const snapshot: TemporalAssertionStateSnapshot =
			this.temporalAssertions.getAt(position, {
				predicates: ['has_designation']
			});
		return {
			position,
			active: collect(snapshot.active, placeCrId),
			possible: collect(snapshot.possible, placeCrId)
		};
	}

	getRange(
		placeCrId: string,
		range: TimelineDomain
	): PlaceDesignationRangeSnapshot {
		const snapshot: TemporalAssertionRangeSnapshot =
			this.temporalAssertions.getRange(range, {
				predicates: ['has_designation']
			});
		return {
			range,
			active: collect(snapshot.active, placeCrId),
			possible: collect(snapshot.possible, placeCrId)
		};
	}
}
