import React from 'react';
import Row from 'react-bootstrap/Row';
import BookItem from './BookItem';

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

const TitleView = ({ books, pageIndex }) => {
  return (
    <Row className="d-flex title-row">
      {books.map((book, i) => (
        <BookItem book={book} index={i} pageIndex={pageIndex} key={getBookKey(book, i)} />
      ))}
    </Row>
  );
};

export default TitleView;
