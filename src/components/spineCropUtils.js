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

export const mapRotatedPointToSource = (x, y, width, height, rotation) => {
  if (rotation === 90) return { x: y, y: height - x };
  if (rotation === 180) return { x: width - x, y: height - y };
  if (rotation === 270) return { x: width - y, y: x };
  return { x, y };
};

export const mapSourcePointToRotated = (x, y, width, height, rotation) => {
  if (rotation === 90) return { x: height - y, y: x };
  if (rotation === 180) return { x: width - x, y: height - y };
  if (rotation === 270) return { x: y, y: width - x };
  return { x, y };
};

export const orderRotatedQuadPointsAsSource = (points, width, height, rotation) => {
  const rotatedWidth = rotation % 180 === 0 ? width : height;
  const rotatedHeight = rotation % 180 === 0 ? height : width;
  return normalizeQuadPoints(points, rotatedWidth, rotatedHeight)
    .map((point) => mapRotatedPointToSource(point.x, point.y, width, height, rotation));
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

export const getQuadOutputSize = (points) => {
  if (!Array.isArray(points) || points.length !== 4) return { width: 1, height: 1 };
  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  const distance = (first, second) => Math.hypot(second.x - first.x, second.y - first.y);
  return {
    width: Math.max(1, Math.round((distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2)),
    height: Math.max(1, Math.round((distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2))
  };
};

export const getLandscapeCropRotation = (width, height, selectedRotation) => {
  if (Number(width) <= Number(height)) return 0;
  if (selectedRotation === 90 || selectedRotation === 270) return selectedRotation;
  return 0;
};

const rotateCanvas = (sourceCanvas, rotation) => {
  const normalizedRotation = ((Number(rotation) % 360) + 360) % 360;
  if (!normalizedRotation) return sourceCanvas;

  const canvas = document.createElement('canvas');
  canvas.width = normalizedRotation % 180 === 0 ? sourceCanvas.width : sourceCanvas.height;
  canvas.height = normalizedRotation % 180 === 0 ? sourceCanvas.height : sourceCanvas.width;
  const context = canvas.getContext('2d');
  if (!context) return sourceCanvas;

  if (normalizedRotation === 90) {
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
  } else if (normalizedRotation === 180) {
    context.translate(canvas.width, canvas.height);
    context.rotate(Math.PI);
  } else if (normalizedRotation === 270) {
    context.translate(0, canvas.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(sourceCanvas, 0, 0);
  return canvas;
};

export const renderSpineCropCanvas = (sourceImage, crop) => {
  const sourceWidth = Number(sourceImage?.naturalWidth || sourceImage?.width || 0);
  const sourceHeight = Number(sourceImage?.naturalHeight || sourceImage?.height || 0);
  if (!sourceWidth || !sourceHeight || !crop) return null;

  const editorRotation = [90, 180, 270].includes(Number(crop.editorRotation))
    ? Number(crop.editorRotation)
    : 0;
  let result;

  if (crop.mode === 'quad' && Array.isArray(crop.points) && crop.points.length === 4) {
    const rotatedWidth = editorRotation % 180 === 0 ? sourceWidth : sourceHeight;
    const rotatedHeight = editorRotation % 180 === 0 ? sourceHeight : sourceWidth;
    const rotatedSource = document.createElement('canvas');
    rotatedSource.width = rotatedWidth;
    rotatedSource.height = rotatedHeight;
    const context = rotatedSource.getContext('2d');
    if (!context) return null;

    if (editorRotation === 90) {
      context.translate(rotatedWidth, 0);
      context.rotate(Math.PI / 2);
    } else if (editorRotation === 180) {
      context.translate(rotatedWidth, rotatedHeight);
      context.rotate(Math.PI);
    } else if (editorRotation === 270) {
      context.translate(0, rotatedHeight);
      context.rotate(-Math.PI / 2);
    }
    context.drawImage(sourceImage, 0, 0, sourceWidth, sourceHeight);

    const points = normalizeQuadPoints(
      crop.points.map((point) => mapSourcePointToRotated(
        Number(point.x), Number(point.y), sourceWidth, sourceHeight, editorRotation
      )),
      rotatedWidth,
      rotatedHeight
    );
    const size = getQuadOutputSize(points);
    result = renderPerspectiveQuadToCanvas(rotatedSource, points, size.width, size.height);
    result = rotateCanvas(result, getLandscapeCropRotation(result.width, result.height, editorRotation));
  } else {
    let x = Number(crop.x);
    let y = Number(crop.y);
    let width = Number(crop.width);
    let height = Number(crop.height);
    if (!Number.isFinite(x) && Number.isFinite(Number(crop.nx))) x = Number(crop.nx) * sourceWidth;
    if (!Number.isFinite(y) && Number.isFinite(Number(crop.ny))) y = Number(crop.ny) * sourceHeight;
    if (!Number.isFinite(width) && Number.isFinite(Number(crop.nw))) width = Number(crop.nw) * sourceWidth;
    if (!Number.isFinite(height) && Number.isFinite(Number(crop.nh))) height = Number(crop.nh) * sourceHeight;
    x = clamp(Math.round(x || 0), 0, sourceWidth - 1);
    y = clamp(Math.round(y || 0), 0, sourceHeight - 1);
    width = clamp(Math.round(width || sourceWidth), 1, sourceWidth - x);
    height = clamp(Math.round(height || sourceHeight), 1, sourceHeight - y);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(sourceImage, x, y, width, height, 0, 0, width, height);
    result = rotateCanvas(canvas, editorRotation);
    result = rotateCanvas(result, getLandscapeCropRotation(result.width, result.height, editorRotation));
  }

  return rotateCanvas(result, crop.outputRotation || 0);
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

  const sourceBitmap = sourceCanvas instanceof HTMLCanvasElement
    ? sourceCanvas
    : (() => {
        const tempCanvas = document.createElement('canvas');
        const width = Number(sourceCanvas?.naturalWidth || sourceCanvas?.width || 1);
        const height = Number(sourceCanvas?.naturalHeight || sourceCanvas?.height || 1);
        tempCanvas.width = Math.max(1, width);
        tempCanvas.height = Math.max(1, height);
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(sourceCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
        }
        return tempCanvas;
      })();

  const sourceCtx = sourceBitmap.getContext('2d');
  if (!sourceCtx) return canvas;

  const sourceImageData = sourceCtx.getImageData(0, 0, sourceBitmap.width, sourceBitmap.height);
  const normalized = normalizeQuadPoints(quadPoints, sourceBitmap.width, sourceBitmap.height);
  if (normalized.length !== 4) {
    ctx.drawImage(sourceBitmap, 0, 0, canvas.width, canvas.height);
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

      const sampleX = clamp(Math.round(sourceX), 0, sourceBitmap.width - 1);
      const sampleY = clamp(Math.round(sourceY), 0, sourceBitmap.height - 1);
      const sourceIndex = (sampleY * sourceBitmap.width + sampleX) * 4;
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
