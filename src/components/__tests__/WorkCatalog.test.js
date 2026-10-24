import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkCatalog from '../WorkCatalog';
const Database = require('better-sqlite3');
const { createWorkRecord, initializeWorkCatalog } = require('../../../backend/workCatalog');

const author = { id: 'author-1', name: 'Herman Melville', sortName: 'Melville, Herman', wikidataQid: null };
const candidateWork = {
  qid: 'Q174840',
  title: 'Moby-Dick',
  sourceUrl: 'https://www.wikidata.org/wiki/Q174840',
  publicationDates: [{ value: '+1851-00-00T00:00:00Z', precision: 9 }]
};

test('requires reviewed Wikidata author and first-publication date before importing a Work', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/catalog/authors') return { ok: true, json: async () => [author] };
    if (url === '/api/catalog/works' && options.method === 'POST') return { ok: true, json: async () => ({ id: 'work-1' }) };
    if (url === '/api/catalog/works') return { ok: true, json: async () => [] };
    if (url.startsWith('/api/catalog/wikidata/search')) {
      return { ok: true, json: async () => [{ qid: 'Q123', label: 'Herman Melville', description: 'American novelist' }] };
    }
    if (url === '/api/catalog/authors/author-1/wikidata') return { ok: true, json: async () => ({}) };
    if (url === '/api/catalog/wikidata/authors/Q123/works') {
      return { ok: true, json: async () => [candidateWork] };
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  try {
    render(<WorkCatalog onBack={jest.fn()} />);
    await screen.findByRole('option', { name: 'Herman Melville' });
    fireEvent.change(screen.getByLabelText('Catalog author'), { target: { value: 'author-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Wikidata for this author' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm identity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load candidate Works' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));

    fireEvent.click(screen.getByLabelText(/1851/));
    fireEvent.click(screen.getByLabelText(/I verified this is the Work’s original/));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and add Work' }));

    await waitFor(() => {
      expect(calls).toContainEqual(expect.objectContaining({
        url: '/api/catalog/works',
        options: expect.objectContaining({ method: 'POST' })
      }));
    });
    const saveCall = calls.find((call) => call.url === '/api/catalog/works' && call.options.method === 'POST');
    expect(JSON.parse(saveCall.options.body)).toEqual(expect.objectContaining({
      wikidataQid: 'Q174840',
      title: 'Moby-Dick',
      releaseDate: '+1851-00-00T00:00:00Z',
      datePrecision: 9,
      authorIds: ['author-1'],
      bookUids: []
    }));
  } finally {
    global.fetch = originalFetch;
  }
});

test('stores reviewed Works with many authors and many edition links without changing editions', () => {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE books (uid TEXT PRIMARY KEY, title TEXT NOT NULL, isbn TEXT);
    INSERT INTO books (uid, title, isbn) VALUES
      ('edition-1', 'Collected Poems', '111'),
      ('edition-2', 'Collected Poems', '222'),
      ('edition-3', 'Collected Poems', '333');
  `);
  initializeWorkCatalog(db);
  db.exec(`
    INSERT INTO authors (id, name) VALUES
      ('author-1', 'Author One'),
      ('author-2', 'Author Two'),
      ('author-3', 'Author Three');
  `);

  const id = createWorkRecord(db, {
    wikidataQid: 'Q123',
    title: 'Collected Poems',
    releaseDate: '+1900-00-00T00:00:00Z',
    datePrecision: 9,
    authorIds: ['author-1', 'author-2'],
    bookUids: ['edition-1', 'edition-2']
  });

  expect(db.prepare('SELECT COUNT(*) AS count FROM author_works WHERE work_id = ?').get(id).count).toBe(2);
  expect(db.prepare('SELECT COUNT(*) AS count FROM book_works WHERE work_id = ?').get(id).count).toBe(2);
  expect(db.prepare('SELECT COUNT(*) AS count FROM books').get().count).toBe(3);
  expect(createWorkRecord(db, {
    wikidataQid: 'Q123',
    title: 'Collected Poems',
    releaseDate: '+1900-00-00T00:00:00Z',
    datePrecision: 9,
    authorIds: ['author-3'],
    bookUids: ['edition-3']
  })).toBe(id);
  expect(db.prepare('SELECT COUNT(*) AS count FROM author_works WHERE work_id = ?').get(id).count).toBe(3);
  expect(db.prepare('SELECT COUNT(*) AS count FROM book_works WHERE work_id = ?').get(id).count).toBe(3);
  expect(() => createWorkRecord(db, {
    wikidataQid: 'Q456',
    title: 'Missing Date',
    authorIds: ['author-1']
  })).toThrow('A release date and its precision are required.');
  db.close();
});

test('adds book edition links to an already reviewed Work', async () => {
  const originalFetch = global.fetch;
  const work = {
    id: 'work-1',
    title: 'Moby-Dick',
    releaseDate: '+1851-00-00T00:00:00Z',
    datePrecision: 9,
    authors: [author],
    books: []
  };
  const edition = { uid: 'edition-1', title: 'Moby-Dick', author: 'Herman Melville', isbn: '9780000000000' };
  const calls = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/catalog/authors') return { ok: true, json: async () => [author] };
    if (url === '/api/catalog/works') return { ok: true, json: async () => [work] };
    if (url.startsWith('/api/catalog/books?q=')) return { ok: true, json: async () => [edition] };
    if (url === '/api/catalog/works/work-1/relationships') return { ok: true, status: 204 };
    throw new Error(`Unexpected request: ${url}`);
  });

  try {
    render(<WorkCatalog onBack={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Link editions' }));
    fireEvent.change(screen.getByLabelText('Search editions for Moby-Dick'), { target: { value: 'Moby-Dick' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByLabelText(/ISBN 9780000000000/));
    fireEvent.click(screen.getByRole('button', { name: 'Save edition links' }));

    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({
      url: '/api/catalog/works/work-1/relationships',
      options: expect.objectContaining({ method: 'POST' })
    })));
    const saveCall = calls.find((call) => call.url === '/api/catalog/works/work-1/relationships');
    expect(JSON.parse(saveCall.options.body)).toEqual({ bookUids: ['edition-1'] });
  } finally {
    global.fetch = originalFetch;
  }
});
