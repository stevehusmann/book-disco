import React from 'react';

const SpinePC = ({ book, pagination, thickness, spineText, showAuthorOnSpine, author }) => {
  // PC thickness: prefer parent-provided `thickness` (measured),
  // otherwise fall back to a simple heuristic based on pagination.
  // Clamp to reasonable visual bounds to avoid extreme widths.
  const p = Number(pagination) || 300;
  const fallback = Math.max(14, Math.round(10 + p * 0.07));
  const useThickness = Number.isFinite(thickness) ? Math.round(thickness) : fallback;
  const clampedThickness = Math.min(Math.max(useThickness, 6), 200);
  const seriesId = (book?.SeriesId || book?.Series || 'GEN').toString().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-_]/g, '').toLowerCase();
  const pcVersion = (book?.PCversion === 'v1' || book?.PCversion === 'v2' || book?.PCversion === 'v3')
    ? book.PCversion
    : 'v3';

  

  return (
    <div className={`book-spine pc-spine pc-version-${pcVersion} series-${seriesId}`} style={{ width: `${clampedThickness}px` }}>
      <div className="book-spine-title text-white">
        {showAuthorOnSpine && <span className="author-name text-white">{author}</span>}
        {spineText}

      </div>
      {pcVersion && pcVersion === 'v1' && (
        <div className="white-ribbon-v1">
          <div
            className="penguin-logo-v1"
            style={{ backgroundImage: `url(${book?.Image})` }}
          ></div>
        </div>
      )}
      {pcVersion && pcVersion === 'v1' && (
        <div className="penguin-text-v1">
          PENGUIN CLASSICS
        </div>
      )}
    </div>
  );
};

export default SpinePC;
