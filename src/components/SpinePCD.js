import React, { useEffect, useState } from 'react';
import { renderSpineCropCanvas } from './spineCropUtils';

const SpinePCD = ({ book, pagination, thickness }) => {
  const pageCount = Number(pagination) || 300;
  const fallbackThickness = Math.max(14, Math.round(10 + pageCount * 0.07));
  const measuredThickness = Number.isFinite(thickness) ? Math.round(thickness) : fallbackThickness;
  const clampedThickness = Math.min(Math.max(measuredThickness, 6), 200);
  const seriesId = (book?.SeriesId || book?.Series || 'GEN')
    .toString()
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9-_]/g, '')
    .toLowerCase();
  const crop = book?.SpineCrop;
  const [spineImage, setSpineImage] = useState(null);

  useEffect(() => {
    const source = crop?.src || crop?.source;
    if (!crop || !source) {
      setSpineImage(null);
      return undefined;
    }

    let mounted = true;
    const image = new Image();
    image.crossOrigin = 'Anonymous';
    image.onload = () => {
      try {
        const canvas = renderSpineCropCanvas(image, crop);
        if (mounted) setSpineImage(canvas ? canvas.toDataURL('image/jpeg', 0.92) : null);
      } catch (_error) {
        if (mounted) setSpineImage(null);
      }
    };
    image.onerror = () => {
      if (mounted) setSpineImage(null);
    };
    image.src = source;

    return () => {
      mounted = false;
    };
  }, [crop]);

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
    />
  );
};

export default SpinePCD;
