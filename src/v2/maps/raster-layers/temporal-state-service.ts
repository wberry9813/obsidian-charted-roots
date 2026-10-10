import type { TFile } from 'obsidian';
import type { HistoricalDateService } from '../../time/historical-date-service';
import type { CalendarProvider } from '../../time/calendar-provider';
import type { TemporalParseResult } from '../../time/types';
import { buildTimelineModel, type TimelineDomain } from '../../temporal/timeline-model';
import { queryTimelineAt, queryTimelineRange } from '../../temporal/timeline-query';
import type {
	TemporalBoundaryProjection,
	TemporalItem,
	TemporalProjectionStatus
} from '../../temporal/types';
import type {
	TemporalCertainty,
	TemporalFields,
	TemporalPrecision
} from '../../types';
import type {
	HistoricalRasterLayerDefinition,
	HistoricalRasterLayerStateSnapshot,
	HistoricalRasterLayerTemporalState
} from './types';

function hasTemporalFields(fields: TemporalFields): boolean {
	return Boolean(fields.time_start || fields.time_end || fields.time_not_before || fields.time_not_after);
}

function boundary(
	expression: string | undefined,
	declaredPrecision: TemporalPrecision | undefined,
	declaredCertainty: TemporalCertainty | undefined,
	dates: HistoricalDateService
): TemporalBoundaryProjection | undefined {
	if (!expression) return undefined;
	const result: TemporalParseResult = dates.parse(expression);
	const parsed = result.status === 'resolved' ? result.value : undefined;
	const parsedPrecision = parsed?.precision;
	return {
		expression,
		declaredPrecision,
		declaredCertainty,
		effectivePrecision: parsedPrecision ?? declaredPrecision,
		effectiveCertainty: declaredCertainty ?? parsed?.certainty,
		precisionConflict: Boolean(
			declaredPrecision
			&& declaredPrecision !== 'unknown'
			&& parsedPrecision
			&& parsedPrecision !== 'unknown'
			&& declaredPrecision !== parsedPrecision
		),
		result
	};
}

function projectionStatus(
	boundaries: Array<TemporalBoundaryProjection | undefined>
): TemporalProjectionStatus {
	const present = boundaries.filter((value): value is TemporalBoundaryProjection => Boolean(value));
	if (present.length === 0) return 'undated';
	if (present.some(value => value.result.status === 'ambiguous')) return 'ambiguous';
	const resolved = present.filter(value => value.result.status === 'resolved').length;
	const unresolved = present.filter(value => value.result.status === 'unresolved').length;
	if (resolved > 0 && unresolved > 0) return 'partial';
	if (unresolved > 0) return 'unresolved';
	return 'resolved';
}

function temporalScope(
	layer: HistoricalRasterLayerDefinition,
	dates: HistoricalDateService,
	calendar: CalendarProvider
): {
	stateAt(position: number): HistoricalRasterLayerTemporalState | null;
	stateRange(range: TimelineDomain): HistoricalRasterLayerTemporalState | null;
} {
	if (!hasTemporalFields(layer)) {
		return { stateAt: () => 'active', stateRange: () => 'active' };
	}

	const start = boundary(layer.time_start, layer.time_start_precision, layer.time_start_certainty, dates);
	const end = boundary(layer.time_end, layer.time_end_precision, layer.time_end_certainty, dates);
	const notBefore = boundary(layer.time_not_before, undefined, undefined, dates);
	const notAfter = boundary(layer.time_not_after, undefined, undefined, dates);
	const status = projectionStatus([start, end, notBefore, notAfter]);
	const item: TemporalItem = {
		id: `raster:${layer.id}`,
		kind: 'period',
		file: { path: `__raster_layer__/${layer.id}.md` } as TFile,
		filePath: `__raster_layer__/${layer.id}.md`,
		title: layer.label,
		groups: [],
		start,
		end,
		notBefore,
		notAfter,
		status,
		source: 'v2'
	};
	const model = buildTimelineModel([item], calendar);
	const unknownReview = model.review.some(entry => entry.reasons.some(reason =>
		reason === 'ambiguous'
		|| reason === 'unresolved'
		|| reason === 'partial'
		|| reason === 'unprojectable'
	));
	const invalid = model.review.some(entry => entry.reasons.includes('invalid_interval'));

	return {
		stateAt(position: number) {
			if (invalid) return null;
			const result = queryTimelineAt(model, position);
			if (result.activeSpans.length > 0) return 'active';
			if (result.possibleWindows.length > 0 || unknownReview) return 'possible';
			return null;
		},
		stateRange(range: TimelineDomain) {
			if (invalid) return null;
			const result = queryTimelineRange(model, range);
			if (result.overlappingSpans.length > 0) return 'active';
			if (result.possibleWindows.length > 0 || unknownReview) return 'possible';
			return null;
		}
	};
}

export class HistoricalRasterLayerStateService {
	constructor(
		private readonly dates: HistoricalDateService,
		private readonly calendar: CalendarProvider
	) {}

	getAt(
		layers: readonly HistoricalRasterLayerDefinition[],
		position: number,
		universe?: string
	): HistoricalRasterLayerStateSnapshot {
		return this.collect(layers, universe, scope => scope.stateAt(position));
	}

	getRange(
		layers: readonly HistoricalRasterLayerDefinition[],
		range: TimelineDomain,
		universe?: string
	): HistoricalRasterLayerStateSnapshot {
		return this.collect(layers, universe, scope => scope.stateRange(range));
	}

	getWithoutFocus(
		layers: readonly HistoricalRasterLayerDefinition[],
		universe?: string
	): HistoricalRasterLayerStateSnapshot {
		return {
			active: layers
				.filter(layer => layer.enabled)
				.filter(layer => !universe || !layer.universe || layer.universe === universe)
				.filter(layer => !hasTemporalFields(layer))
				.map(layer => ({ layer, state: 'active' as const })),
			possible: []
		};
	}

	private collect(
		layers: readonly HistoricalRasterLayerDefinition[],
		universe: string | undefined,
		evaluate: (scope: ReturnType<typeof temporalScope>) => HistoricalRasterLayerTemporalState | null
	): HistoricalRasterLayerStateSnapshot {
		const active: HistoricalRasterLayerStateSnapshot['active'] = [];
		const possible: HistoricalRasterLayerStateSnapshot['possible'] = [];
		for (const layer of layers) {
			if (!layer.enabled) continue;
			if (universe && layer.universe && layer.universe !== universe) continue;
			const state = evaluate(temporalScope(layer, this.dates, this.calendar));
			if (!state) continue;
			(state === 'active' ? active : possible).push({ layer, state });
		}
		return { active, possible };
	}
}
