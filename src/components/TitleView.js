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

const TitleView = ({ books, pageIndex, mobileResetKey = '', setBooks }) => {
  return (
    <>
      <Row className="d-none d-md-flex title-row-desktop">
        {books.map((book, i) => (
          <BookItem book={book} index={i} pageIndex={pageIndex} setBooks={setBooks} key={getBookKey(book, i)} />
        ))}
      </Row>

      <div className="d-md-none">
        <MobileChevronRow rowClassName="title-row" ariaLabel="Title view books" resetKey={mobileResetKey}>
          {books.map((book, i) => (
            <BookItem book={book} index={i} pageIndex={pageIndex} setBooks={setBooks} key={getBookKey(book, i)} />
          ))}
        </MobileChevronRow>
      </div>
    </>
  );
};

export default TitleView;
