export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const normalizeQuadPoints = (points, width, height) => {
  if (!Array.isArray(points)) return [];

  const normalized = points.slice(0, 4).map((point) => {
    const x = Number.isFinite(Number(point?.x)) ? Number(point.x) : 0;
    const y = Number.isFinite(Number(point?.y)) ? Number(point.y) : 0;
    return {
      x: clamp(x, 0, Math.max(0, Number(width) || 0)),
      y: clamp(y, 0, Math.max(0, Number(height) || 0))
    };
  });

  if (normalized.length < 4) return normalized;

  const centroid = normalized.reduce((acc, point) => {
    acc.x += point.x;
    acc.y += point.y;
    return acc;
  }, { x: 0, y: 0 });

  centroid.x /= normalized.length;
  centroid.y /= normalized.length;

  const sorted = [...normalized].sort((a, b) => {
    const aAngle = Math.atan2(a.y - centroid.y, a.x - centroid.x);
    const bAngle = Math.atan2(b.y - centroid.y, b.x - centroid.x);
    return aAngle - bAngle;
  });

  const area = sorted.reduce((sum, point, index) => {
    const next = sorted[(index + 1) % sorted.length];
    return sum + (point.x * next.y - next.x * point.y);
  }, 0);

  if (area < 0) {
    sorted.reverse();
  }

  const startIndex = sorted.reduce((bestIdx, point, index, arr) => {
    const bestPoint = arr[bestIdx];
    if (point.y < bestPoint.y || (point.y === bestPoint.y && point.x < bestPoint.x)) {
      return index;
    }
    return bestIdx;
  }, 0);

  const rotated = [...sorted.slice(startIndex), ...sorted.slice(0, startIndex)];
  return rotated;
};

export const getQuadBounds = (points) => {
  if (!Array.isArray(points) || points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const normalized = normalizeQuadPoints(points, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const xs = normalized.map((point) => point.x);
  const ys = normalized.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
};

export const quadToPointsString = (points) =>
  points
    .map((point) => `${Number(point?.x ?? 0)},${Number(point?.y ?? 0)}`)
    .join(' ');

export const renderPerspectiveQuadToCanvas = (sourceCanvas, quadPoints, targetWidth, targetHeight) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Number(targetWidth) || 1);
  canvas.height = Math.max(1, Number(targetHeight) || 1);

  const ctx = canvas.getContext('2d');
  if (!ctx || !sourceCanvas) return canvas;

  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) return canvas;

  const sourceImageData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const normalized = normalizeQuadPoints(quadPoints, sourceCanvas.width, sourceCanvas.height);
  if (normalized.length !== 4) {
    ctx.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const [p0, p1, p2, p3] = normalized;
  const targetImage = ctx.createImageData(canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 1) {
    const v = canvas.height > 1 ? y / (canvas.height - 1) : 0;
    for (let x = 0; x < canvas.width; x += 1) {
      const u = canvas.width > 1 ? x / (canvas.width - 1) : 0;

      const sourceX = ((1 - u) * (1 - v) * p0.x)
        + (u * (1 - v) * p1.x)
        + (u * v * p2.x)
        + ((1 - u) * v * p3.x);
      const sourceY = ((1 - u) * (1 - v) * p0.y)
        + (u * (1 - v) * p1.y)
        + (u * v * p2.y)
        + ((1 - u) * v * p3.y);

      const sampleX = clamp(Math.round(sourceX), 0, sourceCanvas.width - 1);
      const sampleY = clamp(Math.round(sourceY), 0, sourceCanvas.height - 1);
      const sourceIndex = (sampleY * sourceCanvas.width + sampleX) * 4;
      const targetIndex = (y * canvas.width + x) * 4;

      targetImage.data[targetIndex] = sourceImageData.data[sourceIndex];
      targetImage.data[targetIndex + 1] = sourceImageData.data[sourceIndex + 1];
      targetImage.data[targetIndex + 2] = sourceImageData.data[sourceIndex + 2];
      targetImage.data[targetIndex + 3] = sourceImageData.data[sourceIndex + 3];
    }
  }

  ctx.putImageData(targetImage, 0, 0);
  return canvas;
};
