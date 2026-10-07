import { getQuadBounds, normalizeQuadPoints, quadToPointsString } from '../spineCropUtils';

describe('spine crop quad helpers', () => {
  test('normalizeQuadPoints clamps points to canvas bounds', () => {
    const points = [
      { x: -10, y: -20 },
      { x: 200, y: 10 },
      { x: 150, y: 120 },
      { x: 15, y: 220 }
    ];

    const normalized = normalizeQuadPoints(points, 160, 180);
    expect(normalized).toEqual([
      { x: 0, y: 0 },
      { x: 160, y: 10 },
      { x: 150, y: 120 },
      { x: 15, y: 180 }
    ]);
  });

  test('getQuadBounds computes full bounding box for a skewed selection', () => {
    const bounds = getQuadBounds([
      { x: 40, y: 20 },
      { x: 110, y: 5 },
      { x: 150, y: 60 },
      { x: 30, y: 130 }
    ]);

    expect(bounds).toEqual({ x: 30, y: 5, width: 120, height: 125 });
  });

  test('quadToPointsString formats SVG polygon coordinates', () => {
    expect(quadToPointsString([
      { x: 0, y: 0 },
      { x: 50, y: 10 },
      { x: 80, y: 90 },
      { x: 10, y: 100 }
    ])).toBe('0,0 50,10 80,90 10,100');
  });
});
