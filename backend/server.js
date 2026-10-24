const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { createImageProxyHandler } = require('./imageProxy');
const {
  createWorkRecord,
  addWorkRelationships,
  getWikipediaAuthorCandidates,
  getWikipediaWorks,
  stableAuthorId
} = require('./workCatalog');

const app = express();
const port = process.env.PORT || 4000;
const seedPath = path.resolve(process.env.SEED_PATH || path.join(__dirname, 'BookList.json'));
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const supabaseUrl = (process.env.SUPABASE_URL || '')
  .trim()
  .replace(/\/rest\/v1(?:\/books)?\/?$/, '')
  .replace(/\/+$/, '');
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const useSupabase = Boolean(supabaseUrl && supabaseServiceKey);

if (Boolean(supabaseUrl) !== Boolean(supabaseServiceKey)) {
  throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or neither.');
}
const dbPath = useSupabase
  ? path.join(__dirname, 'data', 'books.db')
  : path.resolve(process.env.DB_PATH || path.join(__dirname, 'data', 'books.db'));

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT UNIQUE,
    title TEXT NOT NULL,
    full_title TEXT,
    author TEXT,
    series TEXT,
    series_id TEXT,
    isbn TEXT,
    ean TEXT,
    image TEXT,
    website TEXT,
    price TEXT,
    pagination TEXT,
    binding TEXT,
    alpha_author TEXT,
    alpha_title TEXT,
    spine_title TEXT,
    pcversion TEXT,
    description TEXT,
    goodreads TEXT,
    publication_date TEXT,
    original_publication_date TEXT,
    penguin_id TEXT,
    bic_subjects TEXT,
    bic_qualifiers TEXT,
    subject TEXT,
    illustrations TEXT,
    notes TEXT,
    authors_json TEXT,
    editors_json TEXT,
    translators_json TEXT,
    book_width TEXT,
    book_height TEXT,
    raw_json TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    height_width_ratio REAL,
    thickness_multiplier REAL NOT NULL DEFAULT 1.0,
    spine_mode TEXT NOT NULL DEFAULT 'automatic',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const ensureBookColumns = () => {
  const columns = db.prepare('PRAGMA table_info(books)').all().map((column) => column.name);
  const addColumn = (name) => {
    if (!columns.includes(name)) {
      db.exec(`ALTER TABLE books ADD COLUMN ${name} TEXT`);
    }
  };

  addColumn('full_title');
  addColumn('book_width');
  addColumn('book_height');
  addColumn('pcversion');
  addColumn('description');
  addColumn('goodreads');
  addColumn('publication_date');
  addColumn('original_publication_date');
  addColumn('penguin_id');
  addColumn('bic_subjects');
  addColumn('bic_qualifiers');
  addColumn('subject');
  addColumn('illustrations');
  addColumn('notes');
  addColumn('authors_json');
  addColumn('editors_json');
  addColumn('translators_json');
};

ensureBookColumns();
if (!useSupabase) {
  const { initializeWorkCatalog, seedAuthorsFromList } = require('./workCatalog');
  initializeWorkCatalog(db);
  seedAuthorsFromList(db, process.env.AUTHOR_SEED_PATH || path.resolve(__dirname, '../public/AuthorList.json'));
}
const seriesColumns = db.prepare('PRAGMA table_info(series)').all().map((column) => column.name);
if (!seriesColumns.includes('thickness_multiplier')) {
  db.exec('ALTER TABLE series ADD COLUMN thickness_multiplier REAL NOT NULL DEFAULT 1.0');
}

const updateBook = db.prepare(`
  UPDATE books
  SET
    title = @title,
    full_title = @fullTitle,
    author = @author,
    series = @series,
    series_id = @seriesId,
    isbn = @isbn,
    ean = @ean,
    image = @image,
    website = @website,
    price = @price,
    pagination = @pagination,
    binding = @binding,
    alpha_author = @alphaAuthor,
    alpha_title = @alphaTitle,
    spine_title = @spineTitle,
    pcversion = @pcversion,
    description = @description,
    goodreads = @goodreads,
    publication_date = @publicationDate,
    original_publication_date = @originalPublicationDate,
    penguin_id = @penguinId,
    bic_subjects = @bicSubjects,
    bic_qualifiers = @bicQualifiers,
    subject = @subject,
    illustrations = @illustrations,
    notes = @notes,
    authors_json = @authorsJson,
    editors_json = @editorsJson,
    translators_json = @translatorsJson,
    book_width = @bookWidth,
    book_height = @bookHeight,
    raw_json = @raw_json,
    updated_at = CURRENT_TIMESTAMP
  WHERE uid = @uid
`);

const getBookByUid = db.prepare(`
  SELECT *
  FROM books
  WHERE uid = ?
`);

