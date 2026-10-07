import type { App, TFile } from 'obsidian';
import { detectNoteType } from '../../utils/note-type-detection';
import type { TemporalCertainty, TemporalPrecision } from '../types';
import type { HistoricalDateService } from '../time/historical-date-service';
import type {
	TemporalParseContext,
	TemporalValue
} from '../time/types';
import type {
	TemporalBoundaryProjection,
	TemporalGroupingKind,
	TemporalGroupingRef,
	TemporalItem,
	TemporalItemKind,
	TemporalProjectionSource,
	TemporalProjectionStatus
} from './types';

const PRECISIONS = new Set<TemporalPrecision>([
	'day',
	'month',
	'year',
	'decade',
	'unknown'
]);

const ASSERTION_NON_QUALIFIER_KEYS = new Set([
	'cr_schema',
	'cr_type',
	'cr_id',
	'name',
	'title',
	'aliases',
	'universe',
	'research_sets',
	'external_ids',
	'tags',
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

const CERTAINTIES = new Set<TemporalCertainty>([
	'certain',
	'approximate',
	'inferred',
	'uncertain',
	'disputed',
	'unknown'
]);

export interface TemporalProjectionServiceOptions {
	/** Dynamic dataset boundary, normally the Active Workspace. */
	fileProvider?: () => TFile[];
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0
		? value.trim()
		: undefined;
}

function scalarValue(value: unknown): string | number | boolean | undefined {
	return typeof value === 'string'
		|| typeof value === 'number'
		|| typeof value === 'boolean'
		? value
		: undefined;
}

function assertionQualifiers(
	frontmatter: Record<string, unknown>
): Record<string, string | number | boolean> | undefined {
	const qualifiers: Record<string, string | number | boolean> = {};
	for (const [key, raw] of Object.entries(frontmatter)) {
		if (ASSERTION_NON_QUALIFIER_KEYS.has(key)) continue;
		const scalar = scalarValue(raw);
		if (scalar !== undefined) qualifiers[key] = scalar;
	}
	return Object.keys(qualifiers).length > 0 ? qualifiers : undefined;
}

function stringArrayValue(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((entry): entry is string => typeof entry === 'string')
		.map(entry => entry.trim())
		.filter(Boolean);
}

function parseReference(reference: string): { target: string; label: string } {
	const trimmed = reference.trim();
	const inner = trimmed.startsWith('[[') && trimmed.endsWith(']]')
		? trimmed.slice(2, -2)
		: trimmed;
	const [targetPart, aliasPart] = inner.split('|', 2);
	const target = (targetPart ?? '')
		.split('#', 1)[0]
		.trim();
	const label = aliasPart?.trim()
		|| target.split('/').pop()
		|| target
		|| trimmed;
	return { target, label };
}

function groupingKindForNoteType(
	noteType: ReturnType<typeof detectNoteType>
): TemporalGroupingKind | null {
	switch (noteType) {
		case 'person':
		case 'place':
		case 'organization':
		case 'office':
		case 'universe':
			return noteType;
		default:
			return null;
	}
}

function precisionValue(value: unknown): TemporalPrecision | undefined {
	return typeof value === 'string' && PRECISIONS.has(value as TemporalPrecision)
		? value as TemporalPrecision
		: undefined;
}

function certaintyValue(value: unknown): TemporalCertainty | undefined {
	return typeof value === 'string' && CERTAINTIES.has(value as TemporalCertainty)
		? value as TemporalCertainty
		: undefined;
}

function temporalKind(value: ReturnType<typeof detectNoteType>): TemporalItemKind | null {
	switch (value) {
		case 'event':
		case 'process':
		case 'period':
		case 'assertion':
			return value;
		default:
			return null;
	}
}

function itemTypeId(
	kind: TemporalItemKind,
	frontmatter: Record<string, unknown>
): string | undefined {
	switch (kind) {
		case 'event':
			return stringValue(frontmatter.event_type);
		case 'process':
			return stringValue(frontmatter.process_type);
		case 'period':
			return stringValue(frontmatter.period_type);
		case 'assertion':
			return stringValue(frontmatter.assertion_type);
	}
}

/**
 * Projects temporal entities and time-bounded Assertions into one normalized
 * read model. This is the v2 boundary between Markdown storage and future
 * Timeline/Map/temporal-graph renderers.
 */
export class TemporalProjectionService {
	constructor(
		private readonly app: App,
		private readonly historicalDateService: HistoricalDateService,
		private readonly options: TemporalProjectionServiceOptions = {}
	) {}

	getAll(): TemporalItem[] {
		const files = this.options.fileProvider?.()
			?? this.app.vault.getMarkdownFiles();
		const items: TemporalItem[] = [];

		for (const file of files) {
			const item = this.projectFile(file);
			if (item) items.push(item);
		}

		return items;
	}

	getAllSorted(): TemporalItem[] {
		return this.sortItems(this.getAll());
	}

	projectFile(file: TFile): TemporalItem | null {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
		if (!frontmatter) return null;

		const kind = temporalKind(detectNoteType(frontmatter, cache));
		if (!kind) return null;

		const id = stringValue(frontmatter.cr_id);
		if (!id) return null;

		const v2Start = stringValue(frontmatter.time_start);
		const v2End = stringValue(frontmatter.time_end);
		const v2NotBefore = stringValue(frontmatter.time_not_before);
		const v2NotAfter = stringValue(frontmatter.time_not_after);
		const hasV2Temporal = Boolean(
			v2Start || v2End || v2NotBefore || v2NotAfter
		);

		const legacyStart = kind === 'event'
			? stringValue(frontmatter.date)
			: undefined;
		const legacyEnd = kind === 'event'
			? stringValue(frontmatter.date_end)
			: undefined;

		const startExpression = v2Start ?? legacyStart;
		const endExpression = v2End ?? legacyEnd;
		const legacyUsed = Boolean(
			(kind === 'event' && !v2Start && legacyStart)
			|| (kind === 'event' && !v2End && legacyEnd)
		);
		const source: TemporalProjectionSource = legacyUsed
			? (hasV2Temporal ? 'mixed_event' : 'legacy_event')
			: 'v2';

		// Assertions only enter the temporal projection when they actually have
		// a temporal constraint. Undated Assertions remain semantic graph edges,
		// not timeline items.
		if (
			kind === 'assertion'
			&& !startExpression
			&& !endExpression
			&& !v2NotBefore
			&& !v2NotAfter
		) {
			return null;
		}

		const context = this.buildParseContext(frontmatter);
		const start = this.projectBoundary(
			startExpression,
			v2Start ? precisionValue(frontmatter.time_start_precision) : undefined,
			v2Start ? certaintyValue(frontmatter.time_start_certainty) : undefined,
			context
		);
		const end = this.projectBoundary(
			endExpression,
			v2End ? precisionValue(frontmatter.time_end_precision) : undefined,
			v2End ? certaintyValue(frontmatter.time_end_certainty) : undefined,
			context
		);
		const notBefore = this.projectBoundary(
			v2NotBefore,
			undefined,
			undefined,
			context
		);
		const notAfter = this.projectBoundary(
			v2NotAfter,
			undefined,
			undefined,
			context
		);

		const title = stringValue(frontmatter.title)
			?? stringValue(frontmatter.name)
			?? file.basename;

		return {
			id,
			kind,
			file,
			filePath: file.path,
			title,
			typeId: itemTypeId(kind, frontmatter),
			predicate: kind === 'assertion'
				? stringValue(frontmatter.predicate)
				: undefined,
			universe: stringValue(frontmatter.universe),
			subject: kind === 'assertion'
				? stringValue(frontmatter.subject)
				: undefined,
			object: kind === 'assertion'
				? stringValue(frontmatter.object)
				: undefined,
			value: kind === 'assertion'
				? scalarValue(frontmatter.value)
				: undefined,
			qualifiers: kind === 'assertion'
				? assertionQualifiers(frontmatter)
				: undefined,
			groups: this.buildGroupingRefs(kind, file, frontmatter),
			start,
			end,
			notBefore,
			notAfter,
			status: this.statusFor([start, end, notBefore, notAfter]),
			source
		};
	}

	compareChronologically(a: TemporalItem, b: TemporalItem): number {
		const left = this.firstResolvedValue(a);
		const right = this.firstResolvedValue(b);

		if (left && right) {
			// HistoricalDateService intentionally returns 0 for overlapping
			// precision windows (for example a year and an exact day inside
			// that year). Preserve that equality instead of inventing order.
			return this.historicalDateService.compare(left, right) ?? 0;
		}
		if (left) return -1;
		if (right) return 1;
		return 0;
	}

	sortItems(items: readonly TemporalItem[]): TemporalItem[] {
		return [...items].sort((a, b) => this.compareChronologically(a, b));
	}

	private buildGroupingRefs(
		kind: TemporalItemKind,
		file: TFile,
		frontmatter: Record<string, unknown>
	): TemporalGroupingRef[] {
		const refs: TemporalGroupingRef[] = [];
		const add = (
			reference: string | undefined,
			expectedKind?: TemporalGroupingKind
		): void => {
			if (!reference) return;
			const resolved = this.resolveGroupingRef(reference, file, expectedKind);
			if (resolved) refs.push(resolved);
		};

		add(stringValue(frontmatter.universe), 'universe');

		if (kind === 'event') {
			add(stringValue(frontmatter.person), 'person');
			for (const person of stringArrayValue(frontmatter.persons)) {
				add(person, 'person');
			}
			add(stringValue(frontmatter.place), 'place');
			for (const organization of stringArrayValue(frontmatter.organizations)) {
				add(organization, 'organization');
			}
		}

		if (kind === 'assertion') {
			add(stringValue(frontmatter.subject));
			add(stringValue(frontmatter.object));
		}

		return [...new Map(
			refs.map(ref => [ref.key, ref])
		).values()];
	}

	private resolveGroupingRef(
		reference: string,
		sourceFile: TFile,
		expectedKind?: TemporalGroupingKind
	): TemporalGroupingRef | null {
		const { target, label } = parseReference(reference);
		if (!target) return null;

		const resolver = this.app.metadataCache.getFirstLinkpathDest;
		const resolvedFile = typeof resolver === 'function'
			? resolver.call(this.app.metadataCache, target, sourceFile.path)
			: null;

		if (resolvedFile) {
			const cache = this.app.metadataCache.getFileCache(resolvedFile);
			const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
			const detected = frontmatter
				? groupingKindForNoteType(detectNoteType(frontmatter, cache))
				: null;
			const kind = detected ?? expectedKind;
			if (!kind) return null;

			const crId = frontmatter
				? stringValue(frontmatter.cr_id)
				: undefined;
			return {
				kind,
				key: crId
					? `${kind}:crid:${crId}`
					: `${kind}:path:${resolvedFile.path}`,
				label: stringValue(frontmatter?.name)
					?? stringValue(frontmatter?.title)
					?? label,
				reference,
				crId,
				filePath: resolvedFile.path
			};
		}

		if (!expectedKind) return null;
		return {
			kind: expectedKind,
			key: `${expectedKind}:ref:${target.toLocaleLowerCase()}`,
			label,
			reference
		};
	}

	private projectBoundary(
		expression: string | undefined,
		declaredPrecision: TemporalPrecision | undefined,
		declaredCertainty: TemporalCertainty | undefined,
		context: TemporalParseContext
	): TemporalBoundaryProjection | undefined {
		if (!expression) return undefined;

		const result = this.historicalDateService.parse(expression, context);
		const parsed = result.status === 'resolved'
			? result.value
			: undefined;

		const parsedPrecision = parsed?.precision;
		const precisionConflict = Boolean(
			declaredPrecision
			&& declaredPrecision !== 'unknown'
			&& parsedPrecision
			&& parsedPrecision !== 'unknown'
			&& declaredPrecision !== parsedPrecision
		);

		return {
			expression,
			declaredPrecision,
			declaredCertainty,
			// The authored expression is authoritative for positional precision.
			// Explicit metadata is preserved separately and may be linted, but it
			// must never turn a year into a fake day/month coordinate.
			effectivePrecision: parsedPrecision ?? declaredPrecision,
			effectiveCertainty: declaredCertainty ?? parsed?.certainty,
			precisionConflict,
			result
		};
	}

	private buildParseContext(
		frontmatter: Record<string, unknown>
	): TemporalParseContext {
		return {
			calendar: stringValue(frontmatter.calendar)
				?? stringValue(frontmatter.date_system),
			chronology: stringValue(frontmatter.chronology),
			polity: stringValue(frontmatter.polity),
			ruler: stringValue(frontmatter.ruler)
		};
	}

	private statusFor(
		boundaries: Array<TemporalBoundaryProjection | undefined>
	): TemporalProjectionStatus {
		const present = boundaries.filter(
			(boundary): boundary is TemporalBoundaryProjection => Boolean(boundary)
		);
		if (present.length === 0) return 'undated';

		if (present.some(boundary => boundary.result.status === 'ambiguous')) {
			return 'ambiguous';
		}

		const resolved = present.filter(
			boundary => boundary.result.status === 'resolved'
		).length;
		const unresolved = present.filter(
			boundary => boundary.result.status === 'unresolved'
		).length;

		if (resolved > 0 && unresolved > 0) return 'partial';
		if (unresolved > 0) return 'unresolved';
		return 'resolved';
	}

	private firstResolvedValue(item: TemporalItem): TemporalValue | undefined {
		for (const boundary of [
			item.start,
			item.notBefore,
			item.end,
			item.notAfter
		]) {
			if (boundary?.result.status === 'resolved') {
				return boundary.result.value;
			}
		}
		return undefined;
	}
}
