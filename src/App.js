import './App.css';
import { useState, useEffect } from 'react';
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
  const [spineBooks, setSpineBooks] = useState([]);
  const [view, setView] = useState('library');
  const [page, setPage] = useState(0);
  const pageSize = 80;
  const [pageCount, setPageCount] = useState(1);
  const [totalBooks, setTotalBooks] = useState(0);
  const [isLoadingBooks, setIsLoadingBooks] = useState(true);
  const [isLoadingSpineBooks, setIsLoadingSpineBooks] = useState(false);
  const [booksError, setBooksError] = useState('');
  const [spineBooksError, setSpineBooksError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [sortOption, setSortOption] = useState('title-asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [selectedSeries, setSelectedSeries] = useState('');
  const [seriesOptions, setSeriesOptions] = useState([]);
  const [showAddBookModal, setShowAddBookModal] = useState(false);
  const [addBookForm, setAddBookForm] = useState(() => createEmptyAddBookForm());
  const [addBookStatus, setAddBookStatus] = useState('');
  const [isSavingNewBook, setIsSavingNewBook] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort: sortOption,
      q: submittedSearch,
      series: selectedSeries
    });
    setIsLoadingBooks(true);
    setBooksError('');
    fetch(apiUrl(`/api/books?${params.toString()}`), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Book query failed (${response.status}).`);
        return response.json();
      })
      .then((result) => {
        setBooks(Array.isArray(result.books) ? result.books : []);
        setTotalBooks(Number(result.total) || 0);
        setPageCount(Math.max(1, Number(result.pageCount) || 1));
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setBooksError(error.message || 'Unable to load books.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingBooks(false);
      });
    return () => controller.abort();
  }, [page, pageSize, sortOption, submittedSearch, selectedSeries, refreshVersion]);

  useEffect(() => {
    fetch(apiUrl('/api/series'))
      .then((response) => {
        if (!response.ok) throw new Error(`Series query failed (${response.status}).`);
        return response.json();
      })
      .then((result) => setSeriesOptions(Array.isArray(result) ? result : []))
      .catch((error) => console.error('Error loading series:', error));
  }, []);

  const currentPageBooks = books;
  const effectiveSortOption = sortOption;
  const mobileResetKey = `${submittedSearch}|${sortOption}|${selectedSeries}|${page}`;

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setPage(0);
    setSubmittedSearch(searchTerm.trim());
  };

  const openSpineCropPage = async () => {
    setIsLoadingSpineBooks(true);
    setSpineBooksError('');
    try {
      const response = await fetch(apiUrl('/api/books/spine-crop'));
      if (!response.ok) throw new Error(`Spine book query failed (${response.status}).`);
      const result = await response.json();
      setSpineBooks(Array.isArray(result) ? result : []);
      setView('spine-crop');
    } catch (error) {
      setSpineBooksError(error.message || 'Unable to load spine books.');
    } finally {
      setIsLoadingSpineBooks(false);
    }
  };

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

      await response.json();
      setPage(0);
      setRefreshVersion((version) => version + 1);
      setShowAddBookModal(false);
      setAddBookForm(createEmptyAddBookForm());
      setAddBookStatus('Saved to database.');
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
                  <SpineCropEditor books={spineBooks} setBooks={setSpineBooks} />
                </Col>
              </Row>
            ) : (
              <Row>
                <Col xs={12} lg={2} className="d-flex flex-column align-items-stretch">
                  <div className="">
                    <Form onSubmit={handleSearchSubmit} className="mb-3">
                      <Form.Label htmlFor="searchInput">Search:</Form.Label>
                      <div className="input-group input-group-sm">
                        <Form.Control id="searchInput" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Title or author" />
                        <Button type="submit" variant="primary" disabled={isLoadingBooks}>Search</Button>
                      </div>
                    </Form>
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
                        {seriesOptions.map(series => (
                          <option key={series.id} value={series.id}>{series.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <div className="d-grid gap-2 mb-3">
                      <button className="btn btn-outline-primary" onClick={openSpineCropPage} disabled={isLoadingSpineBooks}>{isLoadingSpineBooks ? 'Loading PCD Books...' : 'Open PCD Spine Crop Page'}</button>
                      {spineBooksError && <div className="small text-danger">{spineBooksError}</div>}
                      <button className="btn btn-outline-success" onClick={openAddBookModal}>Add Book</button>
                    </div>
                  </div>
                </Col>
                <Col xs={12} lg={10}>
                  <Row className="d-flex justify-content-between align-items-center mb-3">
                    <Col xs={12} lg={6} className="d-flex align-items-center">
                      <h4 className="mb-0">{isLoadingBooks ? 'Loading books...' : `${totalBooks} Books`}</h4>
                    </Col>
                    <Col xs={12} lg={6} className="d-flex justify-content-end align-items-center">
                      <button className="btn btn-secondary me-2" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || isLoadingBooks}>Back</button>
                      <span className="me-2">Page {page + 1} / {pageCount}</span>
                      <button className="btn btn-secondary" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1 || isLoadingBooks}>Next</button>
                    </Col>
                  </Row>
                  {booksError && <div className="alert alert-danger" role="alert">{booksError}</div>}
                  <hr></hr>
                  <Row className="d-flex">
                    {!isLoadingBooks && !booksError && effectiveSortOption.startsWith('author') ? (
                      <AuthorView books={currentPageBooks} pageIndex={page * pageSize} mobileResetKey={mobileResetKey} setBooks={setBooks} />
                    ) : !isLoadingBooks && !booksError ? (
                        <TitleView books={currentPageBooks} pageIndex={page * pageSize} mobileResetKey={mobileResetKey} setBooks={setBooks} />
                    ) : null}
                  </Row>
                </Col>
              </Row>
            )}
        </Container>
        <hr></hr>
        <div>
          <button className="btn btn-secondary me-2" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0 || isLoadingBooks}>Back</button>
          <span className="me-2">Page {page + 1} / {pageCount}</span>
          <button className="btn btn-secondary" onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1 || isLoadingBooks}>Next</button>
        </div>

        <Modal show={showAddBookModal} onHide={() => setShowAddBookModal(false)} size="xl" scrollable>
          <Modal.Header closeButton>
            <Modal.Title>Add Book</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <div className="small text-muted mb-3">Create a new book record. Leave Series and Series Id blank if the book is not part of a series.</div>
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
