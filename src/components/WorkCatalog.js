import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../apiUrl';

const getPublicationYear = (date) => {
  const year = Number.parseInt(String(date || ''), 10);
  return Number.isFinite(year) ? year : null;
};

const comparePublicationOrder = (left, right) => {
  const leftYear = getPublicationYear(left.releaseDate);
  const rightYear = getPublicationYear(right.releaseDate);
  if (leftYear == null && rightYear == null) return left.title.localeCompare(right.title);
  if (leftYear == null) return 1;
  if (rightYear == null) return -1;
  return leftYear - rightYear || left.title.localeCompare(right.title);
};

const fetchJson = async (path, options) => {
  const response = await fetch(apiUrl(path), options);
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status}).`);
  return payload;
};

const WorkCatalog = ({ onBack }) => {
  const [authors, setAuthors] = useState([]);
  const [works, setWorks] = useState([]);
  const [selectedAuthorId, setSelectedAuthorId] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [wikipediaCandidates, setWikipediaCandidates] = useState([]);
  const [workCandidates, setWorkCandidates] = useState([]);
  const [selectedWork, setSelectedWork] = useState(null);
  const [selectedAuthorIds, setSelectedAuthorIds] = useState([]);
  const [coauthorFilter, setCoauthorFilter] = useState('');
  const [selectedBookUids, setSelectedBookUids] = useState([]);
  const [bookSearch, setBookSearch] = useState('');
  const [bookResults, setBookResults] = useState([]);
  const [linkingWorkId, setLinkingWorkId] = useState('');
  const [linkBookSearch, setLinkBookSearch] = useState('');
  const [linkBookResults, setLinkBookResults] = useState([]);
  const [linkBookUids, setLinkBookUids] = useState([]);
  const [reviewedDate, setReviewedDate] = useState('');
  const [reviewedPrecision, setReviewedPrecision] = useState('');
  const [confirmedOriginalDate, setConfirmedOriginalDate] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const selectedAuthor = authors.find((author) => author.id === selectedAuthorId);
  const filteredAuthors = useMemo(() => {
    const query = authorFilter.trim().toLowerCase();
    if (!query) return authors;
    return authors.filter((author) => `${author.name} ${author.sortName}`.toLowerCase().includes(query));
  }, [authors, authorFilter]);
  const workAuthorOptions = useMemo(() => {
    const query = coauthorFilter.trim().toLowerCase();
    if (!query) return authors.filter((author) => selectedAuthorIds.includes(author.id));
    return authors.filter((author) => `${author.name} ${author.sortName}`.toLowerCase().includes(query)).slice(0, 100);
  }, [authors, coauthorFilter, selectedAuthorIds]);
  const selectedAuthorWorks = useMemo(() => works
    .filter((work) => (work.authors || []).some((author) => author.id === selectedAuthorId))
    .sort(comparePublicationOrder), [works, selectedAuthorId]);

  const loadCatalog = async () => {
    const [authorRows, workRows] = await Promise.all([
      fetchJson('/api/catalog/authors'),
      fetchJson('/api/catalog/works')
    ]);
    setAuthors(authorRows);
    setWorks(workRows);
  };

  useEffect(() => {
    loadCatalog().catch((loadError) => setError(loadError.message || 'Unable to load the work catalog.'));
  }, []);

  const searchWikipediaAuthors = async () => {
    if (!selectedAuthor) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const results = await fetchJson(`/api/catalog/wikipedia/search?q=${encodeURIComponent(selectedAuthor.name)}`);
      setWikipediaCandidates(results);
    } catch (searchError) {
      setError(searchError.message || 'Wikipedia search failed.');
    } finally {
      setLoading(false);
    }
  };

  const confirmWikipediaAuthor = async (candidate) => {
    setLoading(true);
    setError('');
    try {
      await fetchJson(`/api/catalog/authors/${encodeURIComponent(selectedAuthorId)}/wikipedia`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikipediaPageTitle: candidate.pageTitle })
      });
      setAuthors((current) => current.map((author) => (
        author.id === selectedAuthorId
          ? { ...author, wikipediaPageTitle: candidate.pageTitle, wikipediaUrl: candidate.url }
          : author
      )));
      setWikipediaCandidates([]);
      setStatus(`Linked ${selectedAuthor.name} to Wikipedia page “${candidate.pageTitle}”.`);
    } catch (linkError) {
      setError(linkError.message || 'Unable to link the Wikipedia author.');
    } finally {
      setLoading(false);
    }
  };

  const loadWikipediaWorks = async () => {
    if (!selectedAuthor?.wikipediaPageTitle) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const results = await fetchJson(`/api/catalog/wikipedia/authors/works?pageTitle=${encodeURIComponent(selectedAuthor.wikipediaPageTitle)}`);
      setWorkCandidates(results.map((candidate) => ({
        ...candidate,
        publicationDates: candidate.date ? [candidate.date] : []
      })));
      setSelectedWork(null);
      if (!results.length) setStatus('No clearly labeled works or bibliography sections were found on that author page.');
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Wikipedia works.');
    } finally {
      setLoading(false);
    }
  };

  const beginWorkReview = (candidate) => {
    setSelectedWork(candidate);
    setSelectedAuthorIds([selectedAuthorId]);
    setSelectedBookUids([]);
    setReviewedDate(candidate.date?.value || '');
    setReviewedPrecision(candidate.date?.precision ? String(candidate.date.precision) : '');
    setConfirmedOriginalDate(false);
    setBookSearch('');
    setBookResults([]);
    setError('');
    setStatus('');
  };

  const searchBooks = async (event) => {
    event.preventDefault();
    if (!bookSearch.trim()) {
      setBookResults([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setBookResults(await fetchJson(`/api/catalog/books?q=${encodeURIComponent(bookSearch.trim())}`));
    } catch (searchError) {
      setError(searchError.message || 'Unable to search book editions.');
    } finally {
      setLoading(false);
    }
  };

  const searchEditionsToLink = async (event) => {
    event.preventDefault();
    if (!linkBookSearch.trim()) {
      setLinkBookResults([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setLinkBookResults(await fetchJson(`/api/catalog/books?q=${encodeURIComponent(linkBookSearch.trim())}`));
    } catch (searchError) {
      setError(searchError.message || 'Unable to search book editions.');
    } finally {
      setLoading(false);
    }
  };

  const saveEditionLinks = async (work) => {
    if (!linkBookUids.length) return;
    setLoading(true);
    setError('');
    try {
      await fetchJson(`/api/catalog/works/${encodeURIComponent(work.id)}/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookUids: linkBookUids })
      });
      setLinkingWorkId('');
      setLinkBookSearch('');
      setLinkBookResults([]);
      setLinkBookUids([]);
      await loadCatalog();
    } catch (linkError) {
      setError(linkError.message || 'Unable to link book editions to this Work.');
    } finally {
      setLoading(false);
    }
  };

  const saveReviewedWork = async () => {
    if (!selectedWork || !reviewedDate || !reviewedPrecision || !confirmedOriginalDate || !selectedAuthorIds.length) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      await fetchJson('/api/catalog/works', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'wikipedia',
          sourceId: selectedWork.sourceId,
          title: selectedWork.title,
          releaseDate: reviewedDate,
          datePrecision: Number(reviewedPrecision),
          sourceUrl: selectedWork.sourceUrl,
          sourceStatement: selectedWork.sourceStatement,
          authorIds: selectedAuthorIds,
          bookUids: selectedBookUids
        })
      });
      setStatus(`Added "${selectedWork.title}" to the reviewed Work catalog.`);
      setSelectedWork(null);
      setWorkCandidates((current) => current.filter((candidate) => candidate.sourceId !== selectedWork.sourceId));
      await loadCatalog();
    } catch (saveError) {
      setError(saveError.message || 'Unable to save the reviewed Work.');
    } finally {
      setLoading(false);
    }
  };

  const deleteWork = async (work) => {
    if (!window.confirm(`Remove "${work.title}" from the Work catalog? Book edition records will be kept.`)) return;
    setLoading(true);
    setError('');
    try {
      await fetchJson(`/api/catalog/works/${encodeURIComponent(work.id)}`, { method: 'DELETE' });
      setWorks((current) => current.filter((entry) => entry.id !== work.id));
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to remove the Work.');
    } finally {
      setLoading(false);
    }
  };

  const toggleValue = (values, setValues, value) => {
    setValues((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]);
  };

  return (
    <section aria-label="Author work catalog" className="work-catalog">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Author → Work → Book Catalog</h4>
        <button className="btn btn-secondary" type="button" onClick={onBack}>Back To Library</button>
      </div>
      <p className="small text-muted">
        Wikipedia’s author bibliography pages vary in coverage and formatting. Review each author page, Work title, and original publication year before saving. Only publication-list sections are collected, and existing edition records are never auto-matched.
      </p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {status && <div className="alert alert-info" role="status">{status}</div>}

      <div className="row g-3">
        <div className="col-12 col-xl-5">
          <div className="border rounded bg-white p-3 mb-3">
            <h5>1. Review author identity</h5>
            <label className="form-label" htmlFor="author-filter">Find an author</label>
            <input
              id="author-filter"
              className="form-control mb-2"
              value={authorFilter}
              onChange={(event) => setAuthorFilter(event.target.value)}
              placeholder="Search authors"
            />
            <select
              className="form-select mb-2"
              aria-label="Catalog author"
              value={selectedAuthorId}
              onChange={(event) => {
                setSelectedAuthorId(event.target.value);
                setWikipediaCandidates([]);
                setWorkCandidates([]);
                setSelectedWork(null);
              }}
            >
              <option value="">Select an author...</option>
              {filteredAuthors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.name}{author.wikipediaPageTitle ? ` (${author.wikipediaPageTitle})` : ''}
                </option>
              ))}
            </select>
            {selectedAuthor && (
              <>
                <div className="small mb-2">
                  {selectedAuthor.wikipediaPageTitle
                    ? <>Linked to <a href={selectedAuthor.wikipediaUrl} target="_blank" rel="noreferrer">{selectedAuthor.wikipediaPageTitle}</a>.</>
                    : 'Not linked to a Wikipedia author page yet.'}
                </div>
                <button className="btn btn-outline-primary btn-sm" type="button" onClick={searchWikipediaAuthors} disabled={loading}>
                  Search Wikipedia for this author
                </button>
                {selectedAuthor.wikipediaPageTitle && (
                  <button className="btn btn-primary btn-sm ms-2" type="button" onClick={loadWikipediaWorks} disabled={loading}>
                    {loading ? 'Loading...' : 'Load works from Wikipedia'}
                  </button>
                )}
              </>
            )}
            {selectedAuthor && (
              <div className="mt-3 border-top pt-3" aria-label="Author view">
                <h6>Author view: Works in publication order</h6>
                {selectedAuthorWorks.length ? (
                  <ol className="mb-0 ps-3">
                    {selectedAuthorWorks.map((work) => (
                      <li key={work.id} className="mb-2">
                        <strong>{work.title}</strong>
                        <span className="text-muted"> · {work.releaseDate}</span>
                        {work.books.length > 0 && (
                          <div className="small text-muted">
                            Editions: {work.books.map((book) => `${book.title}${book.isbn ? ` (${book.isbn})` : ''}`).join('; ')}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="small text-muted mb-0">No reviewed Works linked to this author yet.</p>
                )}
              </div>
            )}
            {wikipediaCandidates.length > 0 && (
              <div className="list-group mt-3" aria-label="Wikipedia author candidates">
                {wikipediaCandidates.map((candidate) => (
                  <div className="list-group-item" key={candidate.pageTitle}>
                    <div className="d-flex justify-content-between gap-2">
                      <div>
                        <strong>{candidate.pageTitle}</strong>
                        <div className="small text-muted">{candidate.description || 'Wikipedia article'} · <a href={candidate.url} target="_blank" rel="noreferrer">Open page</a></div>
                      </div>
                      <button
                        className="btn btn-sm btn-outline-success align-self-start"
                        type="button"
                        onClick={() => confirmWikipediaAuthor(candidate)}
                        disabled={loading}
                      >
                        Confirm identity
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {workCandidates.length > 0 && (
            <div className="border rounded bg-white p-3">
              <h5>2. Review Works found on Wikipedia ({workCandidates.length})</h5>
              <div className="list-group">
                {workCandidates.map((candidate) => (
                  <div className="list-group-item d-flex align-items-start justify-content-between gap-2" key={candidate.sourceId}>
                    <div>
                      <strong>{candidate.title}</strong>
                      <div className="small text-muted">
                        {candidate.publicationDates.length
                          ? `Publication year found: ${candidate.publicationDates[0].value}`
                          : 'No publication year found'}
                      </div>
                    </div>
                    <button className="btn btn-sm btn-outline-primary" type="button" onClick={() => beginWorkReview(candidate)}>
                      Review
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="col-12 col-xl-7">
          {selectedWork && (
            <div className="border rounded bg-white p-3 mb-3">
              <h5>3. Confirm Work details</h5>
              <p className="small mb-1">
                <a href={selectedWork.sourceUrl} target="_blank" rel="noreferrer">Source on Wikipedia</a> · Verify this entry describes a distinct literary Work.
              </p>
              <label className="form-label" htmlFor="review-work-title">Work title</label>
              <input
                id="review-work-title"
                className="form-control mb-3"
                value={selectedWork.title}
                onChange={(event) => setSelectedWork((current) => ({ ...current, title: event.target.value }))}
              />
              <fieldset className="mb-3">
                <legend className="form-label">Publication year</legend>
                {selectedWork.publicationDates.length ? selectedWork.publicationDates.map((date) => (
                  <div className="form-check" key={`${date.value}-${date.precision}`}>
                    <input
                      className="form-check-input"
                      type="radio"
                      name="review-release-date"
                      id={`release-${encodeURIComponent(selectedWork.sourceId)}-${date.precision}-${date.value}`}
                      checked={reviewedDate === date.value && Number(reviewedPrecision) === date.precision}
                      onChange={() => {
                        setReviewedDate(date.value);
                        setReviewedPrecision(String(date.precision));
                        setConfirmedOriginalDate(false);
                      }}
                    />
                    <label className="form-check-label" htmlFor={`release-${encodeURIComponent(selectedWork.sourceId)}-${date.precision}-${date.value}`}>
                      {date.value}
                    </label>
                  </div>
                )) : (
                  <div className="small text-muted">No year was found in this bibliography entry. Enter a year only if you can verify it.</div>
                )}
                <div className="row g-2 mt-1">
                  <div className="col-12">
                    <label className="form-label small" htmlFor="reviewed-date-value">Reviewed publication year</label>
                    <input
                      id="reviewed-date-value"
                      className="form-control form-control-sm"
                      type="number"
                      min="-999999"
                      max="9999"
                      step="1"
                      value={reviewedDate}
                      onChange={(event) => {
                        setReviewedDate(event.target.value);
                        setReviewedPrecision(event.target.value ? '9' : '');
                        setConfirmedOriginalDate(false);
                      }}
                      placeholder="1851"
                    />
                  </div>
                </div>
              </fieldset>
              <div className="form-check mb-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="confirm-original-release-date"
                  checked={confirmedOriginalDate}
                  onChange={(event) => setConfirmedOriginalDate(event.target.checked)}
                  disabled={!reviewedDate}
                />
                <label className="form-check-label" htmlFor="confirm-original-release-date">
                  I verified this publication year for the Work, not just for an edition.
                </label>
              </div>

              <fieldset className="mb-3">
                <legend className="form-label">Authors</legend>
                <label className="form-label small" htmlFor="coauthor-filter">Find co-authors to include</label>
                <input
                  id="coauthor-filter"
                  className="form-control form-control-sm mb-2"
                  value={coauthorFilter}
                  onChange={(event) => setCoauthorFilter(event.target.value)}
                  placeholder="Search author names"
                />
                <div className="row row-cols-1 row-cols-md-2 g-1">
                  {workAuthorOptions.map((author) => (
                    <div className="col" key={author.id}>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`work-author-${author.id}`}
                          checked={selectedAuthorIds.includes(author.id)}
                          onChange={() => toggleValue(selectedAuthorIds, setSelectedAuthorIds, author.id)}
                        />
                        <label className="form-check-label" htmlFor={`work-author-${author.id}`}>{author.name}</label>
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>

              <fieldset className="mb-3">
                <legend className="form-label">Link existing book editions (optional; one edition can link to multiple Works)</legend>
                <form className="input-group mb-2" onSubmit={searchBooks}>
                  <input
                    className="form-control"
                    aria-label="Search book editions"
                    placeholder="Search by title, author, ISBN, or EAN"
                    value={bookSearch}
                    onChange={(event) => setBookSearch(event.target.value)}
                  />
                  <button className="btn btn-outline-secondary" type="submit" disabled={loading}>Search</button>
                </form>
                {bookResults.map((book) => (
                  <div className="form-check" key={book.uid}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`work-book-${book.uid}`}
                      checked={selectedBookUids.includes(book.uid)}
                      onChange={() => toggleValue(selectedBookUids, setSelectedBookUids, book.uid)}
                    />
                    <label className="form-check-label" htmlFor={`work-book-${book.uid}`}>
                      {book.title} · {book.author || 'Unknown author'} · ISBN {book.isbn || '—'} · {book.uid}
                    </label>
                  </div>
                ))}
              </fieldset>
              <button
                className="btn btn-success"
                type="button"
                onClick={saveReviewedWork}
                disabled={loading || !selectedWork.title.trim() || !reviewedDate || !confirmedOriginalDate || !selectedAuthorIds.length}
              >
                {loading ? 'Saving...' : 'Confirm and add Work'}
              </button>
              <button className="btn btn-outline-secondary ms-2" type="button" onClick={() => setSelectedWork(null)}>
                Cancel
              </button>
            </div>
          )}

          <div className="border rounded bg-white p-3">
            <h5>Reviewed Works ({works.length})</h5>
            {works.length ? (
              <div className="list-group">
                {works.map((work) => (
                  <div className="list-group-item" key={work.id}>
                    <div className="d-flex justify-content-between gap-3">
                      <div className="min-w-0">
                        <strong>{work.title}</strong>
                        <div className="small text-muted">
                          {work.releaseDate} · {work.authors.map((author) => author.name).join(', ')}
                        </div>
                        <div className="small text-muted">
                          {work.books.length
                            ? work.books.map((book) => `${book.title} (${book.isbn || book.uid})`).join('; ')
                            : 'No edition linked'}
                        </div>
                      </div>
                      <div className="d-flex flex-column gap-1 align-self-start">
                        <button
                          className="btn btn-sm btn-outline-primary"
                          type="button"
                          onClick={() => {
                            setLinkingWorkId((current) => current === work.id ? '' : work.id);
                            setLinkBookSearch('');
                            setLinkBookResults([]);
                            setLinkBookUids([]);
                          }}
                          disabled={loading}
                        >
                          Link editions
                        </button>
                        <button className="btn btn-sm btn-outline-danger" type="button" onClick={() => deleteWork(work)} disabled={loading}>
                          Remove Work
                        </button>
                      </div>
                    </div>
                    {linkingWorkId === work.id && (
                      <div className="mt-3">
                        <form className="input-group input-group-sm mb-2" onSubmit={searchEditionsToLink}>
                          <input
                            className="form-control"
                            aria-label={`Search editions for ${work.title}`}
                            placeholder="Search title, author, ISBN, or EAN"
                            value={linkBookSearch}
                            onChange={(event) => setLinkBookSearch(event.target.value)}
                          />
                          <button className="btn btn-outline-secondary" type="submit" disabled={loading}>Search</button>
                        </form>
                        {linkBookResults.map((book) => (
                          <div className="form-check" key={book.uid}>
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={`existing-work-book-${work.id}-${book.uid}`}
                              checked={linkBookUids.includes(book.uid)}
                              onChange={() => toggleValue(linkBookUids, setLinkBookUids, book.uid)}
                            />
                            <label className="form-check-label" htmlFor={`existing-work-book-${work.id}-${book.uid}`}>
                              {book.title} · {book.author || 'Unknown author'} · ISBN {book.isbn || '—'} · {book.uid}
                            </label>
                          </div>
                        ))}
                        <button className="btn btn-sm btn-success mt-2" type="button" onClick={() => saveEditionLinks(work)} disabled={loading || !linkBookUids.length}>
                          Save edition links
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-0 text-muted">No reviewed Works have been added yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default WorkCatalog;
