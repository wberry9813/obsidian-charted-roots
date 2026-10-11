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
export function historicalParallelSag(baseSag: number, index: number): number {
  return baseSag + Math.max(0, index) * 26;
}
