import { describe, expect, it } from 'vitest';
import {
	buildTemporalMapOverlay,
	type TemporalPlaceStateSnapshot
} from '../src/v2';

function entry(
	id: string,
	state: 'active' | 'possible',
	coordinate:
		| { kind: 'geographic'; lat: number; long: number }
		| { kind: 'pixel'; x: number; y: number; map?: string },
	extra: { universe?: string; placeMaps?: string[] } = {}
) {
	return {
		state,
		assertionId: id,
		predicate: 'resides_at',
		subject: '[[Person]]',
		placeReference: '[[Place]]',
		placeCrId: id,
		placeName: id,
		placeFilePath: `Places/${id}.md`,
		coordinate,
		item: {} as never,
		...extra
	};
}

function snapshot(
	active: ReturnType<typeof entry>[],
	possible: ReturnType<typeof entry>[] = []
): TemporalPlaceStateSnapshot {
	return { active, possible };
}

describe('temporal map overlay projection', () => {
	it('keeps active and possible geographic markers distinct', () => {
		const result = buildTemporalMapOverlay(
			snapshot(
				[entry('a', 'active', { kind: 'geographic', lat: 34, long: 108 })],
				[entry('b', 'possible', { kind: 'geographic', lat: 35, long: 109 })]
			),
			{ crs: 'geographic', activeMapId: 'openstreetmap' }
		);

		expect(result.map(value => [value.placeCrId, value.state])).toEqual([
			['a', 'active'],
			['b', 'possible']
		]);
	});

	it('never coerces geographic coordinates onto pixel maps', () => {
		const result = buildTemporalMapOverlay(
			snapshot([
				entry('a', 'active', { kind: 'geographic', lat: 34, long: 108 })
			]),
			{ crs: 'pixel', activeMapId: 'shushan-map' }
		);

		expect(result).toEqual([]);
	});

	it('requires explicit pixel-map assignment', () => {
		const source = snapshot([
			entry('explicit', 'active', {
				kind: 'pixel',
				x: 120,
				y: 340,
				map: 'shushan-map'
			}),
			entry('maps-field', 'active', {
				kind: 'pixel',
				x: 10,
				y: 20
			}, {
				placeMaps: ['shushan-map']
			}),
			entry('unassigned', 'active', {
				kind: 'pixel',
				x: 1,
				y: 2
			}),
			entry('other-map', 'active', {
				kind: 'pixel',
				x: 3,
				y: 4,
				map: 'other-map'
			})
		]);

		expect(
			buildTemporalMapOverlay(
				source,
				{ crs: 'pixel', activeMapId: 'shushan-map' }
			).map(value => value.placeCrId)
		).toEqual(['explicit', 'maps-field']);
	});

	it('honors a universe-specific active map', () => {
		const source = snapshot([
			entry(
				'right',
				'active',
				{ kind: 'geographic', lat: 1, long: 2 },
				{ universe: 'History' }
			),
			entry(
				'wrong',
				'active',
				{ kind: 'geographic', lat: 3, long: 4 },
				{ universe: 'Fiction' }
			),
			entry(
				'unscoped',
				'active',
				{ kind: 'geographic', lat: 5, long: 6 }
			)
		]);

		expect(
			buildTemporalMapOverlay(
				source,
				{
					crs: 'geographic',
					activeMapId: 'history-map',
					universe: 'History'
				}
			).map(value => value.placeCrId)
		).toEqual(['right']);
	});
});
