import { describe, expect, it } from 'vitest';
import {
	OntologyRegistry,
	TemporalInstitutionStateService,
	type TemporalAssertionStateEntry,
	type TemporalAssertionStateSnapshot,
	type TemporalGroupingRef,
	type TemporalItem
} from '../src/v2';

function group(
	kind: 'person' | 'organization' | 'office',
	id: string,
	reference: string
): TemporalGroupingRef {
	return {
		kind,
		key: `${kind}:crid:${id}`,
		label: id,
		reference,
		crId: id,
		filePath: `${kind}/${id}.md`
	};
}

function item(
	id: string,
	predicate: string,
	subject: string,
	object: string,
	groups: TemporalGroupingRef[]
): TemporalItem {
	return {
		id,
		kind: 'assertion',
		file: { path: `${id}.md`, basename: id } as never,
		filePath: `${id}.md`,
		title: id,
		typeId: 'relationship',
		predicate,
		subject,
		object,
		groups,
		status: 'resolved',
		source: 'v2'
	};
}

function entry(
	id: string,
	predicate: string,
	subjectGroup: TemporalGroupingRef,
	objectGroup: TemporalGroupingRef,
	state: 'active' | 'possible' = 'active'
): TemporalAssertionStateEntry {
	return {
		state,
		item: item(
			id,
			predicate,
			subjectGroup.reference,
			objectGroup.reference,
			[subjectGroup, objectGroup]
		),
		id,
		subject: subjectGroup.reference,
		predicate,
		object: objectGroup.reference
	};
}

function snapshot(
	active: TemporalAssertionStateEntry[],
	possible: TemporalAssertionStateEntry[] = []
): TemporalAssertionStateSnapshot {
	return { position: 1, active, possible };
}

function registry(): OntologyRegistry {
	const value = new OntologyRegistry();
	for (const definition of [
		{
			id: 'custom_affiliation',
			subjectTypes: ['person'],
			objectTypes: ['organization'],
			temporal: true
		},
		{
			id: 'custom_office',
			subjectTypes: ['person'],
			objectTypes: ['office'],
			temporal: true
		},
		{
			id: 'custom_org_relation',
			subjectTypes: ['organization'],
			objectTypes: ['organization'],
			temporal: true
		},
		{
			id: 'static_affiliation',
			subjectTypes: ['person'],
			objectTypes: ['organization'],
			temporal: false
		}
	] as const) {
		value.registerPredicate({
			kind: 'predicate',
			labels: { en: definition.id },
			pack: 'test',
			builtIn: true,
			...definition
		});
	}
	return value;
}

describe('TemporalInstitutionStateService', () => {
	it('classifies custom temporal predicates by resolved entity types', () => {
		const person = group('person', 'p', '[[People/P|P]]');
		const orgA = group('organization', 'a', '[[Organizations/A|A]]');
		const orgB = group('organization', 'b', '[[Organizations/B|B]]');
		const office = group('office', 'o', '[[Offices/O|O]]');
		const reader = {
			getAt: () => snapshot([
				entry('affiliation', 'custom_affiliation', person, orgA),
				entry('office', 'custom_office', person, office),
				entry('org-relation', 'custom_org_relation', orgA, orgB)
			]),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [],
				possible: []
			})
		};
		const service = new TemporalInstitutionStateService(
			reader,
			registry()
		);

		expect(service.getAt(1).active.map(value => value.relationKind)).toEqual([
			'affiliation',
			'office_holding',
			'organization_relation'
		]);
	});

	it('keeps active and possible institutional state separate', () => {
		const person = group('person', 'p', '[[People/P|P]]');
		const org = group('organization', 'a', '[[Organizations/A|A]]');
		const reader = {
			getAt: () => snapshot(
				[entry('active', 'custom_affiliation', person, org)],
				[entry('possible', 'custom_affiliation', person, org, 'possible')]
			),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [],
				possible: []
			})
		};
		const service = new TemporalInstitutionStateService(
			reader,
			registry()
		);

		const result = service.getAt(1);
		expect(result.active.map(value => value.assertionId)).toEqual(['active']);
		expect(result.possible.map(value => value.assertionId)).toEqual(['possible']);
	});

	it('drops non-temporal and ontology/type mismatches', () => {
		const person = group('person', 'p', '[[People/P|P]]');
		const org = group('organization', 'a', '[[Organizations/A|A]]');
		const reader = {
			getAt: () => snapshot([
				entry('static', 'static_affiliation', person, org),
				entry('wrong-shape', 'custom_office', person, org)
			]),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [],
				possible: []
			})
		};
		const service = new TemporalInstitutionStateService(
			reader,
			registry()
		);

		expect(service.getAt(1)).toEqual({ active: [], possible: [] });
	});

	it('drops unresolved object links instead of guessing from ontology labels', () => {
		const person = group('person', 'p', '[[People/P|P]]');
		const unresolvedObject = '[[Organizations/Missing|Missing]]';
		const assertionItem = item(
			'missing',
			'custom_affiliation',
			person.reference,
			unresolvedObject,
			[person]
		);
		const reader = {
			getAt: () => snapshot([{
				state: 'active' as const,
				item: assertionItem,
				id: 'missing',
				subject: person.reference,
				predicate: 'custom_affiliation',
				object: unresolvedObject
			}]),
			getRange: () => ({
				range: { start: 1, endExclusive: 2 },
				active: [],
				possible: []
			})
		};
		const service = new TemporalInstitutionStateService(
			reader,
			registry()
		);

		expect(service.getAt(1)).toEqual({ active: [], possible: [] });
	});
});
