/** Historical arrows follow semantic direction, independent of SVG path order. */
export interface HistoricalArrowGeometry {
  tipX: number;
  tipY: number;
  points: string;
}
export function historicalArrowGeometry(
  sourceFirst: boolean,
  x1: number, y1: number,
  x2: number, y2: number,
  controlX: number, controlY: number
): HistoricalArrowGeometry | null {
  const tipX = sourceFirst ? x2 : x1;
  const tipY = sourceFirst ? y2 : y1;
  // In both path orientations, aim the tip at the semantic object and
  // position the base toward the control point (inside the curve).
  const tx = tipX - controlX;
  const ty = tipY - controlY;
  const length = Math.hypot(tx, ty);
  if (!Number.isFinite(length) || length <= 0) return null;
  const ux = tx / length;
  const uy = ty / length;
  const baseX = tipX - ux * 11;
  const baseY = tipY - uy * 11;
  const wingX = -uy * 4.5;
  const wingY = ux * 4.5;
  return {
    tipX, tipY,
    points: `${tipX},${tipY} ${baseX + wingX},${baseY + wingY} ${baseX - wingX},${baseY - wingY}`
  };
}
