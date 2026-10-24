const crypto = require('crypto');
const fs = require('fs');

const initializeWorkCatalog = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_name TEXT NOT NULL DEFAULT '',
      wikidata_qid TEXT UNIQUE,
      wikipedia_page_title TEXT,
      wikipedia_url TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      wikidata_qid TEXT UNIQUE,
      title TEXT NOT NULL,
      release_date TEXT NOT NULL,
      date_precision INTEGER NOT NULL CHECK (date_precision BETWEEN 6 AND 11),
      source_url TEXT,
      source_type TEXT NOT NULL DEFAULT 'wikidata',
      source_id TEXT,
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
  const authorColumns = db.prepare('PRAGMA table_info(authors)').all().map((column) => column.name);
  if (!authorColumns.includes('wikidata_qid')) db.exec('ALTER TABLE authors ADD COLUMN wikidata_qid TEXT');
  if (!authorColumns.includes('wikipedia_page_title')) {
    db.exec('ALTER TABLE authors ADD COLUMN wikipedia_page_title TEXT');
  }
  if (!authorColumns.includes('wikipedia_url')) {
    db.exec('ALTER TABLE authors ADD COLUMN wikipedia_url TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS authors_wikipedia_page_title_idx ON authors(wikipedia_page_title) WHERE wikipedia_page_title IS NOT NULL');
  const workColumns = db.prepare('PRAGMA table_info(works)').all().map((column) => column.name);
  if (!workColumns.includes('source_type')) {
    db.exec("ALTER TABLE works ADD COLUMN source_type TEXT NOT NULL DEFAULT 'wikidata'");
  }
  if (!workColumns.includes('source_id')) {
    db.exec('ALTER TABLE works ADD COLUMN source_id TEXT');
  }
  db.exec("UPDATE works SET source_id = wikidata_qid WHERE source_id IS NULL AND wikidata_qid IS NOT NULL");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS works_source_id_idx ON works(source_type, source_id)');
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

const getWikipediaAuthorCandidates = async (search) => {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'opensearch',
    search,
    limit: '10',
    namespace: '0',
    format: 'json'
  }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MyBookshelf/1.0 (author-work catalog)' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Wikipedia author search failed (${response.status}).`);
  const result = await response.json();
  return (result[1] || []).map((title, index) => ({
    pageTitle: title,
    description: result[2]?.[index] || '',
    url: result[3]?.[index] || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
  }));
};

const extractYear = (text) => {
  const match = String(text || '').match(/(?:\b(?:c(?:irca)?\.?\s*)?)(1\d{3}|20\d{2}|2100)\b/i);
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1 || year > 9999) return null;
  return { value: String(year), precision: 9 };
};

const getWikipediaWorks = async (pageTitle) => {
  const sectionsUrl = new URL('https://en.wikipedia.org/w/api.php');
  sectionsUrl.search = new URLSearchParams({
    action: 'parse',
    page: pageTitle,
    prop: 'sections',
    format: 'json'
  }).toString();
  const sectionsResponse = await fetch(sectionsUrl, {
    headers: { 'User-Agent': 'MyBookshelf/1.0 (author-work catalog)' },
    signal: AbortSignal.timeout(20000)
  });
  if (!sectionsResponse.ok) throw new Error(`Wikipedia author page lookup failed (${sectionsResponse.status}).`);
  const page = await sectionsResponse.json();
  if (page.error) throw new Error(page.error.info || 'Wikipedia author page was not found.');

  const bibliographyHeading = /\b(works|bibliography|publications|novels|poetry|plays|short stories|fiction|writings|selected books|books by)\b/i;
  const sections = (page.parse?.sections || []).filter((section) => bibliographyHeading.test(section.line || ''));
  const candidates = new Map();
  const cheerio = require('cheerio');

  for (const section of sections) {
    const sectionUrl = new URL('https://en.wikipedia.org/w/api.php');
    sectionUrl.search = new URLSearchParams({
      action: 'parse',
      page: pageTitle,
      section: String(section.index),
      prop: 'text',
      format: 'json'
    }).toString();
    const response = await fetch(sectionUrl, {
      headers: { 'User-Agent': 'MyBookshelf/1.0 (author-work catalog)' },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Wikipedia bibliography lookup failed (${response.status}).`);
    const content = await response.json();
    if (content.error) continue;
    const $ = cheerio.load(content.parse?.text?.['*'] || '');
    const entries = [];
    $('li, tr').each((_index, element) => {
      const row = $(element);
      if (row.parents('li, tr').length) return;
      const text = row.text().replace(/\s+/g, ' ').trim();
      const link = row.find('a[href^="/wiki/"]').filter((_i, anchor) => !String($(anchor).attr('href')).includes(':')).first();
      const linkedTitle = String(link.attr('title') || link.text()).trim();
      const title = linkedTitle || text
        .replace(/\s*\([^)]*\d{4}[^)]*\)/g, '')
        .replace(/\s*[-–—]\s*\d{4}\b.*$/, '')
        .trim();
      if (!title || title.length > 300 || title.length < 2 || /^(edit|citation needed)$/i.test(title)) return;
      const year = extractYear(text);
      const linkedPath = String(link.attr('href') || '');
      const sourceId = linkedPath
        ? `https://en.wikipedia.org${linkedPath}`
        : `${page.parse?.title || pageTitle}#${section.index}:${title.toLowerCase()}`;
      entries.push({
        sourceId,
        title: title.replace(/_/g, ' '),
        date: year,
        sourceUrl: linkedPath
          ? `https://en.wikipedia.org${linkedPath}`
          : `https://en.wikipedia.org/wiki/${encodeURIComponent((page.parse?.title || pageTitle).replace(/ /g, '_'))}`,
        sourceStatement: section.line || 'Wikipedia bibliography'
      });
    });
    entries.forEach((entry) => {
      const previous = candidates.get(entry.sourceId);
      if (!previous || (!previous.date && entry.date)) candidates.set(entry.sourceId, entry);
    });
  }
  return [...candidates.values()].sort((left, right) => left.title.localeCompare(right.title));
};

