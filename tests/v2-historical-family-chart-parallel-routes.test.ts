import { describe, expect, it } from 'vitest';
import { compareHistoricalRoutes, historicalParallelSag } from '../src/v2/historical-family-chart/parallel-routes';

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
  it('spaces three relations by distinct curve depths', () => {
    expect([0, 1, 2].map(i => historicalParallelSag(120, i))).toEqual([120, 146, 172]);
  });
});
