import React, { useEffect, useRef, useState } from 'react';
import Col from 'react-bootstrap/Col';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import SpineOWC from './SpineOWC';
import SpineBNC from './SpineBNC';
import SpinePC from './SpinePC';
import SpinePCD from './SpinePCD';
import { apiUrl } from '../apiUrl';

const PHYSICAL_SERIES_SIZES = {
  container: { width: 7.0, height: 9 },
  owc: { width: 5.1875, height: 7.6875 },
  bnc: { width: 5.25, height: 8.0 },
  pc: { width: 5.0, height: 7.75 },
  pcd: { width: 5.67, height: 8.35 }
};

const EDIT_FIELDS = [
  { key: 'Title', label: 'Title' },
  { key: 'FullTitle', label: 'Full Title' },
  { key: 'Author', label: 'Author' },
  { key: 'AlphaAuthor', label: 'Alpha Author' },
  { key: 'AlphaTitle', label: 'Alpha Title' },
  { key: 'SpineTitle', label: 'Spine Title' },
  { key: 'Series', label: 'Series' },
  { key: 'SeriesId', label: 'Series Id' },
  { key: 'BookWidth', label: 'Book Width' },
  { key: 'BookHeight', label: 'Book Height' },
  { key: 'ISBN', label: 'ISBN' },
  { key: 'EAN', label: 'EAN' },
  { key: 'Website', label: 'Website' },
  { key: 'Image', label: 'Image URL' },
  { key: 'GOODREADS', label: 'GoodReads URL' },
  { key: 'Price', label: 'Price' },
  { key: 'PAGINATION', label: 'Pagination' },
  { key: 'BINDING', label: 'Binding' },
  { key: 'PCversion', label: 'PC Version' },
  { key: 'PublicationDate', label: 'Publication Date' },
  { key: 'OriginalPublicationDate', label: 'Original Publication Date' },
  { key: 'PenguinID', label: 'Penguin ID' },
  { key: 'BICSubjects', label: 'BIC Subjects' },
  { key: 'BICQualifiers', label: 'BIC Qualifiers' },
  { key: 'Subject', label: 'Subject' },
  { key: 'Illustrations', label: 'Illustrations' },
  { key: 'Notes', label: 'Notes', multiline: true, rows: 3 },
  { key: 'Description', label: 'Description', multiline: true, rows: 4 },
  { key: 'Authors', label: 'Authors (comma-separated)' },
  { key: 'Editors', label: 'Editors (comma-separated)' },
  { key: 'Translators', label: 'Translators (comma-separated)' }
];

const normalizeEditableBook = (book) => {
  const normalized = {};
  EDIT_FIELDS.forEach(({ key }) => {
    normalized[key] = (book?.[key] ?? '').toString();
  });
  return normalized;
};

