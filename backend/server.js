const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

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

const supabaseRequest = async (route, options = {}) => {
  const { includeMeta = false, ...requestOptions } = options;
  const response = await fetch(`${supabaseUrl}/rest/v1/${route}`, {
    ...requestOptions,
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json',
      ...requestOptions.headers
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
  return includeMeta
    ? { data: responseBody, contentRange: response.headers.get('content-range') }
    : responseBody;
};

const supabaseBookRoute = (filters = {}) => {
  const query = new URLSearchParams({ select: 'uid,book', ...filters });
  return `books?${query.toString()}`;
};

const supabaseRowToBook = (row) => ({ ...row.book, _uid: row.uid });

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

const escapePostgrestValue = (value) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const buildSupabaseBookFilters = ({ search, series }) => {
  const filters = {
    'book->>BINDING': 'eq.pbk',
    'book->>Image': 'neq.'
  };
  const logicalFilters = [];
  if (series === 'Unknown') {
    logicalFilters.push('or(book->>SeriesId.is.null,book->>SeriesId.eq.)');
  } else if (series) {
    filters['book->>SeriesId'] = `eq.${escapePostgrestValue(series)}`;
  }
  if (search) {
    const term = `*${escapePostgrestValue(search)}*`;
    logicalFilters.push(`or(book->>Title.ilike.${term},book->>Author.ilike.${term},book->>AlphaAuthor.ilike.${term})`);
  }
  if (logicalFilters.length === 1) {
    filters.or = `(${logicalFilters[0].slice(3, -1)})`;
  } else if (logicalFilters.length > 1) {
    filters.and = `(${logicalFilters.join(',')})`;
  }
  return filters;
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
      const order = {
        'title-asc': 'book->>AlphaTitle.asc.nullslast,book->>Title.asc.nullslast',
        'title-desc': 'book->>AlphaTitle.desc.nullslast,book->>Title.desc.nullslast',
        'author-asc': 'book->>AlphaAuthor.asc.nullslast,book->>Author.asc.nullslast,book->>AlphaTitle.asc.nullslast',
        'author-desc': 'book->>AlphaAuthor.desc.nullslast,book->>Author.desc.nullslast,book->>AlphaTitle.desc.nullslast'
      }[sort];
      const filters = buildSupabaseBookFilters({ search, series });
      const { data, contentRange } = await supabaseRequest(
        supabaseBookRoute({
          ...filters,
          order,
          limit: String(pageSize),
          offset: String(offset)
        }),
        { includeMeta: true, headers: { Prefer: 'count=exact' } }
      );
      const total = Number.parseInt(contentRange?.split('/')[1], 10) || 0;
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      res.json({ books: data.map(supabaseRowToBook), total, page, pageSize, pageCount });
    } catch (error) {
      console.error('Failed to load books from Supabase:', error);
      res.status(502).json({ error: 'Failed to load books from Supabase.' });
    }
    return;
  }

  const conditions = ["binding = 'pbk'", "image IS NOT NULL", "image <> ''"];
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

app.get('/api/series', async (_req, res) => {
  if (useSupabase) {
    try {
      const values = new Map();
      for (let offset = 0; ; offset += 1000) {
        const params = new URLSearchParams({
          select: 'series_id:book->>SeriesId,series:book->>Series',
          limit: '1000',
          offset: String(offset),
          order: 'uid.asc'
        });
        const rows = await supabaseRequest(
          `books?${params.toString()}`
        );
        for (const row of rows) {
          const id = row.series_id || 'Unknown';
          const name = row.series || id;
          values.set(id, name);
        }
        if (rows.length < 1000) break;
      }
      res.json([...values].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      console.error('Failed to load series from Supabase:', error);
      res.status(502).json({ error: 'Failed to load series from Supabase.' });
    }
    return;
  }

  const rows = db.prepare(`
    SELECT DISTINCT
      COALESCE(NULLIF(series_id, ''), 'Unknown') AS id,
      COALESCE(NULLIF(series, ''), NULLIF(series_id, ''), 'Unknown') AS name
    FROM books
    ORDER BY name COLLATE NOCASE
  `).all();
  res.json(rows);
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
