import { describe, expect, it } from 'vitest';
import { filterHistoricalEdges, filterHistoricalProjection } from '../src/v2/historical-family-chart/relation-presets';
import type { HistoricalFamilyChartEdge, HistoricalFamilyChartProjection } from '../src/v2/historical-family-chart/types';

const edges = ['ally_of', 'political_rival', 'hostile_to', 'mentor_of', 'recommends', 'unclassified_custom']
  .map((predicate, i) => ({ id: String(i), predicate } as HistoricalFamilyChartEdge));

describe('Historical relation presets', () => {
  it('keeps all—including custom predicates—in the default view', () => {
    expect(filterHistoricalEdges(edges, 'all')).toEqual(edges);
  });
  it('filters politics without rewriting the source edges', () => {
    expect(filterHistoricalEdges(edges, 'political').map(x => x.predicate))
      .toEqual(['ally_of', 'political_rival', 'hostile_to']);
    expect(edges).toHaveLength(6);
  });
  it('includes teaching and recommendation in mentorship', () => {
    expect(filterHistoricalEdges(edges, 'mentorship').map(x => x.predicate))
      .toEqual(['mentor_of', 'recommends']);
  });
  it('preserves temporal and skip metadata while filtering', () => {
    const projection = { edges, focusApplied: true, skipped: { outsideTemporalFocus: 2 } } as HistoricalFamilyChartProjection;
    const filtered = filterHistoricalProjection(projection, 'political');
    expect(filtered.focusApplied).toBe(true);
    expect(filtered.skipped).toBe(projection.skipped);
    expect(filtered.edges).toHaveLength(3);
  });
});
