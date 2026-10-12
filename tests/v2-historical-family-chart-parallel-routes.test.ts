import { describe, expect, it } from 'vitest';
import { compareHistoricalRoutes, historicalParallelSag, historicalPersistentLabelVisible } from '../src/v2/historical-family-chart/parallel-routes';

describe('Historical parallel relation routing', () => {
  it('orders parallel relations independent of indexing order', () => {
    const routes = [
      { predicate: 'rival', sourceId: 'cao', targetId: 'xun', from: '200 CE' },
      { predicate: 'ally', sourceId: 'cao', targetId: 'xun', from: '196 CE' },
      { predicate: 'ally', sourceId: 'cao', targetId: 'xun', from: '198 CE' }
    ];
    const ordered = [...routes].sort(compareHistoricalRoutes);
    expect(ordered.map(r => r.predicate + r.from)).toEqual([
      'ally196 CE', 'ally198 CE', 'rival200 CE'
    ]);
    expect([...routes].reverse().sort(compareHistoricalRoutes)).toEqual(ordered);
  });
  it('compresses dense multi-edge stacks while keeping all routes distinct', () => {
    const dense = Array.from({ length: 12 }, (_, i) => historicalParallelSag(120, i, 12));
    expect(new Set(dense).size).toBe(12);
    expect(dense[0]).toBe(120);
    expect(dense[11]).toBeCloseTo(276);
    expect(dense[11]).toBeLessThan(historicalParallelSag(120, 11, 3));
  });
  it('caps dense persistent labels while sampling the full stack', () => {
    const visible12 = Array.from({ length: 12 }, (_, i) =>
      historicalPersistentLabelVisible(i, 12)
    );
    expect(visible12.filter(Boolean)).toHaveLength(4);
    expect(visible12[0]).toBe(true);
    expect(visible12[11]).toBe(true);
    expect(visible12.map((v, i) => v ? i : -1).filter(i => i >= 0)).toEqual([0, 4, 7, 11]);

    expect(Array.from({ length: 4 }, (_, i) =>
      historicalPersistentLabelVisible(i, 4)
    )).toEqual([true, true, true, true]);
  });
  it('spaces three relations by distinct curve depths', () => {
    expect([0, 1, 2].map(i => historicalParallelSag(120, i))).toEqual([120, 146, 172]);
  });
});
