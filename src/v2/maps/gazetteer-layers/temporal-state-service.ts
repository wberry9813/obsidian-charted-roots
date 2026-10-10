import type { TFile } from 'obsidian';
import type { HistoricalDateService } from '../../time/historical-date-service';
import type { CalendarProvider } from '../../time/calendar-provider';
import type { TemporalParseResult } from '../../time/types';
import {
	buildTimelineModel,
	type TimelineDomain
} from '../../temporal/timeline-model';
import {
	queryTimelineAt,
	queryTimelineRange
} from '../../temporal/timeline-query';
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
	CanonicalHistoricalGazetteerLayer,
	HistoricalGazetteerFeature,
	HistoricalGazetteerStateSnapshot,
	HistoricalGazetteerTemporalState
} from './types';

function hasTemporalFields(fields: TemporalFields): boolean {
	return Boolean(
		fields.time_start
		|| fields.time_end
		|| fields.time_not_before
		|| fields.time_not_after
	);
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
	const present = boundaries.filter(
		(value): value is TemporalBoundaryProjection => Boolean(value)
	);
	if (present.length === 0) return 'undated';
	if (present.some(value => value.result.status === 'ambiguous')) {
		return 'ambiguous';
	}
	const resolved = present.filter(
		value => value.result.status === 'resolved'
	).length;
	const unresolved = present.filter(
		value => value.result.status === 'unresolved'
	).length;
	if (resolved > 0 && unresolved > 0) return 'partial';
	if (unresolved > 0) return 'unresolved';
	return 'resolved';
}

function temporalScope(
	id: string,
	title: string,
	fields: TemporalFields,
	dates: HistoricalDateService,
	calendar: CalendarProvider
): {
	stateAt(position: number): HistoricalGazetteerTemporalState | null;
	stateRange(range: TimelineDomain): HistoricalGazetteerTemporalState | null;
} {
	if (!hasTemporalFields(fields)) {
		return { stateAt: () => 'active', stateRange: () => 'active' };
	}

	const start = boundary(
		fields.time_start,
		fields.time_start_precision,
		fields.time_start_certainty,
		dates
	);
	const end = boundary(
		fields.time_end,
		fields.time_end_precision,
		fields.time_end_certainty,
		dates
	);
	const notBefore = boundary(
		fields.time_not_before,
		undefined,
		undefined,
		dates
	);
	const notAfter = boundary(
		fields.time_not_after,
		undefined,
		undefined,
		dates
	);
	const status = projectionStatus([start, end, notBefore, notAfter]);
	const item: TemporalItem = {
		id,
		kind: 'period',
		file: { path: `__gazetteer__/${id}.md` } as TFile,
		filePath: `__gazetteer__/${id}.md`,
		title,
		groups: [],
		start,
		end,
		notBefore,
		notAfter,
		status,
		source: 'v2'
	};
	const model = buildTimelineModel([item], calendar);
	const unknownReview = model.review.some(entry =>
		entry.reasons.some(reason =>
			reason === 'ambiguous'
			|| reason === 'unresolved'
			|| reason === 'partial'
			|| reason === 'unprojectable'
		)
	);
	const invalid = model.review.some(entry =>
		entry.reasons.includes('invalid_interval')
	);

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

function featureFields(feature: HistoricalGazetteerFeature): TemporalFields {
	return {
		time_start: feature.properties.time_start,
		time_end: feature.properties.time_end,
		time_not_before: feature.properties.time_not_before,
		time_not_after: feature.properties.time_not_after,
		time_start_precision: feature.properties.time_start_precision,
		time_end_precision: feature.properties.time_end_precision,
		time_start_certainty: feature.properties.time_start_certainty,
		time_end_certainty: feature.properties.time_end_certainty
	};
}

function combineStates(
	layerState: HistoricalGazetteerTemporalState | null,
	featureState: HistoricalGazetteerTemporalState | null
): HistoricalGazetteerTemporalState | null {
	if (!layerState || !featureState) return null;
	return layerState === 'possible' || featureState === 'possible'
		? 'possible'
		: 'active';
}

export class HistoricalGazetteerStateService {
	constructor(
		private readonly dates: HistoricalDateService,
		private readonly calendar: CalendarProvider
	) {}

	getAt(
		layers: readonly CanonicalHistoricalGazetteerLayer[],
		position: number,
		universe?: string
	): HistoricalGazetteerStateSnapshot {
		return this.collect(layers, universe, scope => scope.stateAt(position));
	}

	getRange(
		layers: readonly CanonicalHistoricalGazetteerLayer[],
		range: TimelineDomain,
		universe?: string
	): HistoricalGazetteerStateSnapshot {
		return this.collect(layers, universe, scope => scope.stateRange(range));
	}

	getWithoutFocus(
		layers: readonly CanonicalHistoricalGazetteerLayer[],
		universe?: string
	): HistoricalGazetteerStateSnapshot {
		const active: HistoricalGazetteerStateSnapshot['active'] = [];
		for (const layer of layers) {
			if (universe && layer.universe && layer.universe !== universe) continue;
			if (hasTemporalFields(layer)) continue;
			for (const feature of layer.featureCollection.features) {
				if (hasTemporalFields(feature.properties)) continue;
				active.push({
					layerId: layer.id,
					layerLabel: layer.label,
					layerUniverse: layer.universe,
					state: 'active',
					feature,
					layer
				});
			}
		}
		return { active, possible: [] };
	}

	private collect(
		layers: readonly CanonicalHistoricalGazetteerLayer[],
		universe: string | undefined,
		evaluate: (
			scope: ReturnType<typeof temporalScope>
		) => HistoricalGazetteerTemporalState | null
	): HistoricalGazetteerStateSnapshot {
		const active: HistoricalGazetteerStateSnapshot['active'] = [];
		const possible: HistoricalGazetteerStateSnapshot['possible'] = [];

		for (const layer of layers) {
			if (universe && layer.universe && layer.universe !== universe) continue;
			const layerState = evaluate(temporalScope(
				`layer:${layer.id}`,
				layer.label,
				layer,
				this.dates,
				this.calendar
			));
			if (!layerState) continue;

			for (let index = 0; index < layer.featureCollection.features.length; index++) {
				const feature = layer.featureCollection.features[index];
				const featureState = evaluate(temporalScope(
					`feature:${layer.id}:${String(feature.id ?? index)}`,
					feature.properties.name,
					featureFields(feature),
					this.dates,
					this.calendar
				));
				const state = combineStates(layerState, featureState);
				if (!state) continue;
				const entry = {
					layerId: layer.id,
					layerLabel: layer.label,
					layerUniverse: layer.universe,
					state,
					feature,
					layer
				};
				(state === 'active' ? active : possible).push(entry);
			}
		}
		return { active, possible };
	}
}
