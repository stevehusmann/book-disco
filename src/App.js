import './App.css';
import { useState, useEffect, useMemo } from 'react';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Modal from 'react-bootstrap/Modal';
import 'bootstrap/dist/css/bootstrap.min.css';

import TitleView from './components/TitleView';
import AuthorView from './components/AuthorView';
import SpineCropEditor from './components/SpineCropEditor';
import { apiUrl } from './apiUrl';

const ADD_BOOK_FIELDS = [
  { key: 'Title', label: 'Title', required: true },
  { key: 'FullTitle', label: 'Full Title' },
  { key: 'Author', label: 'Author' },
  { key: 'AlphaAuthor', label: 'Alpha Author' },
  { key: 'AlphaTitle', label: 'Alpha Title' },
  { key: 'Series', label: 'Series' },
  { key: 'SeriesId', label: 'Series Id' },
  { key: 'ISBN', label: 'ISBN' },
  { key: 'EAN', label: 'EAN' },
  { key: 'Image', label: 'Image URL' },
  { key: 'Website', label: 'Website URL' },
  { key: 'GOODREADS', label: 'GoodReads URL' },
  { key: 'Price', label: 'Price' },
  { key: 'PAGINATION', label: 'Pagination', type: 'number' },
  { key: 'BINDING', label: 'Binding' },
  { key: 'SpineTitle', label: 'Spine Title' },
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
  { key: 'Translators', label: 'Translators (comma-separated)' },
  { key: 'BookWidth', label: 'Book Width', type: 'number' },
  { key: 'BookHeight', label: 'Book Height', type: 'number' }
];

const createEmptyAddBookForm = () => ADD_BOOK_FIELDS.reduce((acc, field) => {
  acc[field.key] = '';
  return acc;
}, {});