const upsertBook = db.prepare(`
  INSERT INTO books (
    uid,
    title,
    full_title,
    author,
    series,
    series_id,
    isbn,
    ean,
    image,
    website,
    price,
    pagination,
    binding,
    alpha_author,
    alpha_title,
    spine_title,
    pcversion,
    description,
    goodreads,
    publication_date,
    original_publication_date,
    penguin_id,
    bic_subjects,
    bic_qualifiers,
    subject,
    illustrations,
    notes,
    authors_json,
    editors_json,
    translators_json,
    book_width,
    book_height,
    raw_json,
    updated_at
  ) VALUES (
    @uid,
    @title,
    @fullTitle,
    @author,
    @series,
    @seriesId,
    @isbn,
    @ean,
    @image,
    @website,
    @price,
    @pagination,
    @binding,
    @alphaAuthor,
    @alphaTitle,
    @spineTitle,
    @pcversion,
    @description,
    @goodreads,
    @publicationDate,
    @originalPublicationDate,
    @penguinId,
    @bicSubjects,
    @bicQualifiers,
    @subject,
    @illustrations,
    @notes,
    @authorsJson,
    @editorsJson,
    @translatorsJson,
    @bookWidth,
    @bookHeight,
    @raw_json,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(uid) DO UPDATE SET
    title = COALESCE(books.title, excluded.title),
    full_title = COALESCE(books.full_title, excluded.full_title),
    author = COALESCE(books.author, excluded.author),
    series = COALESCE(books.series, excluded.series),
    series_id = COALESCE(books.series_id, excluded.series_id),
    isbn = COALESCE(books.isbn, excluded.isbn),
    ean = COALESCE(books.ean, excluded.ean),
    image = COALESCE(books.image, excluded.image),
    website = COALESCE(books.website, excluded.website),
    price = COALESCE(books.price, excluded.price),
    pagination = COALESCE(books.pagination, excluded.pagination),
    binding = COALESCE(books.binding, excluded.binding),
    alpha_author = COALESCE(books.alpha_author, excluded.alpha_author),
    alpha_title = COALESCE(books.alpha_title, excluded.alpha_title),
    spine_title = COALESCE(books.spine_title, excluded.spine_title),
    pcversion = COALESCE(books.pcversion, excluded.pcversion),
    description = COALESCE(books.description, excluded.description),
    goodreads = COALESCE(books.goodreads, excluded.goodreads),
    publication_date = COALESCE(books.publication_date, excluded.publication_date),
    original_publication_date = COALESCE(books.original_publication_date, excluded.original_publication_date),
    penguin_id = COALESCE(books.penguin_id, excluded.penguin_id),
    bic_subjects = COALESCE(books.bic_subjects, excluded.bic_subjects),
    bic_qualifiers = COALESCE(books.bic_qualifiers, excluded.bic_qualifiers),
    subject = COALESCE(books.subject, excluded.subject),
    illustrations = COALESCE(books.illustrations, excluded.illustrations),
    notes = COALESCE(books.notes, excluded.notes),
    authors_json = COALESCE(books.authors_json, excluded.authors_json),
    editors_json = COALESCE(books.editors_json, excluded.editors_json),
    translators_json = COALESCE(books.translators_json, excluded.translators_json),
    book_width = COALESCE(books.book_width, excluded.book_width),
    book_height = COALESCE(books.book_height, excluded.book_height),
    raw_json = COALESCE(books.raw_json, excluded.raw_json),
    updated_at = CURRENT_TIMESTAMP
`);

function rowToBook(row) {
  return row
    ? {
        ...JSON.parse(row.raw_json || '{}'),
        _uid: row.uid,
        Title: row.title,
        FullTitle: row.full_title,
        Author: row.author,
        Series: row.series,
        SeriesId: row.series_id,
        ISBN: row.isbn,
        EAN: row.ean,
        Image: row.image,
        Website: row.website,
        Price: row.price,
        PAGINATION: row.pagination,
        BINDING: row.binding,
        AlphaAuthor: row.alpha_author,
        AlphaTitle: row.alpha_title,
        SpineTitle: row.spine_title,
        PCversion: row.pcversion,
        Description: row.description,
        GOODREADS: row.goodreads,
        PublicationDate: row.publication_date,
        OriginalPublicationDate: row.original_publication_date,
        PenguinID: row.penguin_id,
        BICSubjects: row.bic_subjects,
        BICQualifiers: row.bic_qualifiers,
        Subject: row.subject,
        Illustrations: row.illustrations,
        Notes: row.notes,
        Authors: parseJsonArray(row.authors_json),
        Editors: parseJsonArray(row.editors_json),
        Translators: parseJsonArray(row.translators_json),
        BookWidth: row.book_width,
        BookHeight: row.book_height
      }
    : null;
}

const parseJsonArray = (value) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    return String(value)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
};

const toJsonText = (value) => {
  if (value == null || value === '') return '';
  return Array.isArray(value) || typeof value === 'object' ? JSON.stringify(value) : String(value);
};

const pickFirst = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');

function toDbParams(book) {
  return {
    uid: book?._uid || book?.uid || book?.ISBN || book?.EAN || book?.Title,
    title: book?.Title || 'Untitled',
    fullTitle: pickFirst(book?.FullTitle, book?.['FULL TITLE'], book?.Title) || '',
    author: book?.Author || '',
    series: book?.Series || '',
    seriesId: book?.SeriesId || '',
    isbn: book?.ISBN || '',
    ean: book?.EAN || '',
    image: book?.Image || '',
    website: book?.Website || '',
    price: book?.Price || '',
    pagination: book?.PAGINATION || '',
    binding: book?.BINDING || '',
    alphaAuthor: book?.AlphaAuthor || '',
    alphaTitle: book?.AlphaTitle || '',
    spineTitle: book?.SpineTitle || '',
    pcversion: pickFirst(book?.PCversion, book?.PCVersion) || '',
    description: pickFirst(book?.Description, book?.DESCRIPTION) || '',
    goodreads: pickFirst(book?.GOODREADS, book?.GoodReads, book?.Goodreads) || '',
    publicationDate: pickFirst(book?.PublicationDate, book?.['PUB DATE']) || '',
    originalPublicationDate: pickFirst(book?.OriginalPublicationDate, book?.OriginalPublicationDate) || '',
    penguinId: pickFirst(book?.PenguinID, book?.PenguinId) || '',
    bicSubjects: pickFirst(book?.BICSubjects, book?.['BIC SUBJECTS']) || '',
    bicQualifiers: pickFirst(book?.BICQualifiers, book?.['BIC QUALIFIERS']) || '',
    subject: pickFirst(book?.Subject, book?.SUBJECT) || '',
    illustrations: pickFirst(book?.Illustrations, book?.ILLUSTRATIONS) || '',
    notes: pickFirst(book?.Notes, book?.['NOTES:']) || '',
    authorsJson: toJsonText(pickFirst(book?.Authors, book?.AUTHORS) || []),
    editorsJson: toJsonText(pickFirst(book?.Editors, book?.EDITORS) || []),
    translatorsJson: toJsonText(pickFirst(book?.Translators, book?.TRANSLATORS) || []),
    bookWidth: book?.BookWidth || '',
    bookHeight: book?.BookHeight || '',
    raw_json: JSON.stringify(book)
  };
}

