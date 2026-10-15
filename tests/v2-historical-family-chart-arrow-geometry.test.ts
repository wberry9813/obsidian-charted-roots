import { describe, expect, it } from 'vitest';
import { historicalArrowGeometry } from '../src/v2/historical-family-chart/arrow-geometry';

describe('Historical relationship arrow geometry', () => {
  it('points to the semantic object when path order matches relationship order', () => {
    const arrow = historicalArrowGeometry(true, 0, 0, 100, 0, 50, 20);
    expect(arrow?.tipX).toBe(100);
    expect(arrow?.tipY).toBe(0);
    const vertices = arrow!.points.split(' ').map(pair => pair.split(',').map(Number));
    expect((vertices[1][0] + vertices[2][0]) / 2).toBeLessThan(100);
  });
  it('points to the semantic object when the SVG bezier is reversed', () => {
    const arrow = historicalArrowGeometry(false, 0, 0, 100, 0, 50, 20);
    expect(arrow?.tipX).toBe(0);
    expect(arrow?.tipY).toBe(0);
    const vertices = arrow!.points.split(' ').map(pair => pair.split(',').map(Number));
    expect((vertices[1][0] + vertices[2][0]) / 2).toBeGreaterThan(0);
  });
  it('rejects degenerate tangents', () => {
    expect(historicalArrowGeometry(true, 0, 0, 1, 1, 1, 1)).toBeNull();
  });
});
