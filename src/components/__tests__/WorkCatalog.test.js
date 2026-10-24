import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WorkCatalog from '../WorkCatalog';
const Database = require('better-sqlite3');
const { TextDecoder, TextEncoder } = require('util');
const { ReadableStream, WritableStream, TransformStream } = require('stream/web');
const { MessageChannel, MessagePort } = require('worker_threads');
const { Blob } = require('buffer');
const {
  createWorkRecord,
  getWikipediaWorks,
  initializeWorkCatalog
} = require('../../../backend/workCatalog');

const author = { id: 'author-1', name: 'Herman Melville', sortName: 'Melville, Herman', wikipediaPageTitle: null };
const candidateWork = {
  sourceId: 'https://en.wikipedia.org/wiki/Moby-Dick',
  title: 'Moby-Dick',
  sourceUrl: 'https://en.wikipedia.org/wiki/Moby-Dick',
  sourceStatement: 'Novels',
  date: { value: '1851', precision: 9 }
};

test('requires review of the Wikipedia author and publication year before importing a Work', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = jest.fn(async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/catalog/authors') return { ok: true, json: async () => [author] };
    if (url === '/api/catalog/works' && options.method === 'POST') return { ok: true, json: async () => ({ id: 'work-1' }) };
    if (url === '/api/catalog/works') return { ok: true, json: async () => [] };
    if (url.startsWith('/api/catalog/wikipedia/search')) {
      return { ok: true, json: async () => [{ pageTitle: 'Herman Melville', url: 'https://en.wikipedia.org/wiki/Herman_Melville', description: 'American novelist' }] };
    }
    if (url === '/api/catalog/authors/author-1/wikipedia') return { ok: true, json: async () => ({}) };
    if (url === '/api/catalog/wikipedia/authors/works?pageTitle=Herman%20Melville') {
      return { ok: true, json: async () => [candidateWork] };
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  try {
    render(<WorkCatalog onBack={jest.fn()} />);
    await screen.findByRole('option', { name: 'Herman Melville' });
    fireEvent.change(screen.getByLabelText('Catalog author'), { target: { value: 'author-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search Wikipedia for this author' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm identity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Load works from Wikipedia' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));

    expect(screen.getByLabelText('Reviewed publication year')).toHaveValue(1851);
    fireEvent.click(screen.getByLabelText(/I verified this publication year/));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and add Work' }));

    await waitFor(() => {
      expect(calls).toContainEqual(expect.objectContaining({
        url: '/api/catalog/works',
        options: expect.objectContaining({ method: 'POST' })
      }));
    });
    const saveCall = calls.find((call) => call.url === '/api/catalog/works' && call.options.method === 'POST');
    expect(JSON.parse(saveCall.options.body)).toEqual(expect.objectContaining({
      title: 'Moby-Dick',
      sourceType: 'wikipedia',
      sourceId: 'https://en.wikipedia.org/wiki/Moby-Dick',
      releaseDate: '1851',
      datePrecision: 9,
      sourceStatement: 'Novels',
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

test('upgrades existing catalog rows with a stable legacy source identifier', () => {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE books (uid TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE authors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_name TEXT NOT NULL DEFAULT '',
      wikidata_qid TEXT UNIQUE, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE works (
      id TEXT PRIMARY KEY, wikidata_qid TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
      release_date TEXT NOT NULL, date_precision INTEGER NOT NULL, source_url TEXT,
      source_statement TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO authors (id, name) VALUES ('author-1', 'Author One');
    INSERT INTO works (id, wikidata_qid, title, release_date, date_precision)
    VALUES ('work-1', 'Q123', 'Existing Work', '+1900-00-00T00:00:00Z', 9);
  `);

  initializeWorkCatalog(db);
  expect(db.prepare('SELECT source_type, source_id FROM works WHERE id = ?').get('work-1'))
    .toEqual({ source_type: 'wikidata', source_id: 'Q123' });
  expect(db.prepare('PRAGMA table_info(authors)').all().map((column) => column.name))
    .toContain('wikipedia_page_title');
  db.close();
});

test('adds book edition links to an already reviewed Work', async () => {
  const originalFetch = global.fetch;
  const work = {
    id: 'work-1',
    title: 'Moby-Dick',
    releaseDate: '1851',
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
    expect(screen.getByLabelText('Search editions for Moby-Dick')).toHaveValue('Moby-Dick');
    fireEvent.click(await screen.findByLabelText(/ISBN 9780000000000/));
    fireEvent.click(screen.getByRole('button', { name: 'Save edition links' }));

    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({
      url: '/api/catalog/books?q=Moby-Dick'
    })));
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

test('extracts works from Wikipedia bibliography sections with linked source and year', async () => {
  const originalFetch = global.fetch;
  const originalTimeout = AbortSignal.timeout;
  const originalTextDecoder = global.TextDecoder;
  const originalTextEncoder = global.TextEncoder;
  const originalReadableStream = global.ReadableStream;
  const originalWritableStream = global.WritableStream;
  const originalTransformStream = global.TransformStream;
  const originalMessageChannel = global.MessageChannel;
  const originalMessagePort = global.MessagePort;
  const originalBlob = global.Blob;
  AbortSignal.timeout = () => undefined;
  global.TextDecoder = TextDecoder;
  global.TextEncoder = TextEncoder;
  global.ReadableStream = ReadableStream;
  global.WritableStream = WritableStream;
  global.TransformStream = TransformStream;
  global.MessageChannel = MessageChannel;
  global.MessagePort = MessagePort;
  global.Blob = Blob;
  global.fetch = jest.fn(async (url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.searchParams.get('prop') === 'sections') {
      return {
        ok: true,
        json: async () => ({
          parse: {
            title: 'Herman Melville',
            sections: [
              { index: '1', line: 'Early life' },
              { index: '2', line: 'Works' }
            ]
          }
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        parse: {
          text: {
            '*': '<ul><li><i><a href="/wiki/Moby-Dick" title="Moby-Dick">Moby-Dick</a></i> (1851)</li></ul>'
          }
        }
      })
    };
  });

  try {
    await expect(getWikipediaWorks('Herman Melville')).resolves.toEqual([
      expect.objectContaining({
        sourceId: 'https://en.wikipedia.org/wiki/Moby-Dick',
        sourceUrl: 'https://en.wikipedia.org/wiki/Moby-Dick',
        title: 'Moby-Dick',
        date: { value: '1851', precision: 9 }
      })
    ]);
  } finally {
    global.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
    global.TextDecoder = originalTextDecoder;
    global.TextEncoder = originalTextEncoder;
    global.ReadableStream = originalReadableStream;
    global.WritableStream = originalWritableStream;
    global.TransformStream = originalTransformStream;
    global.MessageChannel = originalMessageChannel;
    global.MessagePort = originalMessagePort;
    global.Blob = originalBlob;
  }
});

test('shows an author’s linked Works in ascending publication order', async () => {
  const originalFetch = global.fetch;
  const authorWithPage = { ...author, wikipediaPageTitle: 'Herman Melville' };
  const works = [
    { id: 'late', title: 'Later Work', releaseDate: '1920', authors: [authorWithPage], books: [] },
    { id: 'early', title: 'Earlier Work', releaseDate: '1851', authors: [authorWithPage], books: [] }
  ];
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => url === '/api/catalog/authors' ? [authorWithPage] : works
  }));

  try {
    render(<WorkCatalog onBack={jest.fn()} />);
    fireEvent.change(await screen.findByLabelText('Catalog author'), { target: { value: 'author-1' } });
    const authorView = screen.getByLabelText('Author view');
    const titles = within(authorView).getAllByRole('listitem').map((item) => item.textContent);
    expect(titles[0]).toContain('Earlier Work');
    expect(titles[1]).toContain('Later Work');
  } finally {
    global.fetch = originalFetch;
  }
});
