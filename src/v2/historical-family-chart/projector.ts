import type { App, TFile } from 'obsidian';
import { isPersonNote } from '../../utils/note-type-detection';
import { resolvePathToFile } from '../../utils/wikilink-resolver';
import type { OntologyRegistry } from '../ontology-registry';
import type {
	SemanticAssertion,
	SemanticAssertionService
} from '../semantic-assertion-service';
import {
	isChronologyYearFocus,
	isJulianDayFocus,
	type TemporalFocus
} from '../temporal/temporal-focus-service';
import type {
	TemporalAssertionStateEntry,
	TemporalAssertionStateService
} from '../temporal/temporal-assertion-state-service';
import type {
	HistoricalFamilyChartEdge,
	HistoricalFamilyChartPersonRef,
	HistoricalFamilyChartProjection,
	HistoricalFamilyChartTemporalState
} from './types';

interface TemporalSelection {
	active: Set<string>;
	possible: Set<string>;
}

function scalarString(
	value: unknown
): string | undefined {
	return typeof value === 'string' && value.trim()
		? value.trim()
		: undefined;
}

function assertionId(assertion: SemanticAssertion): string | null {
	return scalarString(assertion.materialized?.raw.cr_id) ?? null;
}

function temporalFieldsPresent(assertion: SemanticAssertion): boolean {
	return Boolean(
		assertion.time_start
		|| assertion.time_end
		|| assertion.time_not_before
		|| assertion.time_not_after
	);
}

function entryIds(entries: TemporalAssertionStateEntry[]): Set<string> {
	return new Set(
		entries
			.filter(entry => entry.item.typeId === 'relationship')
			.map(entry => entry.id)
	);
}

function canonicalPair(
	left: HistoricalFamilyChartPersonRef,
	right: HistoricalFamilyChartPersonRef
): string {
	return [left.crId, right.crId].sort().join('::');
}

/**
 * Runtime adapter from v2 Assertion semantics into a person-only historical
 * relationship overlay model.
 *
 * The projector deliberately does not know anything about SVG/family-chart.
 * It owns data semantics only: endpoint validation, ontology directionality,
 * temporal filtering and symmetric de-duplication.
 */
export class HistoricalFamilyChartProjector {
	constructor(
		private readonly app: App,
		private readonly assertions: SemanticAssertionService,
		private readonly ontology: OntologyRegistry,
		private readonly temporalState: TemporalAssertionStateService | null
	) {}

