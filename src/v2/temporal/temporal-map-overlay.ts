import type {
	TemporalPlaceStateEntry,
	TemporalPlaceStateSnapshot
} from './temporal-place-state-service';

export interface TemporalMapOverlayContext {
	crs: 'geographic' | 'pixel';
	activeMapId: string;
	universe?: string;
}

export interface TemporalMapOverlayMarker {
	state: 'active' | 'possible';
	assertionId: string;
	predicate: string;
	subject: string;
	placeCrId: string;
	placeName: string;
	placeFilePath: string;
	universe?: string;
	coordinate:
		| {
			kind: 'geographic';
			lat: number;
			long: number;
		}
		| {
			kind: 'pixel';
			x: number;
			y: number;
			mapId: string;
		};
}

function universeMatches(
	entry: TemporalPlaceStateEntry,
	context: TemporalMapOverlayContext
): boolean {
	if (!context.universe) return true;
	return entry.universe === context.universe;
}

function toMarker(
	entry: TemporalPlaceStateEntry,
	context: TemporalMapOverlayContext
): TemporalMapOverlayMarker | null {
	if (!universeMatches(entry, context) || !entry.coordinate) {
		return null;
	}

	if (
		context.crs === 'geographic'
		&& entry.coordinate.kind === 'geographic'
	) {
		return {
			state: entry.state,
			assertionId: entry.assertionId,
			predicate: entry.predicate,
			subject: entry.subject,
			placeCrId: entry.placeCrId,
			placeName: entry.placeName,
			placeFilePath: entry.placeFilePath,
			universe: entry.universe,
			coordinate: entry.coordinate
		};
	}

	if (
		context.crs === 'pixel'
		&& entry.coordinate.kind === 'pixel'
	) {
		const assignedMaps = new Set([
			...(entry.coordinate.map ? [entry.coordinate.map] : []),
			...(entry.placeMaps ?? [])
		]);
		if (!assignedMaps.has(context.activeMapId)) {
			return null;
		}

		return {
			state: entry.state,
			assertionId: entry.assertionId,
			predicate: entry.predicate,
			subject: entry.subject,
			placeCrId: entry.placeCrId,
			placeName: entry.placeName,
			placeFilePath: entry.placeFilePath,
			universe: entry.universe,
			coordinate: {
				kind: 'pixel',
				x: entry.coordinate.x,
				y: entry.coordinate.y,
				mapId: context.activeMapId
			}
		};
	}

	return null;
}

/**
 * Renderer-neutral projection of temporal place state into the coordinates
 * valid for the currently active Map surface.
 *
 * Geographic and pixel coordinates never cross CRS boundaries. Pixel places
 * also require explicit assignment to the active map so a coordinate from one
 * fictional map cannot leak onto another.
 */
export function buildTemporalMapOverlay(
	snapshot: TemporalPlaceStateSnapshot,
	context: TemporalMapOverlayContext
): TemporalMapOverlayMarker[] {
	return [
		...snapshot.active,
		...snapshot.possible
	]
		.map(entry => toMarker(entry, context))
		.filter((entry): entry is TemporalMapOverlayMarker => Boolean(entry));
}
