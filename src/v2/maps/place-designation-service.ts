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

function collectMany(
	activeEntries: TemporalAssertionStateEntry[],
	possibleEntries: TemporalAssertionStateEntry[],
	placeCrIds: readonly string[]
): Map<string, { active: PlaceDesignationEntry[]; possible: PlaceDesignationEntry[] }> {
	const wanted = new Set(placeCrIds);
	const result = new Map<string, {
		active: PlaceDesignationEntry[];
		possible: PlaceDesignationEntry[];
	}>();
	for (const placeCrId of wanted) {
		result.set(placeCrId, { active: [], possible: [] });
	}

	const addEntries = (
		entries: TemporalAssertionStateEntry[],
		state: 'active' | 'possible'
	): void => {
		for (const entry of entries) {
			const designation = toDesignation(entry);
			if (!designation) continue;
			for (const group of entry.item.groups) {
				if (
					group.kind !== 'place'
					|| !group.crId
					|| !wanted.has(group.crId)
				) continue;
				result.get(group.crId)?.[state].push(designation);
			}
		}
	};

	addEntries(activeEntries, 'active');
	addEntries(possibleEntries, 'possible');
	return result;
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
		return this.getAtMany([placeCrId], position).get(placeCrId) ?? {
			position,
			active: [],
			possible: []
		};
	}

	getAtMany(
		placeCrIds: readonly string[],
		position: number
	): Map<string, PlaceDesignationPointSnapshot> {
		const snapshot: TemporalAssertionStateSnapshot =
			this.temporalAssertions.getAt(position, {
				predicates: ['has_designation']
			});
		const grouped = collectMany(
			snapshot.active,
			snapshot.possible,
			placeCrIds
		);
		return new Map(
			[...grouped.entries()].map(([placeCrId, state]) => [
				placeCrId,
				{
					position,
					active: state.active,
					possible: state.possible
				}
			])
		);
	}

	getRange(
		placeCrId: string,
		range: TimelineDomain
	): PlaceDesignationRangeSnapshot {
		return this.getRangeMany([placeCrId], range).get(placeCrId) ?? {
			range,
			active: [],
			possible: []
		};
	}

	getRangeMany(
		placeCrIds: readonly string[],
		range: TimelineDomain
	): Map<string, PlaceDesignationRangeSnapshot> {
		const snapshot: TemporalAssertionRangeSnapshot =
			this.temporalAssertions.getRange(range, {
				predicates: ['has_designation']
			});
		const grouped = collectMany(
			snapshot.active,
			snapshot.possible,
			placeCrIds
		);
		return new Map(
			[...grouped.entries()].map(([placeCrId, state]) => [
				placeCrId,
				{
					range,
					active: state.active,
					possible: state.possible
				}
			])
		);
	}
}