function seedDatabaseFromJson() {
  if (!fs.existsSync(seedPath)) {
    return;
  }

  const books = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const transaction = db.transaction((rows) => {
    for (const book of rows) {
      upsertBook.run(toDbParams(book));
    }
  });

  transaction(Array.isArray(books) ? books : []);
}

if (!useSupabase) {
  seedDatabaseFromJson();
}

const knownSeriesRatios = { OWC: 7.6875 / 5.1875, BNC: 8 / 5.25, PC: 7.75 / 5, PCD: 8.35 / 5.67 };
const seedSqliteSeriesCatalog = () => {
  const books = db.prepare(`
    SELECT DISTINCT series_id AS id, COALESCE(NULLIF(series, ''), series_id) AS name
    FROM books
    WHERE COALESCE(series_id, '') <> ''
  `).all();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO series (id, name, height_width_ratio, spine_mode)
    VALUES (@id, @name, @ratio, @spineMode)
  `);
  const transaction = db.transaction((rows) => rows.forEach((row) => insert.run({
    ...row,
    ratio: knownSeriesRatios[row.id] || null,
    spineMode: row.id === 'PCD' ? 'pcd-crop' : 'automatic'
  })));
  transaction(books);
};

if (!useSupabase) seedSqliteSeriesCatalog();

const supabaseRequest = async (route, options = {}) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/${route}`, {
    ...options,
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  const responseText = await response.text();
  let responseBody = null;
  if (responseText) {
    try {
      responseBody = JSON.parse(responseText);
    } catch (_err) {
      responseBody = responseText;
    }
  }
  if (!response.ok) {
    const message = typeof responseBody === 'string' ? responseBody : responseBody?.message || responseBody?.hint;
    throw new Error(message || `Supabase request failed (${response.status}).`);
  }
  return responseBody;
};

const supabaseBookRoute = (filters = {}) => {
  const query = new URLSearchParams({ select: 'uid,book', ...filters });
  return `books?${query.toString()}`;
};

const supabaseRowToBook = (row) => ({ ...row.book, _uid: row.uid });
const isMissingSupabaseSeriesTable = (error) => {
  const message = String(error?.message || error || '');
  return /series/i.test(message) && /(schema cache|could not find|does not exist|PGRST205|42P01)/i.test(message);
};

const supabaseSeriesMigrationMessage = 'The Supabase series table is missing. Run backend/supabase_series_migration.sql in the Supabase SQL Editor, then retry.';
const supabaseWorkCatalogMigrationMessage = 'The Supabase work catalog tables are missing or outdated. Run backend/supabase_work_catalog_migration.sql in the Supabase SQL Editor, then retry.';
let supabaseAuthorsSeeded = false;

const ensureSupabaseAuthorCatalog = async () => {
  if (supabaseAuthorsSeeded) return;
  const authorSeedPath = process.env.AUTHOR_SEED_PATH || path.resolve(__dirname, '../public/AuthorList.json');
  let authors;
  try {
    authors = JSON.parse(fs.readFileSync(authorSeedPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (!Array.isArray(authors)) throw new Error('Author seed file must contain an array.');
  if (!authors.length) {
    supabaseAuthorsSeeded = true;
    return;
  }
  const rows = authors
    .filter((author) => author?.id && author?.canonicalName)
    .map((author) => ({
      id: stableAuthorId(author),
      name: String(author.canonicalName),
      sort_name: String(author.sortName || ''),
      wikipedia_page_title: null,
      wikipedia_url: null
    }));
  for (let offset = 0; offset < rows.length; offset += 500) {
    await supabaseRequest('authors?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(offset, offset + 500))
    });
  }
  supabaseAuthorsSeeded = true;
};

const loadSupabaseSeriesFromBooks = async () => {
  const values = new Map();
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({ select: 'uid,book', limit: '1000', offset: String(offset), order: 'uid.asc' });
    const books = await supabaseRequest(`books?${params.toString()}`);
    for (const row of books) {
      const id = String(row.book?.SeriesId || '').trim();
      if (!id || values.has(id)) continue;
      values.set(id, {
        id,
        name: String(row.book?.Series || id),
        heightWidthRatio: knownSeriesRatios[id] || null,
        thicknessMultiplier: 1,
        spineMode: id === 'PCD' ? 'pcd-crop' : 'automatic'
      });
    }
    if (books.length < 1000) break;
  }
  return [...values.values()].sort((left, right) => left.name.localeCompare(right.name));
};

const parsePageQuery = (query) => {
  const requestedPage = Number.parseInt(query.page, 10);
  const requestedPageSize = Number.parseInt(query.pageSize, 10);
  return {
    page: Number.isInteger(requestedPage) && requestedPage >= 0 ? requestedPage : 0,
    pageSize: Number.isInteger(requestedPageSize)
      ? Math.min(100, Math.max(1, requestedPageSize))
      : 80,
    search: String(query.q || '').trim().slice(0, 100),
    series: String(query.series || '').trim().slice(0, 100),
    sort: ['author-asc', 'author-desc', 'title-desc'].includes(query.sort)
      ? query.sort
      : 'title-asc'
  };
};

const sortColumns = {
  'title-asc': 'COALESCE(NULLIF(alpha_title, \'\'), title) COLLATE NOCASE ASC, title COLLATE NOCASE ASC',
  'title-desc': 'COALESCE(NULLIF(alpha_title, \'\'), title) COLLATE NOCASE DESC, title COLLATE NOCASE DESC',
  'author-asc': 'COALESCE(NULLIF(alpha_author, \'\'), author) COLLATE NOCASE ASC, COALESCE(NULLIF(alpha_title, \'\'), title) COLLATE NOCASE ASC',
  'author-desc': 'COALESCE(NULLIF(alpha_author, \'\'), author) COLLATE NOCASE DESC, COALESCE(NULLIF(alpha_title, \'\'), title) COLLATE NOCASE DESC'
};

if (allowedOrigins.length > 0) {
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin not allowed by CORS: ${origin}`));
      }
    })
  );
} else {
  app.use(cors());
}

app.use(express.json());

app.get('/api/image-proxy', createImageProxyHandler);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    storage: useSupabase ? 'supabase' : 'sqlite',
    dbPath: useSupabase ? undefined : dbPath,
    seeded: useSupabase ? undefined : fs.existsSync(seedPath)
  });
});

app.get('/api/books', async (req, res) => {
  const { page, pageSize, search, series, sort } = parsePageQuery(req.query);
  const offset = page * pageSize;

  if (useSupabase) {
    try {
      const result = await supabaseRequest('rpc/search_books', {
        method: 'POST',
        body: JSON.stringify({
          p_query: search,
          p_series: series,
          p_sort: sort,
          p_page: page,
          p_page_size: pageSize
        })
      });
      res.json(result);
    } catch (error) {
      console.error('Failed to load books from Supabase:', error);
      res.status(502).json({ error: 'Failed to load books from Supabase.' });
    }
    return;
  }

  const conditions = ["LOWER(COALESCE(binding, 'pbk')) = 'pbk'"];
  const parameters = [];
  if (series === 'Unknown') {
    conditions.push("(series_id IS NULL OR series_id = '')");
  } else if (series) {
    conditions.push('series_id = ?');
    parameters.push(series);
  }
  if (search) {
    conditions.push(`(
      instr(lower(COALESCE(title, '')), lower(?)) > 0 OR
      instr(lower(COALESCE(author, '')), lower(?)) > 0 OR
      instr(lower(COALESCE(alpha_author, '')), lower(?)) > 0
    )`);
    parameters.push(search, search, search);
  }
  const where = conditions.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) AS total FROM books WHERE ${where}`).get(...parameters).total;
  const rows = db.prepare(`
    SELECT *
    FROM books
    WHERE ${where}
    ORDER BY ${sortColumns[sort]}
    LIMIT ? OFFSET ?
  `).all(...parameters, pageSize, offset);

  res.json({ books: rows.map(rowToBook), total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) });
});