	project(
		focus: TemporalFocus | null,
		locale = 'zh-CN'
	): HistoricalFamilyChartProjection {
		const skipped: HistoricalFamilyChartProjection['skipped'] = {
			nonRelationship: 0,
			nonPersonEndpoint: 0,
			structuralFamilyPredicate: 0,
			outsideTemporalFocus: 0,
			undatedAtFocus: 0,
			symmetricDuplicate: 0
		};

		const temporal = this.resolveTemporalSelection(focus);
		const focusApplied = temporal !== null;
		const focusIgnoredReason = focus
			? isChronologyYearFocus(focus)
				? 'unsupported_axis'
				: !this.temporalState
					? 'temporal_state_unavailable'
					: undefined
			: undefined;

		const edges: HistoricalFamilyChartEdge[] = [];
		const symmetricKeys = new Set<string>();

		for (const assertion of this.assertions.getAll()) {
			if (
				assertion.origin !== 'assertion_note'
				|| assertion.assertionType !== 'relationship'
			) {
				skipped.nonRelationship++;
				continue;
			}

			if (!assertion.object || !assertion.materialized) {
				skipped.nonPersonEndpoint++;
				continue;
			}

			const predicate = this.ontology.getPredicate(assertion.predicate);
			if (predicate?.includeOnFamilyTree || predicate?.familyGraphMapping) {
				skipped.structuralFamilyPredicate++;
				continue;
			}

			const subject = this.resolvePerson(
				assertion.subject,
				assertion.sourceFile
			);
			const object = this.resolvePerson(
				assertion.object,
				assertion.sourceFile
			);
			if (!subject || !object) {
				skipped.nonPersonEndpoint++;
				continue;
			}

			const id = assertionId(assertion);
			if (!id) {
				skipped.nonRelationship++;
				continue;
			}

			let temporalState: HistoricalFamilyChartTemporalState = 'all_time';
			if (temporal) {
				if (!temporalFieldsPresent(assertion)) {
					skipped.undatedAtFocus++;
					continue;
				}
				if (temporal.active.has(id)) {
					temporalState = 'active';
				} else if (temporal.possible.has(id)) {
					temporalState = 'possible';
				} else {
					skipped.outsideTemporalFocus++;
					continue;
				}
			}

			const symmetric = predicate?.symmetric === true;
			if (symmetric) {
				const key = `${assertion.predicate}::${canonicalPair(subject, object)}`;
				if (symmetricKeys.has(key)) {
					skipped.symmetricDuplicate++;
					continue;
				}
				symmetricKeys.add(key);
			}

			edges.push({
				id,
				subject,
				object,
				predicate: assertion.predicate,
				label: this.ontology.getPredicateLabel(
					assertion.predicate,
					locale
				),
				directed: !symmetric,
				symmetric,
				temporalState,
				timeStart: assertion.time_start,
				timeEnd: assertion.time_end,
				confidence: scalarString(assertion.materialized.raw.confidence),
				researchStatus: scalarString(
					assertion.materialized.raw.research_status
				),
				qualifiers: this.collectQualifiers(assertion),
				sourceFilePath: assertion.materialized.filePath
			});
		}

		return {
			edges,
			focusApplied,
			...(focusIgnoredReason ? { focusIgnoredReason } : {}),
			skipped
		};
	}

	private resolveTemporalSelection(
		focus: TemporalFocus | null
	): TemporalSelection | null {
		if (!focus || !isJulianDayFocus(focus) || !this.temporalState) {
			return null;
		}

		const snapshot = focus.kind === 'point'
			? this.temporalState.getAt(focus.position, {
				kinds: ['assertion']
			})
			: this.temporalState.getRange(
				{
					start: focus.start,
					endExclusive: focus.endExclusive
				},
				{ kinds: ['assertion'] }
			);

		return {
			active: entryIds(snapshot.active),
			possible: entryIds(snapshot.possible)
		};
	}

	private resolvePerson(
		reference: string,
		sourceFile: TFile | undefined
	): HistoricalFamilyChartPersonRef | null {
		const file = resolvePathToFile(
			this.app,
			reference,
			sourceFile?.path
		);
		if (!file) return null;

		const frontmatter = this.app.metadataCache
			.getFileCache(file)
			?.frontmatter;
		if (!frontmatter || !isPersonNote(frontmatter)) {
			return null;
		}

		const crId = scalarString(frontmatter.cr_id);
		if (!crId) return null;

		const name = scalarString(frontmatter.name) ?? file.basename;
		return {
			crId,
			name,
			filePath: file.path,
			file
		};
	}

	private collectQualifiers(
		assertion: SemanticAssertion
	): Record<string, string | number | boolean> | undefined {
		const raw = assertion.materialized?.raw;
		if (!raw) return undefined;

		const reserved = new Set([
			'cr_schema',
			'cr_type',
			'cr_id',
			'assertion_type',
			'subject',
			'predicate',
			'object',
			'value',
			'time_start',
			'time_end',
			'time_not_before',
			'time_not_after',
			'time_start_precision',
			'time_end_precision',
			'time_start_certainty',
			'time_end_certainty',
			'confidence',
			'research_status',
			'notes'
		]);

		const qualifiers: Record<string, string | number | boolean> = {};
		for (const [key, value] of Object.entries(raw)) {
			if (
				reserved.has(key)
				|| (
					typeof value !== 'string'
					&& typeof value !== 'number'
					&& typeof value !== 'boolean'
				)
			) {
				continue;
			}
			qualifiers[key] = value;
		}

		return Object.keys(qualifiers).length > 0
			? qualifiers
			: undefined;
	}
}
