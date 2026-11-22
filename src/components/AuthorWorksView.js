import { useEffect, useMemo, useState } from 'react';
import Modal from 'react-bootstrap/Modal';
import BookItem from './BookItem';
import MobileChevronRow from './MobileChevronRow';
import { apiUrl } from '../apiUrl';

const getYear = (value) => {
  const match = String(value || '').match(/-?\d{1,6}/);
  return match ? Number(match[0]) : null;
};

const getSurname = (author) => {
  const sortName = String(author.sortName || '').trim();
  if (sortName.includes(',')) return sortName.split(',')[0].trim();
  const name = String(author.name || '').trim();
  return name.split(/\s+/).at(-1) || name;
};

const DEFAULT_WORK_TYPES = ['Novel', 'Nonfiction', 'Short Story'];

const compareByYear = (left, right, dateKey) => {
  const leftYear = getYear(left[dateKey]);
  const rightYear = getYear(right[dateKey]);
  if (leftYear == null && rightYear == null) return left.title.localeCompare(right.title);
  if (leftYear == null) return 1;
  if (rightYear == null) return -1;
  return leftYear - rightYear || left.title.localeCompare(right.title);
};

const getWikipediaPageTitle = (sourceUrl, fallbackTitle) => {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname.endsWith('wikipedia.org')) {
      return decodeURIComponent(url.pathname.split('/wiki/')[1] || '').replace(/_/g, ' ') || fallbackTitle;
    }
  } catch (_error) {
    return fallbackTitle;
  }
  return fallbackTitle;
};