const normalizeSeriesInput = (input, id = '') => {
  const normalizedId = String(id || input?.id || '').trim();
  const name = String(input?.name || '').trim();
  const rawRatio = input?.heightWidthRatio;
  const heightWidthRatio = rawRatio === '' || rawRatio == null ? null : Number(rawRatio);
  const rawThicknessMultiplier = input?.thicknessMultiplier;
  const thicknessMultiplier = rawThicknessMultiplier === '' || rawThicknessMultiplier == null ? 1 : Number(rawThicknessMultiplier);
  const spineMode = input?.spineMode === 'pcd-crop' ? 'pcd-crop' : 'automatic';
  if (!normalizedId || !name
    || (heightWidthRatio != null && (!Number.isFinite(heightWidthRatio) || heightWidthRatio <= 0))
    || !Number.isFinite(thicknessMultiplier) || thicknessMultiplier <= 0) {
    return null;
  }
  return { id: normalizedId, name, heightWidthRatio, thicknessMultiplier, spineMode };
};

const seriesFromSqlite = (row) => ({
  id: row.id,
  name: row.name,
  heightWidthRatio: row.height_width_ratio,
  thicknessMultiplier: row.thickness_multiplier,
  spineMode: row.spine_mode
});

const ensureSupabaseSeriesCatalog = async () => {
  let rows = await supabaseRequest('series?select=id,name,height_width_ratio,thickness_multiplier,spine_mode&order=name.asc');
  if (rows.length) return rows;

  const values = new Map();
  for (let offset = 0; ; offset += 1000) {
    const params = new URLSearchParams({ select: 'uid,book', limit: '1000', offset: String(offset), order: 'uid.asc' });
    const books = await supabaseRequest(`books?${params.toString()}`);
    for (const row of books) {
      const id = String(row.book?.SeriesId || '').trim();
      if (!id || values.has(id)) continue;
      values.set(id, {
        id,
        name: String(row.book?.Series || id),
        height_width_ratio: knownSeriesRatios[id] || null,
        thickness_multiplier: 1,
        spine_mode: id === 'PCD' ? 'pcd-crop' : 'automatic'
      });
    }
    if (books.length < 1000) break;
  }
  if (values.size) {
    await supabaseRequest('series?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify([...values.values()])
    });
  }
  rows = await supabaseRequest('series?select=id,name,height_width_ratio,thickness_multiplier,spine_mode&order=name.asc');
  return rows;
};

const updateSupabaseBookSeries = async (id, series) => {
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams({ select: 'uid,book', 'book->>SeriesId': `eq.${id}`, limit: '1000', offset: String(offset), order: 'uid.asc' });
    const rows = await supabaseRequest(`books?${params.toString()}`);
    for (const row of rows) {
      await supabaseRequest(supabaseBookRoute({ uid: `eq.${row.uid}` }), {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ book: { ...row.book, ...series } })
      });
    }
    if (rows.length < 1000) break;
    offset = series.SeriesId === '' ? 0 : offset + 1000;
  }
};

