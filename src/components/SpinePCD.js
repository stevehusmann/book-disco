import React, { useEffect, useState } from 'react';
import {
  getQuadOutputSize,
  getLandscapeCropRotation,
  mapSourcePointToRotated,
  normalizeQuadPoints,
  renderPerspectiveQuadToCanvas
} from './spineCropUtils';

const SpinePCD = ({ book, pagination, thickness, spineText, showAuthorOnSpine, author }) => {
  // PCD thickness: prefer parent-provided measured thickness,
  // with pagination fallback and visual clamping.
  const p = Number(pagination) || 300;
  const fallback = Math.max(14, Math.round(10 + p * 0.07));
  const useThickness = Number.isFinite(thickness) ? Math.round(thickness) : fallback;
  const clampedThickness = Math.min(Math.max(useThickness, 6), 200);
  const seriesId = (book?.SeriesId || book?.Series || 'GEN')
    .toString()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-_]/g, '')
    .toLowerCase();

  const [spineImage, setSpineImage] = useState(null);

  useEffect(() => {
    const crop = book?.SpineCrop;
    const source = crop?.src || crop?.source;

    if (!crop || !source) {
      setSpineImage(null);
      return;
    }

    let mounted = true;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = source;

    img.onload = () => {
      try {
        const naturalW = img.naturalWidth || 0;
        const naturalH = img.naturalHeight || 0;
        if (!naturalW || !naturalH) {
          if (mounted) setSpineImage(null);
          return;
        }

        if (crop.mode === 'quad' && Array.isArray(crop.points) && crop.points.length === 4) {
          const rotation = [90, 180, 270].includes(Number(crop.editorRotation))
            ? Number(crop.editorRotation)
            : 0;
          const rotatedWidth = rotation % 180 === 0 ? naturalW : naturalH;
          const rotatedHeight = rotation % 180 === 0 ? naturalH : naturalW;
          const rotatedSource = document.createElement('canvas');
          rotatedSource.width = rotatedWidth;
          rotatedSource.height = rotatedHeight;
          const rotateContext = rotatedSource.getContext('2d');
          if (!rotateContext) {
            if (mounted) setSpineImage(null);
            return;
          }

          if (rotation === 90) {
            rotateContext.translate(rotatedWidth, 0);
            rotateContext.rotate(Math.PI / 2);
          } else if (rotation === 180) {
            rotateContext.translate(rotatedWidth, rotatedHeight);
            rotateContext.rotate(Math.PI);
          } else if (rotation === 270) {
            rotateContext.translate(0, rotatedHeight);
            rotateContext.rotate(-Math.PI / 2);
          }
          rotateContext.drawImage(img, 0, 0, naturalW, naturalH);

          const rotatedPoints = crop.points.map((point) => mapSourcePointToRotated(
            Number(point.x),
            Number(point.y),
            naturalW,
            naturalH,
            rotation
          ));
          const normalized = normalizeQuadPoints(rotatedPoints, rotatedWidth, rotatedHeight);
          const outputSize = getQuadOutputSize(normalized);
          const perspectiveCanvas = renderPerspectiveQuadToCanvas(
            rotatedSource,
            normalized,
            outputSize.width,
            outputSize.height
          );
          const outputRotation = getLandscapeCropRotation(
            perspectiveCanvas.width,
            perspectiveCanvas.height,
            rotation
          );
          let canvas = perspectiveCanvas;
          if (outputRotation) {
            canvas = document.createElement('canvas');
            canvas.width = perspectiveCanvas.height;
            canvas.height = perspectiveCanvas.width;
            const outputContext = canvas.getContext('2d');
            if (!outputContext) {
              if (mounted) setSpineImage(null);
              return;
            }
            if (outputRotation === 90) {
              outputContext.translate(canvas.width, 0);
              outputContext.rotate(Math.PI / 2);
            } else {
              outputContext.translate(0, canvas.height);
              outputContext.rotate(-Math.PI / 2);
            }
            outputContext.drawImage(perspectiveCanvas, 0, 0);
          }
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          if (mounted) setSpineImage(dataUrl);
          return;
        }

        let sx = Number(crop.x);
        let sy = Number(crop.y);
        let sw = Number(crop.width);
        let sh = Number(crop.height);

        if (!Number.isFinite(sx) && Number.isFinite(Number(crop.nx))) sx = Math.round(Number(crop.nx) * naturalW);
        if (!Number.isFinite(sy) && Number.isFinite(Number(crop.ny))) sy = Math.round(Number(crop.ny) * naturalH);
        if (!Number.isFinite(sw) && Number.isFinite(Number(crop.nw))) sw = Math.round(Number(crop.nw) * naturalW);
        if (!Number.isFinite(sh) && Number.isFinite(Number(crop.nh))) sh = Math.round(Number(crop.nh) * naturalH);

        sx = Math.max(0, Math.min(Math.round(sx || 0), naturalW - 1));
        sy = Math.max(0, Math.min(Math.round(sy || 0), naturalH - 1));
        sw = Math.max(1, Math.min(Math.round(sw || naturalW), naturalW - sx));
        sh = Math.max(1, Math.min(Math.round(sh || naturalH), naturalH - sy));

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          if (mounted) setSpineImage(null);
          return;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        if (mounted) setSpineImage(dataUrl);
      } catch (e) {
        if (mounted) setSpineImage(null);
      }
    };

    img.onerror = () => {
      if (mounted) setSpineImage(null);
    };

    return () => {
      mounted = false;
    };
  }, [book?.SpineCrop]);

  return (
    <div
      className={`book-spine pcd-spine series-${seriesId}`}
      style={{
        width: `${clampedThickness}px`,
        backgroundImage: spineImage ? `url(${spineImage})` : undefined,
        backgroundSize: '100% 100%',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center'
      }}
    >

    </div>
  );
};

export default SpinePCD;
