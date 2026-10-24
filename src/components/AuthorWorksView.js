import { useEffect, useMemo, useState } from 'react';
import Button from 'react-bootstrap/Button';
import Modal from 'react-bootstrap/Modal';
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

const fetchJson = async (path) => {
  const response = await fetch(apiUrl(path));
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}).`);
  return result;
};

const AuthorWorksView = ({ author }) => {
  const [works, setWorks] = useState([]);
  const [authorSummary, setAuthorSummary] = useState(null);
  const [selectedWork, setSelectedWork] = useState(null);
  const [workSummary, setWorkSummary] = useState(null);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [loadingWorkSummary, setLoadingWorkSummary] = useState(false);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [authorSummaryError, setAuthorSummaryError] = useState('');

  useEffect(() => {
    if (!author) return undefined;
    const controller = new AbortController();
    setLoadingWorks(true);
    setError('');
    setWorks([]);
    setAuthorSummary(null);
    setAuthorSummaryError('');

    const worksRequest = fetch(apiUrl('/api/catalog/works'), { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error || `Request failed (${response.status}).`);
        return result;
      });
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
      summaryRequest
    ])
      .then(([allWorks, summary]) => {
        setWorks(allWorks.filter((work) => (work.authors || []).some((workAuthor) => workAuthor.id === author.id)));
        setAuthorSummary(summary);
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
  const orderedEditions = useMemo(() => [...(selectedWork?.books || [])].sort((left, right) => (
    compareByYear(left, right, 'publicationDate')
  )), [selectedWork]);

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

  if (!author) return null;

  return (
    <section aria-label={`Works by ${author.name}`}>
      <div className="d-flex align-items-start gap-3 mb-4">
        {authorSummary?.thumbnail && (
          <img
            src={authorSummary.thumbnail}
            alt={author.name}
            className="rounded"
            style={{ width: 120, height: 150, objectFit: 'cover' }}
          />
        )}
        <div>
          <h2>{author.name}</h2>
          {authorSummary?.extract && <p className="mb-1">{authorSummary.extract}</p>}
          {authorSummary?.url && <a href={authorSummary.url} target="_blank" rel="noreferrer">Wikipedia biography</a>}
        </div>
      </div>

      {authorSummaryError && <div className="alert alert-warning" role="alert">{authorSummaryError}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {loadingWorks ? <p>Loading Works…</p> : orderedWorks.length ? (
        <div className="row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-xl-5 g-3">
          {orderedWorks.map((work) => {
            const firstEdition = [...(work.books || [])].sort((left, right) => compareByYear(left, right, 'publicationDate'))[0];
            return (
              <div className="col" key={work.id}>
                <Button
                  variant="light"
                  className="w-100 h-100 text-start border p-2"
                  onClick={() => openWork(work)}
                  aria-label={`Open ${work.title}, ${getYear(work.releaseDate) || 'publication year unknown'}`}
                >
                  {firstEdition?.image ? (
                    <img src={firstEdition.image} alt={`Cover of ${work.title}`} className="w-100 rounded mb-2" style={{ height: 240, objectFit: 'contain' }} />
                  ) : (
                    <div className="d-flex align-items-center justify-content-center bg-light rounded mb-2 text-muted" style={{ height: 240 }}>No cover available</div>
                  )}
                  <div className="fw-semibold">{work.title}</div>
                  <div className="text-muted">{getYear(work.releaseDate) || 'Year unknown'}</div>
                </Button>
              </div>
            );
          })}
        </div>
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
            <div className="list-group">
              {orderedEditions.map((edition) => (
                <div className="list-group-item d-flex gap-3" key={edition.uid}>
                  {edition.image && <img src={edition.image} alt={`Cover of ${edition.title || selectedWork.title}`} style={{ width: 90, height: 130, objectFit: 'contain' }} />}
                  <div>
                    <strong>{edition.title || selectedWork.title}</strong>
                    <div>{edition.publicationDate || 'Publication date unknown'}</div>
                    {edition.isbn && <div>ISBN {edition.isbn}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-muted">No book editions have been linked to this Work yet.</p>}
        </Modal.Body>
      </Modal>
    </section>
  );
};

export { getSurname };
export default AuthorWorksView;