app.get('/api/series', async (_req, res) => {
  if (useSupabase) {
    try {
      const rows = await ensureSupabaseSeriesCatalog();
      res.json(rows.map((row) => ({ id: row.id, name: row.name, heightWidthRatio: row.height_width_ratio, thicknessMultiplier: row.thickness_multiplier, spineMode: row.spine_mode })));
    } catch (error) {
      if (isMissingSupabaseSeriesTable(error)) {
        try {
          console.warn(supabaseSeriesMigrationMessage);
          res.json(await loadSupabaseSeriesFromBooks());
        } catch (fallbackError) {
          console.error('Failed to load series from books in Supabase:', fallbackError);
          res.status(502).json({ error: 'Failed to load series from Supabase.' });
        }
        return;
      }
      console.error('Failed to load series from Supabase:', error);
      res.status(502).json({ error: 'Failed to load series from Supabase.' });
    }
    return;
  }
  const rows = db.prepare('SELECT id, name, height_width_ratio, thickness_multiplier, spine_mode FROM series ORDER BY name COLLATE NOCASE').all();
  res.json(rows.map(seriesFromSqlite));
});

app.post('/api/series', async (req, res) => {
  const series = normalizeSeriesInput(req.body);
  if (!series) return res.status(400).json({ error: 'Series ID, name, and a positive height/width ratio are required when a ratio is provided.' });
  try {
    if (useSupabase) {
      const rows = await supabaseRequest('series', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ id: series.id, name: series.name, height_width_ratio: series.heightWidthRatio, thickness_multiplier: series.thicknessMultiplier, spine_mode: series.spineMode })
      });
      return res.status(201).json({ id: rows[0].id, name: rows[0].name, heightWidthRatio: rows[0].height_width_ratio, thicknessMultiplier: rows[0].thickness_multiplier, spineMode: rows[0].spine_mode });
    }
    db.prepare('INSERT INTO series (id, name, height_width_ratio, thickness_multiplier, spine_mode) VALUES (?, ?, ?, ?, ?)')
      .run(series.id, series.name, series.heightWidthRatio, series.thicknessMultiplier, series.spineMode);
    return res.status(201).json(series);
  } catch (error) {
    if (useSupabase && isMissingSupabaseSeriesTable(error)) {
      return res.status(503).json({ error: supabaseSeriesMigrationMessage });
    }
    const conflict = String(error?.message || '').includes('unique') || String(error?.message || '').includes('duplicate');
    return res.status(conflict ? 409 : 502).json({ error: conflict ? 'A series with this ID already exists.' : 'Failed to create series.' });
  }
});

