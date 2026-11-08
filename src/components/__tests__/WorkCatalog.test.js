import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import WorkCatalog from '../WorkCatalog';
const Database = require('better-sqlite3');
const { TextDecoder, TextEncoder } = require('util');
const { ReadableStream, WritableStream, TransformStream } = require('stream/web');
const { MessageChannel, MessagePort } = require('worker_threads');
const { Blob } = require('buffer');
const {
  createWorkRecord,
  getEditionAuthorNames,
  getWikipediaAuthorCandidates,
  getWikipediaPageSummary,
  getWikipediaWorks,
  initializeWorkCatalog,
  syncEditionAuthors
} = require('../../../backend/workCatalog');

const author = { id: 'author-1', name: 'Herman Melville', sortName: 'Melville, Herman', wikipediaPageTitle: null };
const candidateWork = {
  sourceId: 'https://en.wikipedia.org/wiki/Moby-Dick',
  title: 'Moby-Dick',
  sourceUrl: 'https://en.wikipedia.org/wiki/Moby-Dick',
  sourceStatement: 'Novels',
  date: { value: '1851', precision: 9 }
};

test('automatically searches Wikipedia and edition matches, then requires review before importing a Work', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  const matchingEdition = {
    uid: 'edition-moby-dick',
    title: 'Moby-Dick',
    author: 'Herman Melville',
    isbn: '9780000000000'
  };
  global.fetch = jest.fn(async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/catalog/authors') return { ok: true, json: async () => [author] };
    if (url === '/api/catalog/works' && options.method === 'POST') return { ok: true, json: async () => ({ id: 'work-1' }) };
    if (url === '/api/catalog/works') return { ok: true, json: async () => [] };
    if (url === '/api/catalog/books?q=Moby-Dick') return { ok: true, json: async () => [matchingEdition] };
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
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm identity' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));

    expect(screen.getByLabelText('Search book editions')).toHaveValue('Moby-Dick');
    const editionCheckbox = await screen.findByLabelText(/ISBN 9780000000000/);
    expect(editionCheckbox).toBeChecked();
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
      bookUids: ['edition-moby-dick']
    }));
    expect(calls.some((call) => call.url.startsWith('/api/catalog/wikipedia/search?q=Herman%20Melville'))).toBe(true);
    expect(calls.some((call) => call.url === '/api/catalog/wikipedia/authors/works?pageTitle=Herman%20Melville')).toBe(true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('searches Wikipedia using the selected author name when Search Wikipedia again is clicked', async () => {
  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = jest.fn(async (url) => {
    requests.push(url);
    if (url === '/api/catalog/authors') return { ok: true, json: async () => [author] };
    if (url === '/api/catalog/works') return { ok: true, json: async () => [] };
    if (url === '/api/catalog/wikipedia/search?q=Herman%20Melville') {
      return {
        ok: true,
        json: async () => [{ pageTitle: 'Herman Melville', url: 'https://en.wikipedia.org/wiki/Herman_Melville', description: '' }]
      };
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  try {
    render(<WorkCatalog onBack={jest.fn()} />);
    await screen.findByRole('option', { name: /Herman Melville/ });
    fireEvent.change(screen.getByLabelText('Catalog author'), { target: { value: 'author-1' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Search Wikipedia again' }));

    expect(await screen.findByText('Herman Melville', { selector: 'strong' })).toBeInTheDocument();
    expect(requests).toContain('/api/catalog/wikipedia/search?q=Herman%20Melville');
    expect(requests).not.toContain('/api/catalog/wikipedia/search?q=undefined');
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

test('adds authors discovered in edition author fields to the catalog', () => {
  const db = new Database(':memory:');
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE books (uid TEXT PRIMARY KEY, title TEXT NOT NULL);
  `);
  initializeWorkCatalog(db);

  expect(getEditionAuthorNames({
    Author: 'Jacob Grimm, Wilhelm Grimm',
    AlphaAuthor: 'Jacob Grimm',
    Authors: [{ name: 'Wilhelm Grimm' }, 'Brothers Grimm']
  })).toEqual(['Jacob Grimm', 'Wilhelm Grimm', 'Brothers Grimm']);

  syncEditionAuthors(db, [
    { Author: 'Jacob Grimm, Wilhelm Grimm', AlphaAuthor: 'Jacob Grimm' },
    { Author: 'Wilhelm Grimm' }
  ]);
  expect(db.prepare('SELECT name FROM authors ORDER BY name').all()).toEqual([
    { name: 'Jacob Grimm' },
    { name: 'Wilhelm Grimm' }
  ]);
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

test('reads cached Wikipedia searches and bibliography results without contacting Wikipedia', async () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  global.fetch = fetchMock;
  const cachedResults = [{ pageTitle: 'Herman Melville' }];
  const cache = {
    get: jest.fn(async () => cachedResults),
    set: jest.fn()
  };

  try {
    await expect(getWikipediaAuthorCandidates('Herman Melville', cache)).resolves.toBe(cachedResults);
    await expect(getWikipediaWorks('herman_melville', cache)).resolves.toBe(cachedResults);
    expect(cache.get).toHaveBeenNthCalledWith(1, 'v1:author-search:herman melville');
    expect(cache.get).toHaveBeenNthCalledWith(2, 'v1:author-works:herman melville');
    expect(fetchMock).not.toHaveBeenCalled();
  } finally {
    global.fetch = originalFetch;
  }
});

test('persists a successful Wikipedia page summary for later requests', async () => {
  const originalFetch = global.fetch;
  const originalTimeout = AbortSignal.timeout;
  let persistedSummary;
  const cache = {
    get: jest.fn(async () => persistedSummary),
    set: jest.fn(async (_key, data) => {
      persistedSummary = data;
    })
  };
  const fetchMock = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      query: {
        pages: {
          123: {
            title: 'Charles Dickens',
            extract: 'English novelist.',
            thumbnail: { source: 'https://upload.wikimedia.org/example.jpg' }
          }
        }
      }
    })
  }));
  global.fetch = fetchMock;
  AbortSignal.timeout = () => undefined;

  try {
    const summary = await getWikipediaPageSummary('Charles Dickens', cache);
    expect(cache.set).toHaveBeenCalledWith('v1:page-summary:charles dickens', summary);
    await expect(getWikipediaPageSummary('charles_dickens', cache)).resolves.toEqual(summary);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(summary).toEqual(expect.objectContaining({
      pageTitle: 'Charles Dickens',
      extract: 'English novelist.',
      thumbnail: 'https://upload.wikimedia.org/example.jpg'
    }));
  } finally {
    global.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
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

test('only shows linked edition details for Works by the selected author', async () => {
  const originalFetch = global.fetch;
  const selectedAuthor = { ...author, wikipediaPageTitle: 'Herman Melville' };
  const otherAuthor = { id: 'author-2', name: 'Charles Dickens', wikipediaPageTitle: null };
  const works = [
    {
      id: 'selected-work',
      title: 'Selected Work',
      releaseDate: '1851',
      authors: [selectedAuthor],
      books: [{ title: 'Selected Edition', isbn: '111' }]
    },
    {
      id: 'other-work',
      title: 'Other Work',
      releaseDate: '1860',
      authors: [otherAuthor],
      books: [{ title: 'Other Edition', isbn: '222' }]
    }
  ];
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => {
      if (url === '/api/catalog/authors') return [selectedAuthor, otherAuthor];
      if (url === '/api/catalog/works') return works;
      if (url === '/api/catalog/wikipedia/authors/works?pageTitle=Herman%20Melville') return [];
      throw new Error(`Unexpected request: ${url}`);
    }
  }));

  try {
    render(<WorkCatalog onBack={jest.fn()} />);
    await screen.findByRole('option', { name: /Herman Melville/ });
    fireEvent.change(screen.getByLabelText('Catalog author'), { target: { value: 'author-1' } });

    expect(await screen.findByText('Selected Edition (111)')).toBeInTheDocument();
    expect(screen.getByText('Edition linked')).toBeInTheDocument();
    expect(screen.queryByText('Other Edition (222)')).not.toBeInTheDocument();
  } finally {
    global.fetch = originalFetch;
  }
});

test('shows Wikipedia Work review candidates in chronological order with undated Works last', async () => {
  const originalFetch = global.fetch;
  const authorWithPage = { ...author, wikipediaPageTitle: 'Herman Melville' };
  const candidates = [
    { sourceId: 'late', title: 'Later Work', date: { value: '1920', precision: 9 } },
    { sourceId: 'undated', title: 'Undated Work', date: null },
    { sourceId: 'early', title: 'Earlier Work', date: { value: '1851', precision: 9 } }
  ];
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => {
      if (url === '/api/catalog/authors') return [authorWithPage];
      if (url === '/api/catalog/works') return [];
      if (url === '/api/catalog/wikipedia/authors/works?pageTitle=Herman%20Melville') return candidates;
      if (url === '/api/catalog/books?q=Earlier%20Work') {
        return [{ uid: 'earlier-edition', title: 'Earlier Work', isbn: '111' }];
      }
      if (url === '/api/catalog/books?q=Later%20Work' || url === '/api/catalog/books?q=Undated%20Work') return [];
      throw new Error(`Unexpected request: ${url}`);
    }
  }));

  try {
    render(<WorkCatalog onBack={jest.fn()} />);
    fireEvent.change(await screen.findByLabelText('Catalog author'), { target: { value: 'author-1' } });

    const defaultReviewButtons = await screen.findAllByRole('button', { name: 'Review' });
    expect(defaultReviewButtons).toHaveLength(1);
    expect(defaultReviewButtons[0].parentElement.textContent).toContain('Earlier Work');
    expect(screen.getByText('Earlier Work · ISBN 111')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Show works without a likely edition match (2)'));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Review' })).toHaveLength(3));
  } finally {
    global.fetch = originalFetch;
  }
});

test('matches Wikipedia works with parenthetical work types to edition titles', async () => {
  const originalFetch = global.fetch;
  const authorWithPage = { ...author, wikipediaPageTitle: 'Herman Melville' };
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => {
      if (url === '/api/catalog/authors') return [authorWithPage];
      if (url === '/api/catalog/works') return [];
      if (url === '/api/catalog/wikipedia/authors/works?pageTitle=Herman%20Melville') {
        return [{
          sourceId: 'https://en.wikipedia.org/wiki/The_Red_Badge_of_Courage',
          sourceUrl: 'https://en.wikipedia.org/wiki/The_Red_Badge_of_Courage',
          title: 'The Red Badge of Courage (novel)',
          sourceStatement: 'Novels',
          date: { value: '1895', precision: 9 }
        }];
      }
      if (url.startsWith('/api/catalog/books?q=')) {
        const title = decodeURIComponent(url.slice('/api/catalog/books?q='.length));
        if (title === 'The Red Badge of Courage') {
          return [{ uid: 'badge-edition', title: 'The Red Badge of Courage', isbn: '222' }];
        }
        if (title === 'The Red Badge of Courage (novel)') return [];
      }
      throw new Error(`Unexpected request: ${url}`);
    }
  }));

  try {
    render(<WorkCatalog onBack={jest.fn()} />);
    await screen.findByRole('option', { name: /Herman Melville/ });
    fireEvent.change(screen.getByLabelText('Catalog author'), { target: { value: 'author-1' } });

    expect(await screen.findByText('The Red Badge of Courage · ISBN 222')).toBeInTheDocument();
    expect(screen.getByText('Wikipedia lists this as “The Red Badge of Courage (novel)”; matching editions by the shorter title.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    expect(screen.getByLabelText('Work title')).toHaveValue('The Red Badge of Courage');
    expect(screen.getByLabelText('Search book editions')).toHaveValue('The Red Badge of Courage');
  } finally {
    global.fetch = originalFetch;
  }
});
