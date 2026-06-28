import React from 'react';
import Row from 'react-bootstrap/Row';
import BookItem from './BookItem';
import MobileChevronRow from './MobileChevronRow';

const getBookKey = (book, fallbackIndex) => {
  return (
    book?._uid ||
    book?.id ||
    [
      book?.SeriesId || book?.Series || 'GEN',
      book?.ISBN || book?.EAN || '',
      book?.Title || 'Untitled',
      book?.Author || book?.AlphaAuthor || 'Unknown',
      book?.PAGINATION || ''
    ].join('::') ||
    `book-${fallbackIndex}`
  );
};

const AuthorView = ({ books, pageIndex = 0 }) => {
  const formatAuthor = (name) => {
    if (!name) return 'Unknown';
    const s = name.trim();
    if (s.includes(',')) {
      const parts = s.split(',');
      const last = parts[0].trim();
      const rest = parts.slice(1).join(',').trim();
      return rest ? `${rest} ${last}` : last;
    }
    return s;
  };

  // compute first/last indices of each author within the page's books
  const authorBounds = {};
  books.forEach((b, i) => {
    const key = (b.Author || b.AlphaAuthor || 'Unknown').trim() || 'Unknown';
    if (!authorBounds[key]) authorBounds[key] = { first: i, last: i };
    else authorBounds[key].last = i;
  });

  const mobileGroups = [];
  const mobileGroupMap = new Map();
  books.forEach((b) => {
    const key = (b.Author || b.AlphaAuthor || 'Unknown').trim() || 'Unknown';
    if (!mobileGroupMap.has(key)) {
      const group = { key, items: [] };
      mobileGroupMap.set(key, group);
      mobileGroups.push(group);
    }
    mobileGroupMap.get(key).items.push(b);
  });

  // No alternating backgrounds; we render uniform background and add
  // panel-edge classes for first/last items of each author.

  return (
    <>
      <Row className="d-none d-md-flex author-view-grid">
        {books.map((book, i) => {
          const key = (book.Author || book.AlphaAuthor || 'Unknown').trim() || 'Unknown';
          const bounds = authorBounds[key] || { first: -1, last: -1 };
          const header = i === bounds.first ? formatAuthor(key) : null;
          return (
            <BookItem key={getBookKey(book, i)} book={book} index={i} pageIndex={pageIndex} header={header} layout="author" />
          );
        })}
      </Row>

      <div className="d-md-none author-mobile-groups">
        {mobileGroups.map((group, groupIndex) => (
          <section key={`${group.key}-${groupIndex}`} className="author-mobile-group">
            <h5 className="author-mobile-group-title mb-2">{formatAuthor(group.key)}</h5>
            <MobileChevronRow rowClassName="author-mobile-row" ariaLabel={`Books by ${formatAuthor(group.key)}`}>
              {group.items.map((book, i) => (
                <BookItem
                  key={getBookKey(book, i)}
                  book={book}
                  index={i}
                  pageIndex={pageIndex}
                  header={null}
                  layout="author-mobile"
                />
              ))}
            </MobileChevronRow>
          </section>
        ))}
      </div>
    </>
  );
};

export default AuthorView;