app.put('/api/series/:id', async (req, res) => {
  const series = normalizeSeriesInput(req.body, req.params.id);
  if (!series) return res.status(400).json({ error: 'Series name and a positive height/width ratio are required when a ratio is provided.' });
  try {
    if (useSupabase) {
      const rows = await supabaseRequest(`series?id=eq.${encodeURIComponent(series.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ name: series.name, height_width_ratio: series.heightWidthRatio, thickness_multiplier: series.thicknessMultiplier, spine_mode: series.spineMode })
      });
      if (!rows.length) return res.status(404).json({ error: 'Series not found.' });
      await updateSupabaseBookSeries(series.id, { Series: series.name, SeriesId: series.id });
      return res.json({ id: rows[0].id, name: rows[0].name, heightWidthRatio: rows[0].height_width_ratio, thicknessMultiplier: rows[0].thickness_multiplier, spineMode: rows[0].spine_mode });
    }
    const result = db.prepare('UPDATE series SET name = ?, height_width_ratio = ?, thickness_multiplier = ?, spine_mode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(series.name, series.heightWidthRatio, series.thicknessMultiplier, series.spineMode, series.id);
    if (!result.changes) return res.status(404).json({ error: 'Series not found.' });
    db.prepare('UPDATE books SET series = ?, updated_at = CURRENT_TIMESTAMP WHERE series_id = ?').run(series.name, series.id);
    return res.json(series);
  } catch (error) {
    if (useSupabase && isMissingSupabaseSeriesTable(error)) {
      return res.status(503).json({ error: supabaseSeriesMigrationMessage });
    }
    console.error('Failed to update series:', error);
    return res.status(502).json({ error: 'Failed to update series.' });
  }
});

app.delete('/api/series/:id', async (req, res) => {
  const id = req.params.id;
  try {
    if (useSupabase) {
      const existing = await supabaseRequest(`series?id=eq.${encodeURIComponent(id)}&select=id`);
      if (!existing.length) return res.status(404).json({ error: 'Series not found.' });
      await updateSupabaseBookSeries(id, { Series: '', SeriesId: '' });
      await supabaseRequest(`series?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      return res.status(204).end();
    }
    const remove = db.transaction(() => {
      db.prepare("UPDATE books SET series = '', series_id = '', updated_at = CURRENT_TIMESTAMP WHERE series_id = ?").run(id);
      return db.prepare('DELETE FROM series WHERE id = ?').run(id).changes;
    });
    if (!remove()) return res.status(404).json({ error: 'Series not found.' });
    return res.status(204).end();
  } catch (error) {
    if (useSupabase && isMissingSupabaseSeriesTable(error)) {
      return res.status(503).json({ error: supabaseSeriesMigrationMessage });
    }
    console.error('Failed to delete series:', error);
    return res.status(502).json({ error: 'Failed to delete series.' });
  }
});

app.get('/api/catalog/authors', async (_req, res) => {
  try {
    if (useSupabase) {
      await ensureSupabaseAuthorCatalog();
      const authors = await supabaseRequest('authors?select=id,name,sort_name,wikipedia_page_title,wikipedia_url&order=sort_name.asc,name.asc');
      return res.json(authors.map((author) => ({
        id: author.id,
        name: author.name,
        sortName: author.sort_name,
        wikipediaPageTitle: author.wikipedia_page_title,
        wikipediaUrl: author.wikipedia_url
      })));
    }
    const authors = db.prepare(`
      SELECT authors.id, authors.name, authors.sort_name, authors.wikidata_qid,
        COUNT(DISTINCT author_works.work_id) AS work_count
      FROM authors
      LEFT JOIN author_works ON author_works.author_id = authors.id
      GROUP BY authors.id
      ORDER BY authors.sort_name COLLATE NOCASE, authors.name COLLATE NOCASE
    `).all();
    return res.json(authors.map((author) => ({
      id: author.id,
      name: author.name,
      sortName: author.sort_name,
      wikipediaPageTitle: author.wikipedia_page_title,
      wikipediaUrl: author.wikipedia_url,
      workCount: author.work_count
    })));
  } catch (error) {
    if (useSupabase && /authors/i.test(error.message)) {
      return res.status(503).json({ error: supabaseWorkCatalogMigrationMessage });
    }
    console.error('Failed to load catalog authors:', error);
    return res.status(502).json({ error: 'Failed to load catalog authors.' });
  }
});

app.put('/api/catalog/authors/:id/wikipedia', async (req, res) => {
  const pageTitle = String(req.body?.wikipediaPageTitle || '').trim();
  if (!pageTitle || pageTitle.length > 300) return res.status(400).json({ error: 'A Wikipedia page title is required.' });
  try {
    if (useSupabase) {
      const authors = await supabaseRequest(`authors?id=eq.${encodeURIComponent(req.params.id)}&select=id`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          wikipedia_page_title: pageTitle,
          wikipedia_url: `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
          updated_at: new Date().toISOString()
        })
      });
      if (!authors.length) return res.status(404).json({ error: 'Author not found.' });
      return res.json({ id: req.params.id, wikipediaPageTitle: pageTitle });
    }
    const result = db.prepare(`
      UPDATE authors SET wikipedia_page_title = ?, wikipedia_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(pageTitle, `https://en.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`, req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Author not found.' });
    return res.json({ id: req.params.id, wikipediaPageTitle: pageTitle });
  } catch (error) {
    if (/duplicate key|unique constraint|SQLITE_CONSTRAINT_UNIQUE/i.test(error.message)) {
      return res.status(409).json({ error: 'That Wikipedia page is already linked to another author.' });
    }
    if (/authors|wikipedia_page_title/i.test(error.message)) return res.status(503).json({ error: supabaseWorkCatalogMigrationMessage });
    console.error('Failed to link author to Wikipedia:', error);
    return res.status(502).json({ error: 'Failed to link author to Wikipedia.' });
  }
});

app.get('/api/catalog/wikipedia/search', async (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 120);
  if (!search) return res.status(400).json({ error: 'Search text is required.' });
  try {
    return res.json(await getWikipediaAuthorCandidates(search));
  } catch (error) {
    console.error('Failed to search Wikipedia authors:', error);
    return res.status(502).json({ error: 'Wikipedia search is temporarily unavailable.' });
  }
});

app.get('/api/catalog/wikipedia/authors/works', async (req, res) => {
  const pageTitle = String(req.query.pageTitle || '').trim();
  if (!pageTitle || pageTitle.length > 300) return res.status(400).json({ error: 'A valid Wikipedia page title is required.' });
  try {
    return res.json(await getWikipediaWorks(pageTitle));
  } catch (error) {
    console.error(`Failed to load Wikipedia works for ${pageTitle}:`, error);
    const detail = error instanceof Error ? error.message : String(error);
    return res.status(502).json({ error: `Wikipedia works could not be loaded: ${detail}` });
  }
});

app.get('/api/catalog/books', async (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 120);
  if (!search) return res.json([]);
  try {
    if (useSupabase) {
      const safeSearch = search.replace(/[,*()%]/g, ' ');
      const query = new URLSearchParams({
        select: 'uid,book',
        or: `(book->>Title.ilike.*${safeSearch}*,book->>Author.ilike.*${safeSearch}*,book->>ISBN.ilike.*${safeSearch}*,book->>EAN.ilike.*${safeSearch}*)`,
        order: 'uid.asc',
        limit: '100'
      });
      const rows = await supabaseRequest(`books?${query.toString()}`);
      return res.json(rows.map((row) => ({
        uid: row.uid,
        title: row.book?.Title || '',
        author: row.book?.Author || '',
        isbn: row.book?.ISBN || ''
      })));
    }
    const rows = db.prepare(`
      SELECT uid, title, author, isbn FROM books
      WHERE title LIKE ? OR author LIKE ? OR isbn LIKE ? OR ean LIKE ?
      ORDER BY title COLLATE NOCASE LIMIT 100
    `).all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    return res.json(rows.map((book) => ({ uid: book.uid, title: book.title, author: book.author, isbn: book.isbn })));
  } catch (error) {
    console.error('Failed to search book editions for work linking:', error);
    return res.status(502).json({ error: 'Failed to search book editions.' });
  }
});

app.get('/api/catalog/works', async (_req, res) => {
  try {
    if (useSupabase) {
      const rows = await supabaseRequest('works?select=id,wikidata_qid,source_type,source_id,title,release_date,date_precision,source_url,authors:author_works(author:authors(id,name)),books:book_works(book:books(uid,book))&order=title.asc');
      return res.json(rows.map((work) => ({
        id: work.id,
        wikidataQid: work.wikidata_qid,
        sourceType: work.source_type,
        sourceId: work.source_id,
        title: work.title,
        releaseDate: work.release_date,
        datePrecision: work.date_precision,
        sourceUrl: work.source_url,
        authors: (work.authors || []).map((entry) => entry.author).filter(Boolean),
        books: (work.books || []).map((entry) => ({
          uid: entry.book?.uid,
          title: entry.book?.book?.Title || '',
          isbn: entry.book?.book?.ISBN || ''
        })).filter((book) => book.uid)
      })));
    }
    const works = db.prepare('SELECT * FROM works ORDER BY title COLLATE NOCASE').all();
    const getAuthors = db.prepare(`
      SELECT authors.id, authors.name FROM authors
      JOIN author_works ON author_works.author_id = authors.id
      WHERE author_works.work_id = ? ORDER BY authors.sort_name COLLATE NOCASE
    `);
    const getBooks = db.prepare(`
      SELECT books.uid, books.title, books.isbn FROM books
      JOIN book_works ON book_works.book_uid = books.uid
      WHERE book_works.work_id = ? ORDER BY books.title COLLATE NOCASE
    `);
    return res.json(works.map((work) => ({
      id: work.id,
      wikidataQid: work.wikidata_qid,
      sourceType: work.source_type,
      sourceId: work.source_id,
      title: work.title,
      releaseDate: work.release_date,
      datePrecision: work.date_precision,
      sourceUrl: work.source_url,
      authors: getAuthors.all(work.id),
      books: getBooks.all(work.id)
    })));
  } catch (error) {
    if (useSupabase && /work|author_works|book_works/i.test(error.message)) {
      return res.status(503).json({ error: supabaseWorkCatalogMigrationMessage });
    }
    console.error('Failed to load Works:', error);
    return res.status(502).json({ error: 'Failed to load Works.' });
  }
});

app.post('/api/catalog/works', async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const sourceType = req.body?.sourceType === 'wikipedia' ? 'wikipedia' : 'wikidata';
  const sourceId = String(req.body?.sourceId || req.body?.wikidataQid || '').trim();
  const qid = String(req.body?.wikidataQid || '').trim();
  const authorIds = Array.isArray(req.body?.authorIds) ? [...new Set(req.body.authorIds.map(String))] : [];
  const bookUids = Array.isArray(req.body?.bookUids) ? [...new Set(req.body.bookUids.map(String))] : [];
  const releaseDate = req.body?.releaseDate == null ? null : String(req.body.releaseDate);
  const datePrecision = req.body?.datePrecision == null ? null : Number(req.body.datePrecision);
  if (!title || !sourceId || (sourceType === 'wikidata' && !/^Q\d+$/.test(qid)) || !authorIds.length) {
    return res.status(400).json({ error: 'A title, source ID, and at least one author are required.' });
  }
  if (!releaseDate || !Number.isInteger(datePrecision) || datePrecision < 6 || datePrecision > 11) {
    return res.status(400).json({ error: 'The release year must include valid source precision between 6 and 11.' });
  }
  if (sourceType === 'wikidata' && !/^[+-]\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(releaseDate)) {
    return res.status(400).json({ error: 'Release dates must use the Wikidata time format.' });
  }
  if (sourceType === 'wikipedia' && !/^-?\d{1,6}$/.test(releaseDate)) {
    return res.status(400).json({ error: 'Wikipedia release dates must be a year.' });
  }
  try {
    if (useSupabase) {
      const work = await supabaseRequest('rpc/create_reviewed_work', {
        method: 'POST',
        body: JSON.stringify({
          p_work: {
            wikidataQid: qid,
            sourceType,
            sourceId,
            title,
            releaseDate,
            datePrecision,
            sourceUrl: req.body?.sourceUrl,
            sourceStatement: req.body?.sourceStatement
          },
          p_author_ids: authorIds,
          p_book_uids: bookUids
        })
      });
      return res.status(201).json({
        id: work.id,
        wikidataQid: work.wikidata_qid,
        sourceType: work.source_type,
        sourceId: work.source_id,
        title: work.title,
        releaseDate: work.release_date,
        datePrecision: work.date_precision,
        sourceUrl: work.source_url
      });
    }
    const existing = db.prepare('SELECT id FROM works WHERE source_type = ? AND source_id = ?').get(sourceType, sourceId);
    const id = createWorkRecord(db, {
      ...req.body,
      title,
      wikidataQid: qid,
      sourceType,
      sourceId,
      authorIds,
      bookUids,
      releaseDate,
      datePrecision
    });
    const work = db.prepare('SELECT * FROM works WHERE id = ?').get(id);
    return res.status(existing ? 200 : 201).json({
      id: work.id,
      wikidataQid: work.wikidata_qid,
      sourceType: work.source_type,
      sourceId: work.source_id,
      title: work.title,
      releaseDate: work.release_date,
      datePrecision: work.date_precision,
      sourceUrl: work.source_url
    });
  } catch (error) {
    if (/work|author_works|book_works/i.test(error.message) && useSupabase) {
      return res.status(503).json({ error: supabaseWorkCatalogMigrationMessage });
    }
    if (/duplicate key|unique constraint|SQLITE_CONSTRAINT_UNIQUE/i.test(error.message)) {
      return res.status(409).json({ error: 'This source Work has already been imported.' });
    }
    console.error('Failed to save reviewed Work:', error);
    return res.status(400).json({ error: error.message || 'Failed to save reviewed Work.' });
  }
});

app.post('/api/catalog/works/:id/relationships', async (req, res) => {
  const authorIds = Array.isArray(req.body?.authorIds) ? [...new Set(req.body.authorIds.map(String))] : [];
  const bookUids = Array.isArray(req.body?.bookUids) ? [...new Set(req.body.bookUids.map(String))] : [];
  if (!authorIds.length && !bookUids.length) {
    return res.status(400).json({ error: 'At least one author or book edition is required.' });
  }
  try {
    if (useSupabase) {
      await supabaseRequest('rpc/add_work_relationships', {
        method: 'POST',
        body: JSON.stringify({
          p_work_id: req.params.id,
          p_author_ids: authorIds,
          p_book_uids: bookUids
        })
      });
      return res.status(204).end();
    }
    addWorkRelationships(db, req.params.id, { authorIds, bookUids });
    return res.status(204).end();
  } catch (error) {
    if (useSupabase && /work|author_works|book_works/i.test(error.message)) {
      return res.status(503).json({ error: supabaseWorkCatalogMigrationMessage });
    }
    if (/not found/i.test(error.message)) return res.status(404).json({ error: error.message });
    console.error('Failed to link authors or editions to a Work:', error);
    return res.status(400).json({ error: error.message || 'Unable to link the selected records.' });
  }
});

app.delete('/api/catalog/works/:id', async (req, res) => {
  try {
    if (useSupabase) {
      const rows = await supabaseRequest(`works?id=eq.${encodeURIComponent(req.params.id)}&select=id`);
      if (!rows.length) return res.status(404).json({ error: 'Work not found.' });
      await supabaseRequest(`works?id=eq.${encodeURIComponent(req.params.id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      return res.status(204).end();
    }
    const result = db.prepare('DELETE FROM works WHERE id = ?').run(req.params.id);
    if (!result.changes) return res.status(404).json({ error: 'Work not found.' });
    return res.status(204).end();
  } catch (error) {
    if (useSupabase && /works|author_works|book_works/i.test(error.message)) {
      return res.status(503).json({ error: supabaseWorkCatalogMigrationMessage });
    }
    console.error('Failed to delete Work:', error);
    return res.status(502).json({ error: 'Failed to delete Work.' });
  }
});

app.get('/api/books/spine-crop', async (_req, res) => {
  if (useSupabase) {
    try {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await supabaseRequest(
          supabaseBookRoute({ order: 'uid.asc', limit: '1000', offset: String(offset) })
        );
        rows.push(...page);
        if (page.length < 1000) break;
      }
      res.json(rows.map(supabaseRowToBook));
    } catch (error) {
      console.error('Failed to load spine crop books from Supabase:', error);
      res.status(502).json({ error: 'Failed to load spine crop books from Supabase.' });
    }
    return;
  }

  const rows = db.prepare('SELECT * FROM books ORDER BY title COLLATE NOCASE ASC').all();
  res.json(rows.map(rowToBook));
});

app.get('/api/books/not-displayed', async (_req, res) => {
  if (useSupabase) {
    try {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await supabaseRequest(
          supabaseBookRoute({ order: 'uid.asc', limit: '1000', offset: String(offset) })
        );
        rows.push(...page);
        if (page.length < 1000) break;
      }
      res.json(rows
        .map(supabaseRowToBook)
        .filter((book) => String(book.BINDING || 'pbk').trim().toLowerCase() !== 'pbk'));
    } catch (error) {
      console.error('Failed to load undisplayed books from Supabase:', error);
      res.status(502).json({ error: 'Failed to load undisplayed books from Supabase.' });
    }
    return;
  }

  const rows = db.prepare(`
    SELECT *
    FROM books
    WHERE LOWER(TRIM(COALESCE(binding, 'pbk'))) <> 'pbk'
    ORDER BY title COLLATE NOCASE ASC
  `).all();
  res.json(rows.map(rowToBook));
});

app.delete('/api/books/:uid', async (req, res) => {
  const uid = req.params.uid;

  if (useSupabase) {
    try {
      const deletedRows = await supabaseRequest(
        supabaseBookRoute({ uid: `eq.${uid}` }),
        {
          method: 'DELETE',
          headers: { Prefer: 'return=representation' }
        }
      );
      if (!deletedRows.length) {
        res.status(404).json({ error: 'Book not found' });
        return;
      }
      res.status(204).end();
    } catch (error) {
      console.error(`Failed to delete book ${uid} from Supabase:`, error);
      res.status(502).json({ error: 'Failed to delete book from Supabase.' });
    }
    return;
  }

  const deleted = db.prepare('DELETE FROM books WHERE uid = ?').run(uid);
  if (!deleted.changes) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }
  res.status(204).end();
});

app.put('/api/books/:uid', async (req, res) => {
  const uid = req.params.uid;

  if (useSupabase) {
    try {
      const existingRows = await supabaseRequest(
        supabaseBookRoute({ uid: `eq.${uid}`, limit: '1' })
      );
      if (!existingRows.length) {
        res.status(404).json({ error: 'Book not found' });
        return;
      }

      const nextBook = { ...existingRows[0].book, ...req.body, _uid: uid };
      const updatedRows = await supabaseRequest(
        supabaseBookRoute({ uid: `eq.${uid}` }),
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ book: nextBook })
        }
      );
      res.json(supabaseRowToBook(updatedRows[0]));
    } catch (error) {
      console.error(`Failed to update book ${uid} in Supabase:`, error);
      res.status(502).json({ error: 'Failed to save book to Supabase.' });
    }
    return;
  }

  const existing = getBookByUid.get(uid);

  if (!existing) {
    res.status(404).json({ error: 'Book not found' });
    return;
  }

  const existingBook = JSON.parse(existing.raw_json);
  const nextBook = { ...existingBook, ...req.body, _uid: uid };
  const params = toDbParams(nextBook);

  updateBook.run(params);

  res.json(rowToBook(getBookByUid.get(uid)));
});

app.post('/api/books', async (req, res) => {
  const nextBook = {
    ...req.body,
    _uid:
      req.body?._uid ||
      req.body?.uid ||
      req.body?.ISBN ||
      req.body?.EAN ||
      `book-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  };

  if (useSupabase) {
    const uid = String(nextBook._uid);
    const book = { ...nextBook, _uid: uid };
    try {
      const rows = await supabaseRequest(supabaseBookRoute(), {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ uid, book })
      });
      res.status(201).json(supabaseRowToBook(rows[0]));
    } catch (error) {
      console.error('Failed to add book to Supabase:', error);
      res.status(502).json({ error: 'Failed to add book to Supabase.' });
    }
    return;
  }

  const params = toDbParams(nextBook);

  upsertBook.run(params);

  res.status(201).json(rowToBook(getBookByUid.get(params.uid)));
});

app.listen(port, () => {
  console.log(`SQLite API listening on http://localhost:${port}`);
  console.log(`Database path: ${dbPath}`);
  if (!fs.existsSync(seedPath)) {
    console.log(`Seed file not found at ${seedPath}; startup continues without seeding.`);
  }
});
