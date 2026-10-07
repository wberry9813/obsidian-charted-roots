import { describe, expect, it } from 'vitest';
import {
	applyFocusedHistoricalPlaceNames,
	selectFocusedHistoricalPlaceName
} from '../src/v2';
import type {
	MapData,
	MapMarker,
	PlaceMarker,
	JourneyPath
} from '../src/maps/types/map-types';
import type {
	PlaceDesignationEntry,
	PlaceDesignationPointSnapshot
} from '../src/v2';

function snapshot(
	activeNames: string[],
	possibleNames: string[] = []
): PlaceDesignationPointSnapshot {
	const make = (
		state: 'active' | 'possible',
		name: string
	): PlaceDesignationEntry => ({
		state,
		id: `${state}-${name}`,
		name,
		designationType: 'historical_name',
		item: {
			id: `${state}-${name}`,
			kind: 'assertion',
			file: {} as never,
			filePath: 'Assertions/name.md',
			title: name,
			groups: [],
			status: 'resolved',
			source: 'v2'
		}
	});
	return {
		position: 1,
		active: activeNames.map(name => make('active', name)),
		possible: possibleNames.map(name => make('possible', name))
	};
}

function data(): MapData {
	const marker: MapMarker = {
		personId: 'person-a',
		personName: 'Person A',
		type: 'birth',
		lat: 34,
		lng: 108,
		placeId: 'place-xian',
		placeName: '西安'
	};
	const placeMarker: PlaceMarker = {
		placeId: 'place-xian',
		placeName: '西安',
		lat: 34,
		lng: 108
	};
	const journey: JourneyPath = {
		personId: 'person-a',
		personName: 'Person A',
		waypoints: [{
			lat: 34,
			lng: 108,
			name: '西安',
			placeId: 'place-xian',
			eventType: 'birth'
		}]
	};
	return {
		markers: [marker],
		placeMarkers: [placeMarker],
		paths: [{
			personId: 'person-a',
			personName: 'Person A',
			origin: { lat: 34, lng: 108, name: '西安' },
			destination: { lat: 35, lng: 109, name: '洛阳' }
		}],
		aggregatedPaths: [],
		journeyPaths: [journey],
		collections: [],
		universes: [],
		yearRange: { min: 1, max: 1 },
		customMaps: [],
		personLifeSpans: []
	};
}

describe('focused historical Place labels', () => {
	it('uses exactly one active historical name and never promotes possible-only names', () => {
		expect(selectFocusedHistoricalPlaceName(snapshot(['长安']))).toBe('长安');
		expect(selectFocusedHistoricalPlaceName(snapshot([], ['京兆']))).toBeUndefined();
		expect(selectFocusedHistoricalPlaceName(snapshot(['长安', '京兆']))).toBeUndefined();
	});

	it('renames stable-id marker surfaces without mutating canonical MapData', () => {
		const source = data();
		const result = applyFocusedHistoricalPlaceNames(
			source,
			new Map([['place-xian', snapshot(['长安'])]])
		);

		expect(result).not.toBe(source);
		expect(result.markers[0].placeName).toBe('长安');
		expect(result.placeMarkers[0].placeName).toBe('长安');
		expect(result.journeyPaths[0].waypoints[0].name).toBe('长安');
		expect(source.markers[0].placeName).toBe('西安');
		expect(source.placeMarkers[0].placeName).toBe('西安');
		expect(source.journeyPaths[0].waypoints[0].name).toBe('西安');

		// MigrationPath lacks stable place IDs, so do not guess by string name.
		expect(result.paths[0].origin.name).toBe('西安');
	});

	it('returns the original MapData when no unambiguous active rename applies', () => {
		const source = data();
		expect(applyFocusedHistoricalPlaceNames(
			source,
			new Map([['place-xian', snapshot([], ['长安'])]])
		)).toBe(source);
	});
});
