const crypto = require('crypto');
const fs = require('fs');

const initializeWorkCatalog = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_name TEXT NOT NULL DEFAULT '',
      wikidata_qid TEXT UNIQUE,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      wikidata_qid TEXT UNIQUE,
      title TEXT NOT NULL,
      release_date TEXT NOT NULL,
      date_precision INTEGER NOT NULL CHECK (date_precision BETWEEN 6 AND 11),
      source_url TEXT,
      source_statement TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (date_precision IS NULL OR date_precision BETWEEN 6 AND 11)
    );

    CREATE TABLE IF NOT EXISTS author_works (
      author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
      work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      PRIMARY KEY (author_id, work_id)
    );

    CREATE TABLE IF NOT EXISTS book_works (
      book_uid TEXT NOT NULL REFERENCES books(uid) ON DELETE CASCADE,
      work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      PRIMARY KEY (book_uid, work_id)
    );

    CREATE INDEX IF NOT EXISTS author_works_work_idx ON author_works(work_id);
    CREATE INDEX IF NOT EXISTS book_works_work_idx ON book_works(work_id);
  `);
};

const stableAuthorId = (author) => {
  const identity = String(author?.normalizedName || author?.canonicalName || author?.id || '').trim().toLowerCase();
  if (!identity) return '';
  return `author-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 20)}`;
};

const seedAuthorsFromList = (db, authorListPath) => {
  let authors;
  try {
    authors = fs.readFileSync(authorListPath, 'utf8');
    authors = JSON.parse(authors);
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
  if (!Array.isArray(authors)) throw new Error('Author seed file must contain an array.');
  const insertAuthor = db.prepare(`
    INSERT OR IGNORE INTO authors (id, name, sort_name, wikidata_qid)
    VALUES (@id, @name, @sortName, @wikidataQid)
  `);
  const insertAuthors = db.transaction((rows) => rows.reduce((count, author) => {
    const id = stableAuthorId(author);
    const name = String(author?.canonicalName || '').trim();
    if (!id || !name) return count;
    const wikidataQid = String(author?.wikidataQid || '').trim();
    const result = insertAuthor.run({
      id,
      name,
      sortName: String(author?.sortName || ''),
      wikidataQid: /^Q\d+$/.test(wikidataQid) ? wikidataQid : null
    });
    return count + result.changes;
  }, 0));
  return insertAuthors(authors);
};

const getWikidataEntityCandidates = async (search) => {
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'wbsearchentities',
    search,
    language: 'en',
    format: 'json',
    type: 'item',
    limit: '10'
  }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MyBookshelf/1.0 (author-work catalog)' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Wikidata entity search failed (${response.status}).`);
  const payload = await response.json();
  return (payload.search || []).map((result) => ({
    qid: result.id,
    label: result.label || '',
    description: result.description || '',
    url: result.concepturi || `https://www.wikidata.org/wiki/${result.id}`
  }));
};