const getWikipediaPageSummary = async (pageTitle) => {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    prop: 'extracts|pageimages',
    exintro: '1',
    explaintext: '1',
    pithumbsize: '640',
    titles: pageTitle,
    format: 'json'
  }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MyBookshelf/1.0 (author-work catalog)' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`Wikipedia summary lookup failed (${response.status}).`);
  const result = await response.json();
  if (result.error) throw new Error(result.error.info || 'Wikipedia summary lookup failed.');
  const page = Object.values(result.query?.pages || {})[0];
  if (!page || page.missing !== undefined) throw new Error('Wikipedia page was not found.');
  return {
    pageTitle: page.title,
    extract: page.extract || '',
    thumbnail: page.thumbnail?.source || '',
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`
  };
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
  const sourceType = input?.sourceType === 'wikipedia' ? 'wikipedia' : 'wikidata';
  const qid = String(input?.wikidataQid || '').trim();
  const sourceId = String(input?.sourceId || qid).trim();
  const releaseDate = input?.releaseDate == null ? '' : String(input.releaseDate).trim();
  const datePrecision = input?.datePrecision == null ? NaN : Number(input.datePrecision);
  const sourceUrl = input?.sourceUrl == null ? null : String(input.sourceUrl);
  const authorIds = Array.isArray(input?.authorIds)
    ? [...new Set(input.authorIds.map((value) => String(value).trim()).filter(Boolean))]
    : [];
  const bookUids = Array.isArray(input?.bookUids)
    ? [...new Set(input.bookUids.map((value) => String(value).trim()).filter(Boolean))]
    : [];

  if (!title || !sourceId || (sourceType === 'wikidata' && !/^Q\d+$/.test(qid)) || !authorIds.length) {
    throw new Error('A title, source ID, and at least one author are required.');
  }
  if (!releaseDate || !Number.isInteger(datePrecision)) {
    throw new Error('A release date and its precision are required.');
  }
  if (sourceType === 'wikidata' && !/^[+-]\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(releaseDate)) {
    throw new Error('Release dates must use the Wikidata time format.');
  }
  if (sourceType === 'wikipedia' && !/^-?\d{1,6}$/.test(releaseDate)) {
    throw new Error('Wikipedia release dates must be a year.');
  }
  if (datePrecision != null && (!Number.isInteger(datePrecision) || datePrecision < 6 || datePrecision > 11)) {
    throw new Error('Wikidata date precision must be between 6 and 11.');
  }

  const id = crypto.randomUUID();
  const insert = db.transaction(() => {
    const existing = db.prepare('SELECT id, release_date, date_precision FROM works WHERE source_type = ? AND source_id = ?').get(sourceType, sourceId);
    let workId = id;
    if (existing) {
      if (existing.release_date !== releaseDate || existing.date_precision !== datePrecision) {
        throw new Error('This Work already exists with a different reviewed release date. Review the existing Work before changing its date.');
      }
      workId = existing.id;
    } else {
      db.prepare(`
        INSERT INTO works (id, wikidata_qid, title, release_date, date_precision, source_url, source_type, source_id, source_statement)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, sourceType === 'wikidata' ? qid : null, title, releaseDate, datePrecision, sourceUrl, sourceType, sourceId, input?.sourceStatement || null);
    }
    insertWorkRelationships(db, workId, authorIds, bookUids);
    return workId;
  });
  return insert();
};

module.exports = {
  createWorkRecord,
  getWikipediaAuthorCandidates,
  getWikipediaPageSummary,
  getWikipediaWorks,
  initializeWorkCatalog,
  seedAuthorsFromList,
  stableAuthorId,
  addWorkRelationships
};