const fetchJson = async (path, options) => {
  const response = options ? await fetch(apiUrl(path), options) : await fetch(apiUrl(path));
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}).`);
  return result;
};

const AuthorWorksView = ({ author, setBooks, seriesOptions = [], onOpenSpineCrop, onAuthorUpdated }) => {
  const [works, setWorks] = useState([]);
  const [workTypes, setWorkTypes] = useState(DEFAULT_WORK_TYPES);
  const [authorSummary, setAuthorSummary] = useState(null);
  const [selectedWork, setSelectedWork] = useState(null);
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [authorForm, setAuthorForm] = useState({ name: '', sortName: '' });
  const [editingWork, setEditingWork] = useState(null);
  const [editingWorkType, setEditingWorkType] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [workSummary, setWorkSummary] = useState(null);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [loadingWorkSummary, setLoadingWorkSummary] = useState(false);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [authorSummaryError, setAuthorSummaryError] = useState('');
  const [authorSummaryExpanded, setAuthorSummaryExpanded] = useState(false);

  useEffect(() => {
    if (!author) return undefined;
    const controller = new AbortController();
    setLoadingWorks(true);
    setError('');
    setWorks([]);
    setAuthorSummary(null);
    setAuthorSummaryError('');
    setAuthorSummaryExpanded(false);

    const worksRequest = fetch(apiUrl('/api/catalog/works'), { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}).`);
        return result;
      });
    const workTypesRequest = fetch(apiUrl('/api/catalog/work-types'), { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}).`);
        return Array.isArray(result) ? result : DEFAULT_WORK_TYPES;
      })
      .catch(() => DEFAULT_WORK_TYPES);
    const summaryRequest = author.wikipediaPageTitle
      ? fetch(apiUrl(`/api/catalog/wikipedia/summary?pageTitle=${encodeURIComponent(author.wikipediaPageTitle)}`), { signal: controller.signal })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}).`);
          return result;
        })
        .catch((summaryLoadError) => {
          if (summaryLoadError.name !== 'AbortError') {
            setAuthorSummaryError(summaryLoadError.message || 'Unable to load the Wikipedia biography.');
          }
          return null;
        })
      : Promise.resolve(null);

    Promise.all([
      worksRequest,
      summaryRequest,
      workTypesRequest
    ])
      .then(([allWorks, summary, workTypeOptions]) => {
        const authorIds = new Set(author.aliasIds || [author.id]);
        setWorks(allWorks.filter((work) => (work.authors || []).some((workAuthor) => authorIds.has(workAuthor.id))));
        setAuthorSummary(summary);
        setWorkTypes(workTypeOptions);
      })
      .catch((loadError) => {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Unable to load this author’s Works.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingWorks(false);
      });
    return () => controller.abort();
  }, [author]);

  const orderedWorks = useMemo(() => [...works].sort((left, right) => compareByYear(left, right, 'releaseDate')), [works]);
  const workGroups = useMemo(() => [...workTypes, 'Uncategorized']
    .map((type) => ({
      type,
      works: orderedWorks.filter((work) => (work.workType || 'Uncategorized') === type)
    }))
    .filter((group) => group.works.length), [orderedWorks, workTypes]);
  const orderedEditions = useMemo(() => [...(selectedWork?.books || [])].sort((left, right) => (
    compareByYear(left, right, 'publicationDate')
  )), [selectedWork]);
  const renderWorkBook = (work, index, keySuffix) => {
    const firstEdition = [...(work.books || [])].sort((left, right) => compareByYear(left, right, 'publicationDate'))[0];
    const editionBook = firstEdition?.book || {
      _uid: firstEdition?.uid,
      Title: firstEdition?.title || work.title,
      Author: author.name,
      ISBN: firstEdition?.isbn || '',
      Image: firstEdition?.image || ''
    };
    const displayBook = {
      ...editionBook,
      _uid: firstEdition?.uid || editionBook._uid,
      Title: work.title,
      Author: editionBook.Author || author.name,
      Image: editionBook.Image || firstEdition?.image || ''
    };
    return (
      <BookItem
        key={`${work.id}-${keySuffix}`}
        book={displayBook}
        index={index}
        pageIndex={0}
        setBooks={setBooks}
        seriesOptions={seriesOptions}
        onBookClick={() => openWork(work)}
        bookAriaLabel={`Open ${work.title}, ${getYear(work.releaseDate) || 'publication year unknown'}`}
        readOnly
        compactMetadata
        footer={(
          <div className="d-flex justify-content-between align-items-center gap-2 text-muted">
            <span>{getYear(work.releaseDate) || 'Year unknown'}</span>
            <button
              className="btn btn-outline-secondary btn-sm"
              type="button"
              aria-label={`Edit ${work.title} category`}
              onClick={(event) => {
                event.stopPropagation();
                beginWorkEdit(work);
              }}
            >
              Edit
            </button>
          </div>
        )}
      />
    );
  };

  const openWork = async (work) => {
    setSelectedWork(work);
    setWorkSummary(null);
    setSummaryError('');
    const pageTitle = getWikipediaPageTitle(work.sourceUrl, work.title);
    setLoadingWorkSummary(true);
    try {
      setWorkSummary(await fetchJson(`/api/catalog/wikipedia/summary?pageTitle=${encodeURIComponent(pageTitle)}`));
    } catch (loadError) {
      setSummaryError(loadError.message || 'Unable to load the Wikipedia summary.');
    } finally {
      setLoadingWorkSummary(false);
    }
  };

  const beginAuthorEdit = () => {
    setAuthorForm({ name: author.name || '', sortName: author.sortName || '' });
    setEditError('');
    setEditingAuthor(true);
  };

  const saveAuthor = async () => {
    setSavingEdit(true);
    setEditError('');
    try {
      const name = authorForm.name.trim();
      const sortName = authorForm.sortName.trim();
      await fetchJson(`/api/catalog/authors/${encodeURIComponent(author.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authorIds: author.aliasIds || [author.id], name, sortName })
      });
      onAuthorUpdated?.({ ...author, name, sortName });
      setEditingAuthor(false);
    } catch (saveError) {
      setEditError(saveError.message || 'Unable to save the author.');
    } finally {
      setSavingEdit(false);
    }
  };

  const beginWorkEdit = (work) => {
    setEditingWork(work);
    setEditingWorkType(work.workType || '');
    setEditError('');
  };

  const saveWorkCategory = async () => {
    setSavingEdit(true);
    setEditError('');
    try {
      const workType = editingWorkType || null;
      await fetchJson(`/api/catalog/works/${encodeURIComponent(editingWork.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workType })
      });
      setWorks((current) => current.map((work) => (
        work.id === editingWork.id ? { ...work, workType } : work
      )));
      setEditingWork(null);
    } catch (saveError) {
      setEditError(saveError.message || 'Unable to update the Work category.');
    } finally {
      setSavingEdit(false);
    }
  };

  if (!author) return null;

  return (
    <section aria-label={`Works by ${author.name}`}>
      <div className="d-flex align-items-start gap-3 mb-4">
        <div className="author-profile-image">
          {authorSummary?.thumbnail && (
          <img
            src={authorSummary.thumbnail}
            alt={author.name}
            className="rounded w-100"
          />
          )}
        </div>
        <div className="author-profile-summary">
          <div className="d-flex align-items-center gap-2">
            <h2 className="mb-0">{author.name}</h2>
            <button className="btn btn-outline-secondary btn-sm" type="button" onClick={beginAuthorEdit}>
              Edit author
            </button>
          </div>
          {authorSummary?.extract && (
            <>
              <p className={`mb-1 author-summary-text${authorSummaryExpanded ? ' is-expanded' : ' is-collapsed'}`}>
                {authorSummary.extract}
              </p>
              <button
                className="btn btn-link btn-sm p-0"
                type="button"
                onClick={() => setAuthorSummaryExpanded((expanded) => !expanded)}
                aria-expanded={authorSummaryExpanded}
              >
                {authorSummaryExpanded ? 'Read less' : 'Read more'}
              </button>
            </>
          )}
          {authorSummary?.url && <a href={authorSummary.url} target="_blank" rel="noreferrer">Wikipedia biography</a>}
        </div>
      </div>

      {authorSummaryError && <div className="alert alert-warning" role="alert">{authorSummaryError}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {editError && <div className="alert alert-danger" role="alert">{editError}</div>}
      {loadingWorks ? <p>Loading Works…</p> : orderedWorks.length ? (
        workGroups.map((group) => (
          <section key={group.type} aria-label={`${group.type} works by ${author.name}`} className="mb-4">
            <h3>{group.type}</h3>
            <div className="row d-none d-md-flex title-row-desktop">
              {group.works.map((work, index) => renderWorkBook(work, index, `${group.type}-desktop`))}
            </div>
            <div className="d-md-none">
              <MobileChevronRow rowClassName="title-row" ariaLabel={`Scrollable ${group.type} works by ${author.name}`} resetKey={`${author.id}-${group.type}`}>
                {group.works.map((work, index) => renderWorkBook(work, index, `${group.type}-mobile`))}
              </MobileChevronRow>
            </div>
          </section>
        ))
      ) : !error ? <p className="text-muted">No reviewed Works are linked to this author yet.</p> : null}

      <Modal show={Boolean(selectedWork)} onHide={() => setSelectedWork(null)} size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title>{selectedWork?.title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingWorkSummary && <p>Loading Wikipedia summary…</p>}
          {summaryError && <div className="alert alert-warning" role="alert">{summaryError}</div>}
          {workSummary?.extract && <p>{workSummary.extract}</p>}
          {workSummary?.url && <p><a href={workSummary.url} target="_blank" rel="noreferrer">Read more on Wikipedia</a></p>}
          <h5>Linked editions ({orderedEditions.length})</h5>
          {orderedEditions.length ? (
            <div className="row row-cols-1 row-cols-md-2 g-3">
              {orderedEditions.map((edition, index) => (
                <BookItem
                  key={edition.uid}
                  book={{
                    ...(edition.book || {}),
                    _uid: edition.uid,
                    Title: edition.title || edition.book?.Title || selectedWork.title,
                    Author: edition.book?.Author || author.name,
                    ISBN: edition.isbn || edition.book?.ISBN || '',
                    Image: edition.image || edition.book?.Image || ''
                  }}
                  index={index}
                  pageIndex={0}
                  compactMetadata
                  showEditButton
                  disableBookHover
                  seriesOptions={seriesOptions}
                  onOpenSpineCrop={onOpenSpineCrop}
                  footer={(
                    <div className="text-muted">
                      <div>{edition.publicationDate || 'Publication date unknown'}</div>
                      {edition.book?.PublicationYear && <div>Work publication year: {edition.book.PublicationYear}</div>}
                      {edition.isbn && <div>ISBN {edition.isbn}</div>}
                    </div>
                  )}
                />
              ))}
            </div>
          ) : <p className="text-muted">No book editions have been linked to this Work yet.</p>}
        </Modal.Body>
      </Modal>

      <Modal show={editingAuthor} onHide={() => setEditingAuthor(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Author</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <label className="form-label" htmlFor="edit-author-name">Author name</label>
          <input
            id="edit-author-name"
            className="form-control mb-3"
            value={authorForm.name}
            onChange={(event) => setAuthorForm((current) => ({ ...current, name: event.target.value }))}
          />
          <label className="form-label" htmlFor="edit-author-sort-name">Sort name</label>
          <input
            id="edit-author-sort-name"
            className="form-control"
            value={authorForm.sortName}
            onChange={(event) => setAuthorForm((current) => ({ ...current, sortName: event.target.value }))}
          />
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-outline-secondary" type="button" onClick={() => setEditingAuthor(false)}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={saveAuthor} disabled={savingEdit || !authorForm.name.trim()}>
            {savingEdit ? 'Saving...' : 'Save author'}
          </button>
        </Modal.Footer>
      </Modal>

      <Modal show={Boolean(editingWork)} onHide={() => setEditingWork(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Edit Work category</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">{editingWork?.title}</p>
          <label className="form-label" htmlFor="edit-work-category">Category</label>
          <select
            id="edit-work-category"
            className="form-select"
            value={editingWorkType}
            onChange={(event) => setEditingWorkType(event.target.value)}
          >
            <option value="">Uncategorized</option>
            {workTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-outline-secondary" type="button" onClick={() => setEditingWork(null)}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={saveWorkCategory} disabled={savingEdit}>
            {savingEdit ? 'Saving...' : 'Save category'}
          </button>
        </Modal.Footer>
      </Modal>
    </section>
  );
};

export { getSurname };
export default AuthorWorksView;
