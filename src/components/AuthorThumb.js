import React from 'react';
import SpineOWC from './SpineOWC';
import SpineBNC from './SpineBNC';

const AuthorThumb = ({ book }) => {
  const width = 200;
  const height = 300;
  const thickness = Math.max(10, 10 + (book?.PAGINATION || 300) * 0.05);
  const spineText = (book.SpineTitle || book.Title || '').trim();
  const lastName = (book.AlphaAuthor || '').split(',')[0] || '';
  const showAuthorOnSpine = book.Author && book.Author !== 'Unknown' && lastName && !spineText.toLowerCase().includes(lastName.toLowerCase());
  const authorFull = book.Author || book.AlphaAuthor || '';

  return (
    <div style={{ width }}>
      <a href={book?.Website} target="_blank" rel="noopener noreferrer">
        <div className="book-container">
          <div className="book" style={{ width, height, transform: `translateZ(-${thickness}px)` }}>
            <div className="book-front" style={{ transform: `translateZ(${thickness - 1}px)` }}>
              <img src={book.Image} alt={book.Title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>

            {book.SeriesId === 'OWC' && (
              <SpineOWC book={book} pagination={book?.PAGINATION} spineText={spineText} showAuthorOnSpine={showAuthorOnSpine} author={authorFull} />
            )}

            {book.SeriesId === 'BNC' && (
              <SpineBNC book={book} pagination={book?.PAGINATION} spineText={spineText} showAuthorOnSpine={showAuthorOnSpine} author={authorFull} />
            )}

          </div>
        </div>
      </a>
    </div>
  );
};

export default AuthorThumb;