const App = () => {
  const [books, setBooks] = useState([]);
  const [view, setView] = useState('library');
  const [page, setPage] = useState(0);
  const pageSize = 80;
  const [sortOption, setSortOption] = useState('title-asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField] = useState('both');
  const [selectedSeries, setSelectedSeries] = useState('');
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [addBookForm, setAddBookForm] = useState(() => createEmptyAddBookForm());
  const [addBookStatus, setAddBookStatus] = useState('');
  const [isSavingNewBook, setIsSavingNewBook] = useState(false);
  
  useEffect(() => {
    fetch(apiUrl('/api/books'))
      .then((response) => response.json())
      .then((data) => setBooks((Array.isArray(data) ? data : []).map((book, idx) => ({ ...book, _uid: book?._uid || `book-${idx}` }))))
      .catch((error) => console.error("Error loading books:", error));
  }, []);

  
  // Sorting + pagination derived values
  const filteredBooks = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    return books.filter(book => {
      if (!(book.BINDING === 'pbk' && book?.Image)) return false;
      if (selectedSeries && book.SeriesId !== selectedSeries) return false;
      if (!term) return true;
      const title = (book.Title || '').toLowerCase();
      const author = (book.Author || book.AlphaAuthor || '').toLowerCase();
      if (searchField === 'title') return title.includes(term);
      if (searchField === 'author') return author.includes(term);
      return title.includes(term) || author.includes(term);
    });
  }, [books, searchTerm, searchField, selectedSeries]);

  const effectiveSortOption = (searchTerm || '').trim() ? 'title-asc' : sortOption;
  const mobileResetKey = `${searchTerm}|${sortOption}|${selectedSeries}`;

  const sortedBooks = useMemo(() => {
    const arr = [...filteredBooks];
    const collatorOptions = { sensitivity: 'base', numeric: true };
    const byAuthor = (a, b) => (a.AlphaAuthor || a.Author || '').localeCompare(b.AlphaAuthor || b.Author || '', undefined, collatorOptions);
    const byTitle = (a, b) => (a.AlphaTitle || a.Title || '').localeCompare(b.AlphaTitle || b.Title || '', undefined, collatorOptions);
    if (effectiveSortOption === 'author-asc') arr.sort(byAuthor);
    else if (effectiveSortOption === 'author-desc') arr.sort((a, b) => byAuthor(b, a));
    else if (effectiveSortOption === 'title-asc') arr.sort(byTitle);
    else if (effectiveSortOption === 'title-desc') arr.sort((a, b) => byTitle(b, a));
    return arr;
  }, [filteredBooks, effectiveSortOption]);

  const uniqueSeries = useMemo(() => {
    const map = new Map();
    books.forEach(book => {
      const seriesId = book.SeriesId || 'Unknown';
      const seriesName = book.Series || seriesId;
      if (!map.has(seriesId)) {
        map.set(seriesId, seriesName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [books]);

  const pagination = useMemo(() => {
    // Default: simple slice pagination (Title sort)
    if (!effectiveSortOption.startsWith('author')) {
      const pc = Math.max(1, Math.ceil(sortedBooks.length / pageSize));
      const cp = sortedBooks.slice(page * pageSize, (page + 1) * pageSize);
      return { pageCount: pc, currentPageBooks: cp };
    }

    // Author-aware pagination: group by author and avoid splitting an author across pages
    const groups = [];
    const map = new Map();
    for (const b of sortedBooks) {
      // Group by the displayed `Author` field, but keep sortedBooks ordered by AlphaAuthor
      const key = (b.Author || b.AlphaAuthor || 'Unknown').trim();
      if (!map.has(key)) {
        map.set(key, []);
        groups.push(key);
      }
      map.get(key).push(b);
    }

    const pages = [];
    let current = [];
    let count = 0;
    for (const key of groups) {
      const grp = map.get(key) || [];
      // if adding this group would overflow and we already have items on the page, start a new page
      if (count + grp.length > pageSize && current.length > 0) {
        pages.push(current);
        current = [];
        count = 0;
      }
      current = current.concat(grp);
      count += grp.length;
    }
    if (current.length) pages.push(current);

    const pc = Math.max(1, pages.length || 1);
    const cp = pages[page] || [];
    return { pageCount: pc, currentPageBooks: cp };
  }, [sortedBooks, effectiveSortOption, pageSize, page]);

  const pageCount = pagination.pageCount;
  const currentPageBooks = pagination.currentPageBooks;

  useEffect(() => { if (page >= pageCount) setPage(0); }, [pageCount, page]);

  const openAddBookModal = () => {
    setAddBookForm(createEmptyAddBookForm());
    setAddBookStatus('');
    setShowAddBookModal(true);
  };

  const saveNewBook = async () => {
    try {
      setIsSavingNewBook(true);
      setAddBookStatus('');

      const response = await fetch(apiUrl('/api/books'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addBookForm)
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to add book');
      }

      const savedBook = await response.json();
      setBooks((currentBooks) => {
        const nextBooks = currentBooks.filter((book) => (book?._uid || book?.ISBN || book?.EAN || book?.Title) !== savedBook?._uid);
        return [savedBook, ...nextBooks];
      });
      setPage(0);
      setShowAddBookModal(false);
      setAddBookForm(createEmptyAddBookForm());
      setAddBookStatus('Saved to SQLite database.');
    } catch (error) {
      setAddBookStatus(error?.message || 'Failed to add book.');
    } finally {
      setIsSavingNewBook(false);
    }
  };

  return (
    <>
      <Container fluid className="bg-gray px-0">
        <Container className="pt-5 bg-gray">
            {view === 'spine-crop' ? (
              <Row>
                <Col xs={12}>
                  <Row className="mb-3">
                    <Col className="d-flex justify-content-between align-items-center">
                      <h4 className="mb-0">PCD Spine Crop Editor</h4>
                      <button className="btn btn-secondary" onClick={() => setView('library')}>Back To Library</button>
                    </Col>
                  </Row>
                  <SpineCropEditor books={books} setBooks={setBooks} />
                </Col>
              </Row>
            ) : (
              <Row>
                <Col xs={12} lg={2} className="d-flex flex-column align-items-stretch">
                  <div className="">
                    <div className="mb-3">
                      <label htmlFor="searchInput" className="form-label">Search:</label>
                      <input id="searchInput" className="form-control form-control-sm" value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }} placeholder="Title or author" />
                    </div>
                    <div className="mb-3">
                      <label htmlFor="sortSelect" className="form-label">Sort:</label>
                      <select id="sortSelect" value={effectiveSortOption} onChange={(e) => { setSortOption(e.target.value); setPage(0); }} className="form-select form-select-sm">
                        <option value="author-asc">Author A-Z</option>
                        <option value="author-desc">Author Z-A</option>
                        <option value="title-asc">Title A-Z</option>
                        <option value="title-desc">Title Z-A</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <label htmlFor="seriesSelect" className="form-label">Series:</label>
                      <select id="seriesSelect" value={selectedSeries} onChange={(e) => { setSelectedSeries(e.target.value); setPage(0); }} className="form-select form-select-sm">
                        <option value="">All Series</option>
                        {uniqueSeries.map(series => (
                          <option key={series.id} value={series.id}>{series.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="d-grid gap-2 mb-3">
                      <button className="btn btn-outline-primary" onClick={() => setView('spine-crop')}>Open PCD Spine Crop Page</button>
                      <button className="btn btn-outline-success" onClick={openAddBookModal}>Add Book</button>
                    </div>
                  </div>
                </Col>
                <Col xs={12} lg={10}>
                  <Row className="d-flex justify-content-between align-items-center mb-3">
                    <Col xs={12} lg={6} className="d-flex align-items-center">
                      <h4 className="mb-0">{filteredBooks.length} Books</h4>
                    </Col>
                    <Col xs={12} lg={6} className="d-flex justify-content-end align-items-center">
                      <button className="btn btn-secondary me-2" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Back</button>
                      <span className="me-2">Page {page + 1} / {pageCount}</span>
                      <button className="btn btn-secondary" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next</button>
                    </Col>
                  </Row>
                  <hr></hr>
                  <Row className="d-flex">
                    {effectiveSortOption.startsWith('author') ? (
                      <AuthorView books={currentPageBooks} pageIndex={page * pageSize} mobileResetKey={mobileResetKey} setBooks={setBooks} />
                    ) : (
                        <TitleView books={currentPageBooks} pageIndex={page * pageSize} mobileResetKey={mobileResetKey} setBooks={setBooks} />
                    )}
                  </Row>
                </Col>
              </Row>
            )}
        </Container>
        <hr></hr>
        <div>
          <button className="btn btn-secondary me-2" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Back</button>
          <span className="me-2">Page {page + 1} / {pageCount}</span>
          <button className="btn btn-secondary" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next</button>
        </div>

        <Modal show={showAddBookModal} onHide={() => setShowAddBookModal(false)} size="xl" scrollable>
          <Modal.Header closeButton>
            <Modal.Title>Add Book</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-3">Create a new book record in SQLite. Leave Series and Series Id blank if the book is not part of a series.</div>
            <Form>
              <div className="row g-3">
                {ADD_BOOK_FIELDS.map((field) => (
                  <div className={field.multiline ? 'col-12' : 'col-12 col-md-6'} key={field.key}>
                    <Form.Group controlId={`add-${field.key}`}>
                      <Form.Label>{field.label}</Form.Label>
                      <Form.Control
                        required={field.required}
                        type={field.type || 'text'}
                        as={field.multiline ? 'textarea' : undefined}
                        rows={field.rows}
                        value={addBookForm[field.key]}
                        onChange={(e) => setAddBookForm((current) => ({ ...current, [field.key]: e.target.value }))}
                      />
                    </Form.Group>
                  </div>
                ))}
              </div>
            </Form>
            {addBookStatus && <div className="small mt-3">{addBookStatus}</div>}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="outline-secondary" onClick={() => setShowAddBookModal(false)}>
              Cancel
            </Button>
            <Button variant="success" onClick={saveNewBook} disabled={isSavingNewBook}>
              {isSavingNewBook ? 'Saving...' : 'Add Book'}
            </Button>
          </Modal.Footer>
        </Modal>
      </Container>
    </>
  );
}

export default App;
