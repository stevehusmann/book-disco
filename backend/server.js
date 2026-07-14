const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const port = process.env.PORT || 4000;
const dbPath = path.resolve(process.env.DB_PATH || path.join(__dirname, 'data', 'books.db'));
const seedPath = path.resolve(process.env.SEED_PATH || path.join(__dirname, 'BookList.json'));
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

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

seedDatabaseFromJson();

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
  res.json({ ok: true, dbPath, seeded: fs.existsSync(seedPath) });
});

app.get('/api/books', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT *
      FROM books
      ORDER BY title COLLATE NOCASE ASC
    `)
    .all();

  res.json(rows.map(rowToBook));
});

app.put('/api/books/:uid', (req, res) => {
  const uid = req.params.uid;
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

app.post('/api/books', (req, res) => {
  const nextBook = {
    ...req.body,
    _uid:
      req.body?._uid ||
      req.body?.uid ||
      req.body?.ISBN ||
      req.body?.EAN ||
      `book-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  };
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