const getWikidataWorks = async (qid) => {
  const query = `
    SELECT ?work ?workLabel ?date ?precision WHERE {
      ?work wdt:P50 wd:${qid}.
      OPTIONAL {
        ?work p:P577 ?dateStatement.
        ?dateStatement ps:P577 ?date; psv:P577 ?dateValue.
        ?dateValue wikibase:timePrecision ?precision.
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 10000
  `;
  const url = new URL('https://query.wikidata.org/sparql');
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  const response = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      'User-Agent': 'MyBookshelf/1.0 (author-work catalog)'
    },
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) throw new Error(`Wikidata work query failed (${response.status}).`);
  const payload = await response.json();
  const byQid = new Map();
  for (const row of payload.results?.bindings || []) {
    const workUrl = row.work?.value || '';
    const workQid = workUrl.split('/').pop();
    if (!/^Q\d+$/.test(workQid)) continue;
    const candidate = byQid.get(workQid) || {
      qid: workQid,
      title: row.workLabel?.value || '',
      publicationDates: [],
      sourceUrl: `https://www.wikidata.org/wiki/${workQid}`,
      sourceStatement: 'P577'
    };
    const datePrecision = Number(row.precision?.value);
    if (row.date?.value && Number.isInteger(datePrecision) && datePrecision >= 6 && datePrecision <= 11) {
      const publicationDate = { value: row.date.value, precision: datePrecision };
      if (!candidate.publicationDates.some((entry) => entry.value === publicationDate.value
        && entry.precision === publicationDate.precision)) {
        candidate.publicationDates.push(publicationDate);
      }
    }
    byQid.set(workQid, candidate);
  }
  return [...byQid.values()]
    .map((candidate) => ({
      ...candidate,
      publicationDates: candidate.publicationDates.sort((left, right) => left.value.localeCompare(right.value))
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
};

const insertWorkRelationships = (db, workId, authorIds, bookUids) => {
  const authorLookup = db.prepare('SELECT id FROM authors WHERE id = ?');
  const bookLookup = db.prepare('SELECT uid FROM books WHERE uid = ?');
  if (authorIds.some((authorId) => !authorLookup.get(authorId))) {
    throw new Error('One or more authors were not found.');
  }
  if (bookUids.some((uid) => !bookLookup.get(uid))) {
    throw new Error('One or more book editions were not found.');
  }
  const addAuthor = db.prepare('INSERT OR IGNORE INTO author_works (author_id, work_id) VALUES (?, ?)');
  const addBook = db.prepare('INSERT OR IGNORE INTO book_works (book_uid, work_id) VALUES (?, ?)');
  authorIds.forEach((authorId) => addAuthor.run(authorId, workId));
  bookUids.forEach((uid) => addBook.run(uid, workId));
};

const addWorkRelationships = (db, workId, input = {}) => {
  const authorIds = Array.isArray(input.authorIds)
    ? [...new Set(input.authorIds.map((value) => String(value).trim()).filter(Boolean))]
    : [];
  const bookUids = Array.isArray(input.bookUids)
    ? [...new Set(input.bookUids.map((value) => String(value).trim()).filter(Boolean))]
    : [];
  if (!authorIds.length && !bookUids.length) throw new Error('At least one author or book edition is required.');
  const link = db.transaction(() => {
    if (!db.prepare('SELECT id FROM works WHERE id = ?').get(workId)) throw new Error('Work not found.');
    insertWorkRelationships(db, workId, authorIds, bookUids);
  });
  link();
};

const createWorkRecord = (db, input) => {
  const title = String(input?.title || '').trim();
  const qid = String(input?.wikidataQid || '').trim();
  const releaseDate = input?.releaseDate == null ? '' : String(input.releaseDate);
  const datePrecision = input?.datePrecision == null ? NaN : Number(input.datePrecision);
  const sourceUrl = input?.sourceUrl == null ? null : String(input.sourceUrl);
  const authorIds = Array.isArray(input?.authorIds)
    ? [...new Set(input.authorIds.map((value) => String(value).trim()).filter(Boolean))]
    : [];
  const bookUids = Array.isArray(input?.bookUids)
    ? [...new Set(input.bookUids.map((value) => String(value).trim()).filter(Boolean))]
    : [];

  if (!title || !/^Q\d+$/.test(qid) || !authorIds.length) {
    throw new Error('A title, Wikidata work ID, and at least one author are required.');
  }
  if (!releaseDate || !Number.isInteger(datePrecision)) {
    throw new Error('A release date and its precision are required.');
  }
  if (!/^[+-]\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(releaseDate)) {
    throw new Error('Release dates must use the Wikidata time format.');
  }
  if (datePrecision != null && (!Number.isInteger(datePrecision) || datePrecision < 6 || datePrecision > 11)) {
    throw new Error('Wikidata date precision must be between 6 and 11.');
  }

  const id = crypto.randomUUID();
  const insert = db.transaction(() => {
    const existing = db.prepare('SELECT id, release_date, date_precision FROM works WHERE wikidata_qid = ?').get(qid);
    let workId = id;
    if (existing) {
      if (existing.release_date !== releaseDate || existing.date_precision !== datePrecision) {
        throw new Error('This Work already exists with a different reviewed release date. Review the existing Work before changing its date.');
      }
      workId = existing.id;
    } else {
      db.prepare(`
        INSERT INTO works (id, wikidata_qid, title, release_date, date_precision, source_url, source_statement)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, qid, title, releaseDate, datePrecision, sourceUrl, 'P577');
    }
    insertWorkRelationships(db, workId, authorIds, bookUids);
    return workId;
  });
  return insert();
};

module.exports = {
  createWorkRecord,
  getWikidataEntityCandidates,
  getWikidataWorks,
  initializeWorkCatalog,
  seedAuthorsFromList,
  stableAuthorId,
  addWorkRelationships
};
