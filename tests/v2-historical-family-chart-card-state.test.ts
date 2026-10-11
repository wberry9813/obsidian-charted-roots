import { describe, expect, it } from 'vitest';
import {
	buildHistoricalPersonCardStates,
	type HistoricalPersonCardAssertionMetadata
} from '../src/v2/historical-family-chart';
import type {
	TemporalInstitutionStateEntry,
	TemporalInstitutionStateSnapshot
} from '../src/v2';

function entry(
	id: string,
	relationKind: 'affiliation' | 'office_holding' | 'organization_relation',
	subjectKind: 'person' | 'organization',
	subjectId: string,
	objectKind: 'organization' | 'office',
	objectId: string,
	state: 'active' | 'possible' = 'active'
): TemporalInstitutionStateEntry {
	return {
		state,
		relationKind,
		assertionId: id,
		predicate: relationKind === 'office_holding' ? 'holds_office' : 'member_of',
		subject: {
			kind: subjectKind,
			key: `${subjectKind}:crid:${subjectId}`,
			label: subjectId,
			reference: `[[${subjectId}]]`,
			crId: subjectId,
			filePath: `${subjectKind}/${subjectId}.md`
		},
		object: {
			kind: objectKind,
			key: `${objectKind}:crid:${objectId}`,
			label: objectId,
			reference: `[[${objectId}]]`,
			crId: objectId,
			filePath: `${objectKind}/${objectId}.md`
		},
		item: {
			filePath: `Assertions/${id}.md`
		} as never
	};
}

function snapshot(
	active: TemporalInstitutionStateEntry[],
	possible: TemporalInstitutionStateEntry[] = []
): TemporalInstitutionStateSnapshot {
	return { active, possible };
}

describe('Historical Family Chart person-card state', () => {
	it('groups active offices and affiliations onto Person cards', () => {
		const states = buildHistoricalPersonCardStates(snapshot([
			entry('office', 'office_holding', 'person', 'cao', 'office', '丞相'),
			entry('affiliation', 'affiliation', 'person', 'cao', 'organization', '汉朝廷')
		]));

		expect(states.get('cao')).toMatchObject({
			personCrId: 'cao',
			possibleCount: 0,
			offices: [{
				assertionId: 'office',
				label: '丞相',
				state: 'active'
			}],
			affiliations: [{
				assertionId: 'affiliation',
				label: '汉朝廷',
				state: 'active'
			}]
		});
	});

	it('keeps possible state and assertion metadata explicit', () => {
		const metadata = new Map<string, HistoricalPersonCardAssertionMetadata>([
			['Assertions/possible.md', {
				confidence: 'medium',
				researchStatus: 'provisional'
			}]
		]);
		const states = buildHistoricalPersonCardStates(
			snapshot([], [
				entry(
					'possible',
					'affiliation',
					'person',
					'cao',
					'organization',
					'曹操集团',
					'possible'
				)
			]),
			filePath => metadata.get(filePath)
		);

		expect(states.get('cao')).toMatchObject({
			possibleCount: 1,
			affiliations: [{
				state: 'possible',
				confidence: 'medium',
				researchStatus: 'provisional',
				assertionFilePath: 'Assertions/possible.md'
			}]
		});
	});

	it('ignores organization-to-organization state and deduplicates assertions', () => {
		const orgRelation = entry(
			'org-rel',
			'organization_relation',
			'organization',
			'han',
			'organization',
			'cao'
		);
		const affiliation = entry(
			'affiliation',
			'affiliation',
			'person',
			'cao',
			'organization',
			'han'
		);
		const states = buildHistoricalPersonCardStates(snapshot([
			orgRelation,
			affiliation,
			affiliation
		]));

		expect([...states.keys()]).toEqual(['cao']);
		expect(states.get('cao')?.affiliations).toHaveLength(1);
	});
});
