import React from 'react';

const SpineOWC = ({ book, pagination, thickness, spineText, showAuthorOnSpine, author }) => {
  // compute last name from provided author string
  const computeLastName = (a, fallbackAlpha) => {
    const s = (a || fallbackAlpha || '').trim();
    if (!s) return '';
    if (s.includes(',')) return s.split(',')[0].trim();
    const parts = s.split(/\s+/);
    return parts[parts.length - 1] || '';
  };
  const lastName = computeLastName(author, book?.AlphaAuthor);
  // allow parent to pass a computed thickness; otherwise fall back to heuristic
  const p = pagination || 300;
  const computed = Math.max(12, Math.round(8 + p * 0.06));
  const useThickness = typeof thickness === 'number' ? thickness : computed;
  const seriesId = (book?.SeriesId || book?.Series || 'GEN').toString().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-_]/g, '').toLowerCase();
  return (
    <div className={`book-spine owc-spine series-${seriesId}`} style={{ width: `${thickness}px` }}>
      <div className="red-spine"></div>
      <div
        className="gray-spine"
        style={{ backgroundImage: `url(${book?.Image})` }}
      ></div>
      <div className="book-spine-title">
        {showAuthorOnSpine && <span className="author-name">{lastName}</span>}
        {spineText}
      </div>
      <span className="oxford">OXFORD</span>
    </div>
  );
};

export default SpineOWC;
