import type { HistoricalFamilyChartEdge, HistoricalFamilyChartProjection } from './types';

/** Research-friendly presets; unknown predicates remain accessible through All. */
export type HistoricalRelationPreset = 'all' | 'political' | 'mentorship';

const PRESET_PREDICATES: Record<Exclude<HistoricalRelationPreset, 'all'>, ReadonlySet<string>> = {
  political: new Set(['political_rival', 'hostile_to', 'ally_of']),
  mentorship: new Set(['mentor_of', 'disciple_of', 'recommends'])
};

export function filterHistoricalEdges(
  edges: readonly HistoricalFamilyChartEdge[],
  preset: HistoricalRelationPreset
): HistoricalFamilyChartEdge[] {
  if (preset === 'all') return [...edges];
  const allowed = PRESET_PREDICATES[preset];
  return edges.filter(edge => allowed.has(edge.predicate));
}

export function filterHistoricalProjection(
  projection: HistoricalFamilyChartProjection,
  preset: HistoricalRelationPreset
): HistoricalFamilyChartProjection {
  return { ...projection, edges: filterHistoricalEdges(projection.edges, preset) };
}
