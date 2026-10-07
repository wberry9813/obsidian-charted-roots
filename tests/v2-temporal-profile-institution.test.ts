import { describe, expect, it } from 'vitest';
import {
	getTemporalInstitutionEntriesForEntity
} from '../src/profile-view/sections/temporal-institution-section';
import type {
	TemporalInstitutionStateEntry,
	TemporalInstitutionStateSnapshot
} from '../src/v2';

function entry(
	id: string,
	subjectId: string,
	objectId: string,
	state: 'active' | 'possible'
): TemporalInstitutionStateEntry {
	return {
		state,
		relationKind: 'affiliation',
		assertionId: id,
		predicate: 'member_of',
		subject: {
			kind: 'person',
			key: `person:crid:${subjectId}`,
			label: subjectId,
			reference: `[[${subjectId}]]`,
			crId: subjectId,
			filePath: `People/${subjectId}.md`
		},
		object: {
			kind: 'organization',
			key: `organization:crid:${objectId}`,
			label: objectId,
			reference: `[[${objectId}]]`,
			crId: objectId,
			filePath: `Organizations/${objectId}.md`
		},
		item: {} as never
	};
}

function snapshot(): TemporalInstitutionStateSnapshot {
	return {
		active: [
			entry('a1', 'person-a', 'org-a', 'active'),
			entry('a2', 'person-b', 'org-a', 'active')
		],
		possible: [
			entry('p1', 'person-a', 'org-b', 'possible')
		]
	};
}

describe('temporal institutional profile projection', () => {
	it('returns outbound and inbound state for the focused entity', () => {
		const person = getTemporalInstitutionEntriesForEntity(
			snapshot(),
			'person-a'
		);
		expect(person.map(value => ({
			id: value.entry.assertionId,
			state: value.state,
			inbound: value.inbound
		}))).toEqual([
			{ id: 'a1', state: 'active', inbound: false },
			{ id: 'p1', state: 'possible', inbound: false }
		]);

		const org = getTemporalInstitutionEntriesForEntity(
			snapshot(),
			'org-a'
		);
		expect(org.map(value => ({
			id: value.entry.assertionId,
			inbound: value.inbound
		}))).toEqual([
			{ id: 'a1', inbound: true },
			{ id: 'a2', inbound: true }
		]);
	});

	it('returns an empty list for unrelated entities', () => {
		expect(
			getTemporalInstitutionEntriesForEntity(snapshot(), 'office-x')
		).toEqual([]);
	});
});
