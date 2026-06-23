import React, { useEffect, useState } from 'react';

const SpineBNC = ({ book, pagination, thickness, spineText, showAuthorOnSpine, author }) => {
  // BNC thickness: prefer parent-provided `thickness` (measured),
  // otherwise fall back to a simple heuristic based on pagination.
  // Clamp to reasonable visual bounds to avoid extreme widths.
  const p = Number(pagination) || 300;
  const fallback = Math.max(14, Math.round(10 + p * 0.07));
  const useThickness = Number.isFinite(thickness) ? Math.round(thickness) : fallback;
  const clampedThickness = Math.min(Math.max(useThickness, 6), 200);
  const seriesId = (book?.SeriesId || book?.Series || 'GEN').toString().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-_]/g, '').toLowerCase();
  const [bgColor, setBgColor] = useState(null);

  useEffect(() => {
    if (!book?.Image) {
      setBgColor(null);
      return;
    }
    let mounted = true;
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.src = book.Image;
    const trySample = () => {
      try {
        const cw = Math.min(100, img.naturalWidth || 100);
        const ch = Math.min(100, img.naturalHeight || 100);
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, cw, ch);
        // sample a small top-left region (10x10 or scaled)
        const sampleW = Math.max(1, Math.min(20, Math.floor(cw * 0.1)));
        const sampleH = Math.max(1, Math.min(20, Math.floor(ch * 0.1)));
        const data = ctx.getImageData(0, 0, sampleW, sampleH).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i+3];
          if (alpha === 0) continue;
          r += data[i]; g += data[i+1]; b += data[i+2]; count++;
        }
        if (count > 0) {
          r = Math.round(r / count);
          g = Math.round(g / count);
          b = Math.round(b / count);
          const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
          if (mounted) setBgColor(hex);
          return;
        }
      } catch (err) {
        // canvas may be tainted due to CORS; fall through to fallback
      }
      if (mounted) setBgColor(null);
    };
    if (img.complete && img.naturalWidth) {
      trySample();
    } else {
      img.onload = trySample;
      img.onerror = () => { if (mounted) setBgColor(null); };
    }
    return () => { mounted = false; };
  }, [book?.Image]);

  return (
    <div className={`book-spine bnc-spine series-${seriesId}`} style={{ width: `${clampedThickness}px`, backgroundColor: bgColor || undefined, }}>
      <div
        className="bnc-gray-spine"
        style={{ backgroundColor: bgColor || undefined, backgroundImage: `url(${book?.Image})` }}
      ></div>
      <div className="book-spine-title text-white">
        {spineText}
        {showAuthorOnSpine && <span className="author-name text-white">{author}</span>}
      </div>
    </div>
  );
};

export default SpineBNC;
