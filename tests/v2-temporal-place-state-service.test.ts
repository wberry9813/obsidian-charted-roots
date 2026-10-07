import { describe, expect, it } from 'vitest';
import {
	OntologyRegistry,
	TemporalPlaceStateService,
	type TemporalAssertionStateEntry,
	type TemporalAssertionStateSnapshot,
	type TemporalItem
} from '../src/v2';

function item(
	id: string,
	predicate: string,
	object: string,
	groups: TemporalItem['groups']
): TemporalItem {
	return {
		id,
		kind: 'assertion',
		file: { path: `${id}.md`, basename: id } as never,
		filePath: `${id}.md`,
		title: id,
		typeId: 'relationship',
		predicate,
		subject: '[[Subject]]',
		object,
		groups,
		status: 'resolved',
		source: 'v2'
	};
}

function entry(
	id: string,
	predicate: string,
	placeCrId: string,
	state: 'active' | 'possible' = 'active'
): TemporalAssertionStateEntry {
	return {
		state,
		item: item(
			id,
			predicate,
			'[[Places/X|X]]',
			[{
				kind: 'place',
				key: `place:crid:${placeCrId}`,
				label: 'X',
				reference: '[[Places/X|X]]',
				crId: placeCrId,
				filePath: 'Places/X.md'
			}]
		),
		id,
		subject: '[[Subject]]',
		predicate,
		object: '[[Places/X|X]]'
	};
}

function registry(): OntologyRegistry {
	const value = new OntologyRegistry();
	value.registerPredicate({
		kind: 'predicate',
		id: 'resides_at',
		labels: { en: 'Resides at' },
		pack: 'test',
		builtIn: true,
		subjectTypes: ['person'],
		objectTypes: ['place'],
		temporal: true
	});
	value.registerPredicate({
		kind: 'predicate',
		id: 'controls',
		labels: { en: 'Controls' },
		pack: 'test',
		builtIn: true,
		subjectTypes: ['organization'],
		objectTypes: ['place'],
		temporal: true
	});
	value.registerPredicate({
		kind: 'predicate',
		id: 'member_of',
		labels: { en: 'Member of' },
		pack: 'test',
		builtIn: true,
		subjectTypes: ['person'],
		objectTypes: ['organization'],
		temporal: true
	});
	value.registerPredicate({
		kind: 'predicate',
		id: 'born_at',
		labels: { en: 'Born at' },
		pack: 'test',
		builtIn: true,
		subjectTypes: ['person'],
		objectTypes: ['place'],
		temporal: false
	});
	return value;
}

function snapshot(
	active: TemporalAssertionStateEntry[],
	possible: TemporalAssertionStateEntry[] = []
): TemporalAssertionStateSnapshot {
	return {
		position: 1,
		active,
		possible
	};
}

describe('TemporalPlaceStateService', () => {
	it('projects only ontology-declared temporal place predicates', () => {
		const reader = {
			getAt: () => snapshot([
				entry('residence', 'resides_at', 'x'),
				entry('membership', 'member_of', 'x'),
				entry('birth', 'born_at', 'x')
			]),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [],
				possible: []
			})
		};
		const service = new TemporalPlaceStateService(
			reader,
			registry(),
			{
				getPlaceByCrId: crId => crId === 'x'
					? {
						id: 'x',
						name: 'X',
						filePath: 'Places/X.md',
						coordinates: { lat: 34.2, long: 108.9 }
					}
					: undefined
			}
		);

		const result = service.getAt(1);
		expect(result.active.map(value => value.assertionId)).toEqual([
			'residence'
		]);
		expect(result.active[0].coordinate).toEqual({
			kind: 'geographic',
			lat: 34.2,
			long: 108.9
		});
	});

	it('keeps active and possible place states separate', () => {
		const reader = {
			getAt: () => snapshot(
				[entry('control', 'controls', 'x')],
				[entry('possible-residence', 'resides_at', 'x', 'possible')]
			),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [],
				possible: []
			})
		};
		const service = new TemporalPlaceStateService(
			reader,
			registry(),
			{
				getPlaceByCrId: () => ({
					id: 'x',
					name: 'X',
					filePath: 'Places/X.md',
					coordinates: { lat: 1, long: 2 }
				})
			}
		);

		const result = service.getAt(1);
		expect(result.active.map(value => value.assertionId)).toEqual(['control']);
		expect(result.possible.map(value => value.assertionId)).toEqual([
			'possible-residence'
		]);
	});

	it('supports fictional pixel coordinates without coercing them to lat/lng', () => {
		const reader = {
			getAt: () => snapshot([entry('residence', 'resides_at', 'x')]),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [],
				possible: []
			})
		};
		const service = new TemporalPlaceStateService(
			reader,
			registry(),
			{
				getPlaceByCrId: () => ({
					id: 'x',
					name: 'X',
					filePath: 'Places/X.md',
					customCoordinates: {
						x: 120,
						y: 340,
						map: 'shushan'
					}
				})
			}
		);

		expect(service.getAt(1).active[0].coordinate).toEqual({
			kind: 'pixel',
			x: 120,
			y: 340,
			map: 'shushan'
		});
	});

	it('preserves place state without coordinates as unlocated data', () => {
		const reader = {
			getAt: () => snapshot([entry('residence', 'resides_at', 'x')]),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [],
				possible: []
			})
		};
		const service = new TemporalPlaceStateService(
			reader,
			registry(),
			{
				getPlaceByCrId: () => ({
					id: 'x',
					name: 'X',
					filePath: 'Places/X.md'
				})
			}
		);

		const [value] = service.getAt(1).active;
		expect(value.placeName).toBe('X');
		expect(value.coordinate).toBeUndefined();
	});

	it('drops unresolved place targets instead of guessing by label', () => {
		const reader = {
			getAt: () => snapshot([entry('residence', 'resides_at', 'missing')]),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [],
				possible: []
			})
		};
		const service = new TemporalPlaceStateService(
			reader,
			registry(),
			{ getPlaceByCrId: () => undefined }
		);

		expect(service.getAt(1)).toEqual({
			active: [],
			possible: []
		});
	});
});