const BookItem = ({ book, index, pageIndex, header = null, colStyle = {}, colClass = '', layout = 'title', setBooks }) => {

  const pagination = Number(book?.PAGINATION || 300);
  const series = (book?.SeriesId || book?.Series || '').toString();
  const seriesId = (book?.SeriesId || book?.Series || 'GEN').toString().replace(/\s+/g, '-').replace(/[^A-Za-z0-9-_]/g, '').toLowerCase();

  const seriesSize = PHYSICAL_SERIES_SIZES[seriesId];

  const bookRef = useRef(null);
  const [thicknessWidth, setThicknessWidth] = useState(null);
  const [horizontalPadding, setHorizontalPadding] = useState(0);
  const [topPadding, setTopPadding] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStatus, setEditStatus] = useState('');
  const [editForm, setEditForm] = useState(() => normalizeEditableBook(book));

  useEffect(() => {
    setEditForm(normalizeEditableBook(book));
  }, [book]);

  const bookDimensionOverride = {
    width: Number(book?.BookWidth),
    height: Number(book?.BookHeight)
  };
  const hasBookDimensionOverride = bookDimensionOverride.width > 0 && bookDimensionOverride.height > 0;
  const physicalBookSize = hasBookDimensionOverride ? bookDimensionOverride : seriesSize;
  const horizontalPaddingRatio = physicalBookSize
    ? (PHYSICAL_SERIES_SIZES.container.width - physicalBookSize.width) / PHYSICAL_SERIES_SIZES.container.width / 2
    : 0;
  const topPaddingRatio = physicalBookSize
    ? (PHYSICAL_SERIES_SIZES.container.height - physicalBookSize.height) / PHYSICAL_SERIES_SIZES.container.height
    : 0;

  // Try to compute thickness proportionally from rendered cover width for OWC series.
  // Physical reference: OWC 5-3/16" (83/16 in) wide, 464pp -> thickness 13/16".
  // Per-page multiplier relative to cover width = (13/83) / 464 = 13/(83*464).
  const OWC_PER_PAGE_REL = 0.00049; // 13/(83*464) ~= 0.000337
  // BNC physical reference: thickness 1.12" for 448 pages, cover width 5.25"
  // Per-page multiplier relative to cover width = (1.12 / 5.25) / 448 = 1.12/(5.25*448)
  const BNC_PER_PAGE_REL = 0.00069;
  // PC physical reference: 16mm thickness, 128mm cover width, 368 pages
  // Per-page multiplier relative to cover width = (16 / 128) / 368 = 16/(128*368)
  const PC_PER_PAGE_REL = 0.000497;
  // PCD physical reference: 1.69" thickness, 5.67" cover width, 672 pages
  // Per-page multiplier relative to cover width = (1.69 / 5.67) / 672 = 1.69/(5.67*672)
  const PCD_PER_PAGE_REL = 0.000684;
  const isPCD = /Penguin Classics Deluxe/i.test(series) || seriesId === 'pcd';
  const isPC = seriesId === 'pc' || (/Penguin Classics/i.test(series) && !/Deluxe/i.test(series));

  let thickness = null;
  // If we can measure the displayed cover width, compute a pixel thickness for OWC
  const thicknessBaseWidth = thicknessWidth;
  if (thicknessBaseWidth && /OWC|Oxford/i.test(series)) {
    thickness = Math.ceil(thicknessBaseWidth * pagination * OWC_PER_PAGE_REL);
  }
  if (thicknessBaseWidth && /BNC|Barnes/i.test(series)) {
    thickness= Math.ceil(thicknessBaseWidth * pagination * BNC_PER_PAGE_REL);
  }
  if (thicknessBaseWidth && isPCD) {
    thickness = Math.ceil(thicknessBaseWidth * pagination * PCD_PER_PAGE_REL);
  }
  if (thicknessBaseWidth && isPC) {
    thickness = Math.ceil(thicknessBaseWidth * pagination * PC_PER_PAGE_REL);
  }

  const spineText = (book.SpineTitle || book.Title || '').trim();
  const lastName = (book.AlphaAuthor || '').split(',')[0] || '';
  const showAuthorOnSpine = book.Author && book.Author !== 'Unknown' && lastName && !spineText.toLowerCase().includes(lastName.toLowerCase());
  const authorFull = book.Author || book.AlphaAuthor || '';
  const pcdSpineSource = book?.SpineCrop?.src || book?.SpineCrop?.source;
  const hasPcdSpineImage = Boolean(pcdSpineSource);

  useEffect(() => {
    if (!bookRef.current) return;
    const el = bookRef.current;

    const containerAspect = PHYSICAL_SERIES_SIZES.container.height / PHYSICAL_SERIES_SIZES.container.width;

    const measure = () => {
      try {
        const containerEl = el.parentElement; // .book-container
        const outerEl = containerEl?.parentElement; // <a>
        if (!outerEl) return;
        const availableWidth = outerEl.getBoundingClientRect().width || outerEl.offsetWidth || 0;
        if (!availableWidth) return;
        const containerHeight = availableWidth * containerAspect;
        const hPad = Math.round(availableWidth * horizontalPaddingRatio);
        const tPad = Math.round(containerHeight * topPaddingRatio);
        setHorizontalPadding(hPad);
        setTopPadding(tPad);
        setThicknessWidth(availableWidth - 2 * hPad);
      } catch (e) {
        // ignore
      }
    };
    measure();
    let ro = null;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    } else {
      window.addEventListener('resize', measure);
    }
    return () => {
      if (ro) ro.disconnect(); else window.removeEventListener('resize', measure);
    };
  }, [seriesId, series, horizontalPaddingRatio, topPaddingRatio]);



  const isAuthorLayout = layout === 'author';
  const isDesktopViewport = typeof window !== 'undefined' && window.innerWidth >= 768;
  const containerPaddingStyle = isDesktopViewport
    ? { paddingRight: `${horizontalPadding * 2}px`, paddingTop: `${topPadding}px` }
    : { paddingLeft: `${horizontalPadding }px`, paddingRight: `${horizontalPadding }px`, paddingTop: `${topPadding}px` };

  const saveEditedBook = async () => {
    try {
      const uid = book?._uid || book?.ISBN || book?.EAN || book?.Title;
      if (!uid) {
        setEditStatus('Book is missing a stable identifier.');
        return;
      }

      const nextBook = {
        ...book,
        ...editForm,
        PAGINATION: editForm.PAGINATION,
      };

      const response = await fetch(apiUrl(`/api/books/${encodeURIComponent(uid)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextBook)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to save book');
      }

      const savedBook = await response.json();
      if (typeof setBooks === 'function') {
        setBooks((currentBooks) => currentBooks.map((currentBook) => {
          const currentUid = currentBook?._uid || currentBook?.ISBN || currentBook?.EAN || currentBook?.Title;
          return currentUid === uid ? { ...currentBook, ...savedBook } : currentBook;
        }));
      }

      setEditStatus('Saved to SQLite database.');
      setShowEditModal(false);
    } catch (error) {
      setEditStatus(error?.message || 'Failed to save book.');
    }
  };

  return (
    <Col xs={12} lg={3} className={`mb-3 ${colClass || ''} ${isAuthorLayout ? 'author-view-col' : ''}`} style={colStyle}>
      <div className="py-2 h-100 book-tile">
        {book.isAuthorLayout && (
        <div className="book-header-row" style={{ minHeight: 26, marginBottom: 8, fontWeight: 700 }}>
          {header ? header : <span style={{ visibility: 'hidden' }}>placeholder</span>}
        </div>)}
        <div className="book-stage-link">
          <div className="book-container" style={containerPaddingStyle}>
            <div ref={bookRef} className={`book series-${seriesId}`} style={{ transform: `translateZ(-${thickness || 0}px)` }}>
              <div className="book-front" style={{ transform: `translateZ(${(thickness || 0) - 1}px)` }}>
                <img src={book.Image} alt={book.Title} draggable="false" />
              </div>

              {(() => {
                const spineProps = { book, pagination: book?.PAGINATION, thickness, spineText, showAuthorOnSpine, author: authorFull };
                const spineMap = {
                  OWC: SpineOWC,
                  BNC: SpineBNC,
                  PC: SpinePC,
                  PCD: hasPcdSpineImage ? SpinePCD : SpinePC
                };
                const SpineComponent = spineMap[book.SeriesId];
                return SpineComponent ? <SpineComponent {...spineProps} /> : null;
              })()}
            </div>
          </div>
        </div>
        <div className="book-meta book-meta-row mt-5">
          <strong>{book.Title || 'Untitled Book'}</strong>
          <div>{book?.Author || 'Unknown Author'}</div>

          {book.GOODREADS && (
            <a target="_blank" href={book?.GOODREADS} rel="noopener noreferrer">GoodReads</a>
          )}
          {book.Website && (
            <a target="_blank" href={book?.Website} rel="noopener noreferrer">Website</a>
          )}
          {book.PAGINATION && (
            <div>{book.PAGINATION}p</div>
          )}
          {book.PCversion && (
            <div>{book.PCversion}</div>
          )}
          {thickness && (
            <div>Thickness: {thickness}px</div>
          )}
          {hasBookDimensionOverride && (
              <div>Book Size: {physicalBookSize.width} x {physicalBookSize.height}</div>
          )}
        </div>
        <div>
          <Button
            size="sm"
            variant="outline-primary"
            className="mt-2"
            onClick={() => setShowEditModal(true)}
          >
            Edit
          </Button>
        </div>
      </div>

      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Edit Book</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3">Changes are saved to the SQLite database and the current app state updates immediately. Leave Series and Series Id blank for books without a series. Leave Book Width and Book Height blank to use the series defaults.</div>
          <Form>
            <div className="row g-3">
              {EDIT_FIELDS.map(({ key, label }) => (
                <div className="col-12 col-md-6" key={key}>
                  <Form.Group controlId={`edit-${key}`}>
                    <Form.Label>{label}</Form.Label>
                    {(key === 'PAGINATION' || key === 'BookWidth' || key === 'BookHeight') ? (
                      <Form.Control
                        type="number"
                        step="any"
                        value={editForm[key]}
                        onChange={(e) => setEditForm((current) => ({ ...current, [key]: e.target.value }))}
                      />
                    ) : (key === 'Description' || key === 'Notes') ? (
                      <Form.Control
                        as="textarea"
                        rows={key === 'Description' ? 4 : 3}
                        value={editForm[key]}
                        onChange={(e) => setEditForm((current) => ({ ...current, [key]: e.target.value }))}
                      />
                    ) : (
                      <Form.Control
                        type="text"
                        value={editForm[key]}
                        onChange={(e) => setEditForm((current) => ({ ...current, [key]: e.target.value }))}
                      />
                    )}
                  </Form.Group>
                </div>
              ))}
            </div>
          </Form>
          {editStatus && <div className="small mt-3">{editStatus}</div>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowEditModal(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={saveEditedBook}>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>
    </Col>
  );
};

export default BookItem;
