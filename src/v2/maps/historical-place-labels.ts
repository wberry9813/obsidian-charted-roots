import type { MapData } from '../../maps/types/map-types';
import type {
	PlaceDesignationPointSnapshot,
	PlaceDesignationRangeSnapshot
} from './place-designation-service';

type PlaceDesignationSnapshot =
	| PlaceDesignationPointSnapshot
	| PlaceDesignationRangeSnapshot;

export function selectFocusedHistoricalPlaceName(
	snapshot: PlaceDesignationSnapshot | undefined
): string | undefined {
	if (!snapshot) return undefined;
	const names = [...new Set(
		snapshot.active
			.filter(entry => entry.designationType === 'historical_name')
			.map(entry => entry.name.trim())
			.filter(Boolean)
	)];
	return names.length === 1 ? names[0] : undefined;
}

/**
 * Produce a display-only MapData projection for one shared temporal focus.
 *
 * The input object is never mutated. Only surfaces that carry a stable
 * placeId are renamed; legacy migration-path endpoints without place IDs are
 * deliberately left unchanged to avoid same-name collisions.
 */
export function applyFocusedHistoricalPlaceNames(
	data: MapData,
	snapshots: ReadonlyMap<string, PlaceDesignationSnapshot>
): MapData {
	const nameFor = (placeId: string | undefined): string | undefined =>
		placeId
			? selectFocusedHistoricalPlaceName(snapshots.get(placeId))
			: undefined;

	const markers = data.markers.map(marker => {
		const historical = nameFor(marker.placeId);
		return historical && historical !== marker.placeName
			? { ...marker, placeName: historical }
			: marker;
	});

	const placeMarkers = data.placeMarkers.map(marker => {
		const historical = nameFor(marker.placeId);
		return historical && historical !== marker.placeName
			? { ...marker, placeName: historical }
			: marker;
	});

	const journeyPaths = data.journeyPaths.map(journey => {
		let changed = false;
		const waypoints = journey.waypoints.map(waypoint => {
			const historical = nameFor(waypoint.placeId);
			if (!historical || historical === waypoint.name) return waypoint;
			changed = true;
			return { ...waypoint, name: historical };
		});
		return changed ? { ...journey, waypoints } : journey;
	});

	if (
		markers.every((marker, index) => marker === data.markers[index])
		&& placeMarkers.every((marker, index) => marker === data.placeMarkers[index])
		&& journeyPaths.every((journey, index) => journey === data.journeyPaths[index])
	) {
		return data;
	}

	return {
		...data,
		markers,
		placeMarkers,
		journeyPaths
	};
}
