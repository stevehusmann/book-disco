import {
  getQuadOutputSize,
  getQuadBounds,
  mapSourcePointToRotated,
  normalizeQuadPoints,
  orderRotatedQuadPointsAsSource,
  quadToPointsString
} from '../spineCropUtils';

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

  test('normalizeQuadPoints reorders arbitrary clicks into a consistent corner order', () => {
    const points = [
      { x: 80, y: 90 },
      { x: 10, y: 10 },
      { x: 110, y: 20 },
      { x: 20, y: 120 }
    ];

    expect(normalizeQuadPoints(points, 200, 200)).toEqual([
      { x: 10, y: 10 },
      { x: 110, y: 20 },
      { x: 80, y: 90 },
      { x: 20, y: 120 }
    ]);
  });

  test('90-degree rotation saves the original bottom-left corner first', () => {
    const rotatedCorners = [
      { x: 200, y: 100 },
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 0, y: 100 }
    ];

    expect(orderRotatedQuadPointsAsSource(rotatedCorners, 100, 200, 90)).toEqual([
      { x: 0, y: 200 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 }
    ]);
  });

  test('270-degree rotation orders corners from the rotated top-left', () => {
    const rotatedCorners = [
      { x: 0, y: 100 },
      { x: 200, y: 0 },
      { x: 0, y: 0 },
      { x: 200, y: 100 }
    ];

    expect(orderRotatedQuadPointsAsSource(rotatedCorners, 100, 200, 270)).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 0, y: 200 },
      { x: 0, y: 0 }
    ]);
  });

  test('a landscape crop rotated 90 degrees produces a portrait output size', () => {
    const sourceCorners = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 80 },
      { x: 0, y: 80 }
    ];
    const rotatedCorners = normalizeQuadPoints(
      sourceCorners.map((point) => mapSourcePointToRotated(point.x, point.y, 200, 80, 90)),
      80,
      200
    );

    expect(getQuadOutputSize(rotatedCorners)).toEqual({ width: 80, height: 200 });
  });
});
