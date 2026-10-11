/** Deterministic ordering and curvature for parallel historical edges. */
export interface HistoricalRouteKey {
  predicate: string;
  sourceId: string;
  targetId: string;
  from?: string;
  to?: string;
}
export function compareHistoricalRoutes(a: HistoricalRouteKey, b: HistoricalRouteKey): number {
  return a.predicate.localeCompare(b.predicate)
    || a.sourceId.localeCompare(b.sourceId)
    || a.targetId.localeCompare(b.targetId)
    || (a.from ?? '').localeCompare(b.from ?? '')
    || (a.to ?? '').localeCompare(b.to ?? '');
}
export function historicalParallelSag(baseSag: number, index: number, count = 1): number {
  // Keep small stacks legible, but compress curvature for crowded pairs.
  // Avoid pushing the outer routes hundreds of pixels beyond the cards.
  const step = count > 6 ? Math.max(10, 156 / (count - 1)) : 26;
  return baseSag + Math.max(0, index) * step;
}
