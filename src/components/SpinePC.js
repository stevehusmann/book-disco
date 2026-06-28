import React from 'react';

const SpinePC = ({ book, pagination, thickness, spineText, showAuthorOnSpine, author, ribbon }) => {
  // PC thickness: prefer parent-provided `thickness` (measured),
  // otherwise fall back to a simple heuristic based on pagination.
  // Clamp to reasonable visual bounds to avoid extreme widths.
  const p = Number(pagination) || 300;
  const fallback = Math.max(14, Math.round(10 + p * 0.07));
  const useThickness = Number.isFinite(thickness) ? Math.round(thickness) : fallback;
  const clampedThickness = Math.min(Math.max(useThickness, 6), 200);
  const seriesId = (book?.SeriesId || book?.Series || 'GEN').toString().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-_]/g, '').toLowerCase();
  const ribbonColor = ribbon?.color || 'rgb(241, 239, 236)';

  // Use the exact same pixel distances measured on the rendered cover.
  // The spine height matches the cover height (same book element), so the
  // band top/bottom positions are identical — no coordinate conversion needed.
  const hasMeasured = ribbon && Number.isFinite(ribbon.topPx) && Number.isFinite(ribbon.coverHeightPx) && ribbon.coverHeightPx > 0;
  const ribbonTopPx    = hasMeasured ? ribbon.topPx    : null;
  const ribbonBottomPx = hasMeasured ? ribbon.bottomPx : null;
  const coverHeightPx  = hasMeasured ? ribbon.coverHeightPx : null;

  

  return (
    <div className={`book-spine pc-spine series-${seriesId}`} style={{ width: `${clampedThickness}px` }}>
      {hasMeasured && (
        <div
          className="pc-ribbon-band"
          style={{
            top: `${(ribbonTopPx / coverHeightPx) * 100}%`,
            height: `${((ribbonBottomPx - ribbonTopPx + 1) / coverHeightPx) * 100}%`,
            background: ribbonColor
          }}
        />
      )}

      <div className="book-spine-title text-white">
        {spineText}
        {showAuthorOnSpine && <span className="author-name text-white">{author}</span>}
      </div>
    </div>
  );
};

export default SpinePC;
