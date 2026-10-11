import type {
	TemporalInstitutionStateEntry,
	TemporalInstitutionStateSnapshot
} from '../temporal/temporal-institution-state-service';

export interface HistoricalPersonCardAssertionMetadata {
	confidence?: string;
	researchStatus?: string;
}

export interface HistoricalPersonCardStateEntry {
	relationKind: 'affiliation' | 'office_holding';
	state: 'active' | 'possible';
	assertionId: string;
	assertionFilePath: string;
	predicate: string;
	label: string;
	targetCrId?: string;
	targetFilePath?: string;
	confidence?: string;
	researchStatus?: string;
}

export interface HistoricalPersonCardState {
	personCrId: string;
	offices: HistoricalPersonCardStateEntry[];
	affiliations: HistoricalPersonCardStateEntry[];
	possibleCount: number;
}

export type HistoricalPersonCardMetadataReader = (
	assertionFilePath: string
) => HistoricalPersonCardAssertionMetadata | undefined;

function compareEntries(
	left: HistoricalPersonCardStateEntry,
	right: HistoricalPersonCardStateEntry
): number {
	if (left.state !== right.state) {
		return left.state === 'active' ? -1 : 1;
	}
	const label = left.label.localeCompare(right.label, 'zh-CN');
	if (label !== 0) return label;
	return left.assertionId.localeCompare(right.assertionId);
}

function asCardEntry(
	entry: TemporalInstitutionStateEntry,
	readMetadata: HistoricalPersonCardMetadataReader
): HistoricalPersonCardStateEntry | null {
	if (
		entry.subject.kind !== 'person'
		|| !entry.subject.crId
		|| (
			entry.relationKind !== 'affiliation'
			&& entry.relationKind !== 'office_holding'
		)
	) {
		return null;
	}

	const metadata = readMetadata(entry.item.filePath);
	return {
		relationKind: entry.relationKind,
		state: entry.state,
		assertionId: entry.assertionId,
		assertionFilePath: entry.item.filePath,
		predicate: entry.predicate,
		label: entry.object.label,
		targetCrId: entry.object.crId,
		targetFilePath: entry.object.filePath,
		confidence: metadata?.confidence,
		researchStatus: metadata?.researchStatus
	};
}

/**
 * Collapse temporal institutional Assertions into person-only card state.
 *
 * Organizations and Offices deliberately remain metadata: this projection
 * never emits graph nodes or relationship edges. It only annotates Person
 * cards at a caller-selected temporal focus.
 */
export function buildHistoricalPersonCardStates(
	snapshot: TemporalInstitutionStateSnapshot,
	readMetadata: HistoricalPersonCardMetadataReader = () => undefined
): Map<string, HistoricalPersonCardState> {
	const result = new Map<string, HistoricalPersonCardState>();
	const seenAssertions = new Set<string>();

	for (const entry of [...snapshot.active, ...snapshot.possible]) {
		if (seenAssertions.has(entry.assertionId)) continue;
		const value = asCardEntry(entry, readMetadata);
		if (!value || !entry.subject.crId) continue;
		seenAssertions.add(entry.assertionId);

		let state = result.get(entry.subject.crId);
		if (!state) {
			state = {
				personCrId: entry.subject.crId,
				offices: [],
				affiliations: [],
				possibleCount: 0
			};
			result.set(entry.subject.crId, state);
		}

		if (value.state === 'possible') state.possibleCount++;
		if (value.relationKind === 'office_holding') {
			state.offices.push(value);
		} else {
			state.affiliations.push(value);
		}
	}

	for (const state of result.values()) {
		state.offices.sort(compareEntries);
		state.affiliations.sort(compareEntries);
	}

	return result;
}
