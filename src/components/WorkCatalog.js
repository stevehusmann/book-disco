import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../apiUrl';

const formatWikidataDate = (date, precision) => {
  const match = /^([+-])(\d+)-(\d{2})-(\d{2})/.exec(date || '');
  if (!match) return date || 'Unknown';
  const [, sign, rawYear, month, day] = match;
  const year = Number(rawYear);
  const eraYear = sign === '-' ? `${year} BCE` : String(year);
  if (precision === 11) return `${eraYear}-${month}-${day}`;
  if (precision === 10) return `${eraYear}-${month}`;
  if (precision === 9) return eraYear;
  const precisionName = { 8: 'decade', 7: 'century', 6: 'millennium' }[precision] || 'approximate';
  return `${eraYear} (${precisionName})`;
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
  const [wikidataCandidates, setWikidataCandidates] = useState([]);
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

  const searchWikidataAuthors = async () => {
    if (!selectedAuthor) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const results = await fetchJson(`/api/catalog/wikidata/search?q=${encodeURIComponent(selectedAuthor.name)}`);
      setWikidataCandidates(results);
    } catch (searchError) {
      setError(searchError.message || 'Wikidata search failed.');
    } finally {
      setLoading(false);
    }
  };

  const confirmWikidataAuthor = async (candidate) => {
    setLoading(true);
    setError('');
    try {
      await fetchJson(`/api/catalog/authors/${encodeURIComponent(selectedAuthorId)}/wikidata`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikidataQid: candidate.qid })
      });
      setAuthors((current) => current.map((author) => (
        author.id === selectedAuthorId ? { ...author, wikidataQid: candidate.qid } : author
      )));
      setWikidataCandidates([]);
      setStatus(`Linked ${selectedAuthor.name} to ${candidate.qid}.`);
    } catch (linkError) {
      setError(linkError.message || 'Unable to link the Wikidata author.');
    } finally {
      setLoading(false);
    }
  };

  const loadWikidataWorks = async () => {
    if (!selectedAuthor?.wikidataQid) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      const results = await fetchJson(`/api/catalog/wikidata/authors/${selectedAuthor.wikidataQid}/works`);
      setWorkCandidates(results);
      setSelectedWork(null);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load Wikidata works.');
    } finally {
      setLoading(false);
    }
  };

  const beginWorkReview = (candidate) => {
    setSelectedWork(candidate);
    setSelectedAuthorIds([selectedAuthorId]);
    setSelectedBookUids([]);
    setReviewedDate('');
    setReviewedPrecision('');
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
          wikidataQid: selectedWork.qid,
          title: selectedWork.title,
          releaseDate: reviewedDate,
          datePrecision: Number(reviewedPrecision),
          sourceUrl: selectedWork.sourceUrl,
          authorIds: selectedAuthorIds,
          bookUids: selectedBookUids
        })
      });
      setStatus(`Added "${selectedWork.title}" to the reviewed Work catalog.`);
      setSelectedWork(null);
      setWorkCandidates((current) => current.filter((candidate) => candidate.qid !== selectedWork.qid));
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
        Wikidata is an incomplete community catalog, and its response is capped at 10,000 results per author. Review each author identity, Work title, and original first-publication date before saving. Dates retain the source precision; no missing month or day is invented.
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
                setWikidataCandidates([]);
                setWorkCandidates([]);
                setSelectedWork(null);
              }}
            >
              <option value="">Select an author...</option>
              {filteredAuthors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.name}{author.wikidataQid ? ` (${author.wikidataQid})` : ''}
                </option>
              ))}
            </select>
            {selectedAuthor && (
              <>
                <div className="small mb-2">
                  {selectedAuthor.wikidataQid
                    ? <>Linked to <a href={`https://www.wikidata.org/wiki/${selectedAuthor.wikidataQid}`} target="_blank" rel="noreferrer">{selectedAuthor.wikidataQid}</a>.</>
                    : 'Not linked to a Wikidata entity yet.'}
                </div>
                <button className="btn btn-outline-primary btn-sm" type="button" onClick={searchWikidataAuthors} disabled={loading}>
                  Search Wikidata for this author
                </button>
                {selectedAuthor.wikidataQid && (
                  <button className="btn btn-primary btn-sm ms-2" type="button" onClick={loadWikidataWorks} disabled={loading}>
                    {loading ? 'Loading...' : 'Load candidate Works'}
                  </button>
                )}
              </>
            )}
            {wikidataCandidates.length > 0 && (
              <div className="list-group mt-3" aria-label="Wikidata author candidates">
                {wikidataCandidates.map((candidate) => (
                  <div className="list-group-item" key={candidate.qid}>
                    <div className="d-flex justify-content-between gap-2">
                      <div>
                        <strong>{candidate.label}</strong>
                        <div className="small text-muted">{candidate.description || 'No description'} · {candidate.qid}</div>
                      </div>
                      <button
                        className="btn btn-sm btn-outline-success align-self-start"
                        type="button"
                        onClick={() => confirmWikidataAuthor(candidate)}
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
              <h5>2. Review Wikidata Work candidates ({workCandidates.length})</h5>
              {workCandidates.length >= 10000 && (
                <div className="small text-warning mb-2">Wikidata returned the 10,000-result limit; additional Works may be omitted.</div>
              )}
              <div className="list-group">
                {workCandidates.map((candidate) => (
                  <div className="list-group-item d-flex align-items-start justify-content-between gap-2" key={candidate.qid}>
                    <div>
                      <strong>{candidate.title}</strong>
                      <div className="small text-muted">
                        {candidate.qid} · {candidate.publicationDates.length
                          ? `${candidate.publicationDates.length} publication date claim${candidate.publicationDates.length === 1 ? '' : 's'}`
                          : 'No publication date claim'}
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
                <a href={selectedWork.sourceUrl} target="_blank" rel="noreferrer">{selectedWork.qid}</a> · Verify this is a distinct literary Work and not another author’s similarly titled item.
              </p>
              <label className="form-label" htmlFor="review-work-title">Work title</label>
              <input
                id="review-work-title"
                className="form-control mb-3"
                value={selectedWork.title}
                onChange={(event) => setSelectedWork((current) => ({ ...current, title: event.target.value }))}
              />
              <fieldset className="mb-3">
                <legend className="form-label">Original / first publication date</legend>
                {selectedWork.publicationDates.length ? selectedWork.publicationDates.map((date) => (
                  <div className="form-check" key={`${date.value}-${date.precision}`}>
                    <input
                      className="form-check-input"
                      type="radio"
                      name="review-release-date"
                      id={`release-${selectedWork.qid}-${date.precision}-${date.value}`}
                      checked={reviewedDate === date.value && Number(reviewedPrecision) === date.precision}
                      onChange={() => {
                        setReviewedDate(date.value);
                        setReviewedPrecision(String(date.precision));
                        setConfirmedOriginalDate(false);
                      }}
                    />
                    <label className="form-check-label" htmlFor={`release-${selectedWork.qid}-${date.precision}-${date.value}`}>
                      {formatWikidataDate(date.value, date.precision)} <span className="text-muted">(precision {date.precision})</span>
                    </label>
                  </div>
                )) : (
                  <div className="small text-muted">Wikidata has no publication date claim for this Work. Enter a researched date and confirm it below.</div>
                )}
                <div className="row g-2 mt-1">
                  <div className="col-md-8">
                    <label className="form-label small" htmlFor="reviewed-date-value">Reviewed Wikidata time value</label>
                    <input
                      id="reviewed-date-value"
                      className="form-control form-control-sm"
                      value={reviewedDate}
                      onChange={(event) => {
                        setReviewedDate(event.target.value);
                        setConfirmedOriginalDate(false);
                      }}
                      placeholder="+1851-00-00T00:00:00Z"
                    />
                  </div>
                  <div className="col-md-4">
                    <label className="form-label small" htmlFor="reviewed-date-precision">Date precision</label>
                    <select
                      id="reviewed-date-precision"
                      className="form-select form-select-sm"
                      value={reviewedPrecision}
                      onChange={(event) => {
                        setReviewedPrecision(event.target.value);
                        setConfirmedOriginalDate(false);
                      }}
                    >
                      <option value="">Select precision...</option>
                      <option value="6">Millennium</option>
                      <option value="7">Century</option>
                      <option value="8">Decade</option>
                      <option value="9">Year</option>
                      <option value="10">Month</option>
                      <option value="11">Day</option>
                    </select>
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
                  I verified this is the Work’s original / first publication date, not a later edition’s date.
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
                          {formatWikidataDate(work.releaseDate, work.datePrecision)} · {work.authors.map((author) => author.name).join(', ')}
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
