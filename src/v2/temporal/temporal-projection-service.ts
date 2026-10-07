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

		return {
			expression,
			declaredPrecision,
			declaredCertainty,
			effectivePrecision: declaredPrecision ?? parsed?.precision,
			effectiveCertainty: declaredCertainty ?? parsed?.certainty,
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
