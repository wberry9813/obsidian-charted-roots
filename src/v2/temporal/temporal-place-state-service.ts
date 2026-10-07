import type { OntologyRegistry } from '../ontology-registry';
import type { TemporalGroupingRef, TemporalItem } from './types';
import type {
	TemporalAssertionRangeSnapshot,
	TemporalAssertionStateEntry,
	TemporalAssertionStateSnapshot
} from './temporal-assertion-state-service';
import type { TimelineDomain, TimelineItemFilter } from './index';

export interface TemporalPlaceLookupNode {
	id: string;
	name: string;
	filePath: string;
	universe?: string;
	coordinates?: {
		lat: number;
		long: number;
	};
	customCoordinates?: {
		x: number;
		y: number;
		map?: string;
	};
	maps?: string[];
}

export interface TemporalPlaceLookup {
	getPlaceByCrId(crId: string): TemporalPlaceLookupNode | undefined;
}

export interface TemporalAssertionStateReader {
	getAt(
		position: number,
		filter?: TimelineItemFilter
	): TemporalAssertionStateSnapshot;
	getRange(
		range: TimelineDomain,
		filter?: TimelineItemFilter
	): TemporalAssertionRangeSnapshot;
}

export type TemporalPlaceCoordinate =
	| {
		kind: 'geographic';
		lat: number;
		long: number;
	}
	| {
		kind: 'pixel';
		x: number;
		y: number;
		map?: string;
	};

export interface TemporalPlaceStateEntry {
	state: 'active' | 'possible';
	assertionId: string;
	predicate: string;
	subject: string;
	placeReference: string;
	placeCrId: string;
	placeName: string;
	placeFilePath: string;
	universe?: string;
	placeMaps?: string[];
	coordinate?: TemporalPlaceCoordinate;
	item: TemporalItem;
}

export interface TemporalPlaceStateSnapshot {
	active: TemporalPlaceStateEntry[];
	possible: TemporalPlaceStateEntry[];
}

function placeGroupFor(
	entry: TemporalAssertionStateEntry
): TemporalGroupingRef | undefined {
	return entry.item.groups.find(group => group.kind === 'place');
}

function coordinateFor(
	place: TemporalPlaceLookupNode
): TemporalPlaceCoordinate | undefined {
	if (
		place.coordinates
		&& Number.isFinite(place.coordinates.lat)
		&& Number.isFinite(place.coordinates.long)
	) {
		return {
			kind: 'geographic',
			lat: place.coordinates.lat,
			long: place.coordinates.long
		};
	}

	if (
		place.customCoordinates
		&& Number.isFinite(place.customCoordinates.x)
		&& Number.isFinite(place.customCoordinates.y)
	) {
		return {
			kind: 'pixel',
			x: place.customCoordinates.x,
			y: place.customCoordinates.y,
			map: place.customCoordinates.map
		};
	}

	return undefined;
}

/**
 * Projects time-sliced v2 Assertion state into place-aware state for Map
 * consumers.
 *
 * Only ontology predicates that are explicitly temporal and declare
 * `place` in objectTypes are eligible. This prevents arbitrary Assertion
 * objects from being guessed as geographic data.
 */
export class TemporalPlaceStateService {
	constructor(
		private readonly assertionState: TemporalAssertionStateReader,
		private readonly ontology: OntologyRegistry,
		private readonly places: TemporalPlaceLookup
	) {}

	getAt(
		position: number,
		filter: TimelineItemFilter = {}
	): TemporalPlaceStateSnapshot {
		return this.project(
			this.assertionState.getAt(position, filter)
		);
	}

	getRange(
		range: TimelineDomain,
		filter: TimelineItemFilter = {}
	): TemporalPlaceStateSnapshot {
		return this.project(
			this.assertionState.getRange(range, filter)
		);
	}

	private project(
		snapshot: Pick<
			TemporalAssertionStateSnapshot,
			'active' | 'possible'
		>
	): TemporalPlaceStateSnapshot {
		return {
			active: this.projectEntries(snapshot.active),
			possible: this.projectEntries(snapshot.possible)
		};
	}

	private projectEntries(
		entries: TemporalAssertionStateEntry[]
	): TemporalPlaceStateEntry[] {
		const result: TemporalPlaceStateEntry[] = [];

		for (const entry of entries) {
			const predicate = this.ontology.getPredicate(entry.predicate);
			if (
				!predicate?.temporal
				|| !predicate.objectTypes?.includes('place')
			) {
				continue;
			}

			const placeGroup = placeGroupFor(entry);
			if (!placeGroup?.crId) continue;

			const place = this.places.getPlaceByCrId(placeGroup.crId);
			if (!place) continue;

			result.push({
				state: entry.state,
				assertionId: entry.id,
				predicate: entry.predicate,
				subject: entry.subject,
				placeReference: entry.object ?? placeGroup.reference,
				placeCrId: place.id,
				placeName: place.name,
				placeFilePath: place.filePath,
				universe: place.universe,
				placeMaps: place.maps,
				coordinate: coordinateFor(place),
				item: entry.item
			});
		}

		return result;
	}
}
