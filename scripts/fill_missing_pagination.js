const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = process.cwd();
const BOOK_LIST_PATH = path.resolve(ROOT, 'public', 'BookList.json');
const REPORT_PATH = path.resolve(ROOT, 'public', 'pagination_enrichment_report.json');

const args = process.argv.slice(2);
const hasAll = args.includes('--all');
const hasApply = args.includes('--apply');
const limitArg = args.find((a) => a.startsWith('--limit='));
const parsedLimit = limitArg ? Number(limitArg.split('=')[1]) : 50;
const SAMPLE_LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 50;

const CONCURRENCY = 6;
const REQUEST_TIMEOUT_MS = 12000;

const normalizeIsbn = (value) => String(value || '').replace(/[^0-9Xx]/g, '').toUpperCase();

const isMissingPagination = (book) => !String(book?.PAGINATION || '').trim();

const extractIsbnsFromWebsite = (website) => {
  const s = String(website || '');
  if (!s) return [];
  const matches = s.match(/(?:97[89]\d{10}|\d{9}[\dXx])/g) || [];
  return Array.from(new Set(matches.map(normalizeIsbn).filter((x) => x.length === 10 || x.length === 13)));
};

const toIsbnCandidates = (book) => {
  const direct = [book?.ISBN, book?.EAN].map(normalizeIsbn);
  const website = extractIsbnsFromWebsite(book?.Website);
  const merged = Array.from(new Set([...direct, ...website].filter(Boolean)));

  // Some records appear to store only the last 10 digits of a 13-digit ISBN
  // (e.g. 1106017534 -> 9781106017534 on publisher URLs).
  const withPrefixed = [...merged];
  merged.forEach((v) => {
    if (v.length === 10 && v.startsWith('1')) {
      withPrefixed.push(`978${v}`);
    }
  });

  return Array.from(new Set(withPrefixed));
};

const normalizeText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toTokens = (value) => new Set(normalizeText(value).split(' ').filter(Boolean));

const overlapScore = (a, b) => {
  const aTokens = toTokens(a);
  const bTokens = toTokens(b);
  if (!aTokens.size || !bTokens.size) return 0;
  let hits = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) hits += 1;
  }
  return hits / Math.max(aTokens.size, bTokens.size);
};

const withTimeoutJson = async (url, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'mybookshelf-pagination-enricher/1.0' },
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_err) {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const pageCountFromOpenLibrary = async (isbn) => {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&jscmd=data&format=json`;
  const data = await withTimeoutJson(url);
  const record = data && data[`ISBN:${isbn}`];
  const pages = Number(record?.number_of_pages || 0);
  if (Number.isFinite(pages) && pages > 0) {
    return { pageCount: Math.round(pages), source: 'openlibrary' };
  }
  return null;
};

const pageCountFromGoogleBooks = async (isbn) => {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=1`;
  const data = await withTimeoutJson(url);
  const first = Array.isArray(data?.items) && data.items.length ? data.items[0] : null;
  const pages = Number(first?.volumeInfo?.pageCount || 0);
  if (Number.isFinite(pages) && pages > 0) {
    return { pageCount: Math.round(pages), source: 'google-books' };
  }
  return null;
};

const pageCountFromOpenLibrarySearch = async (title, author) => {
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=5`;
  const data = await withTimeoutJson(url);
  const docs = Array.isArray(data?.docs) ? data.docs : [];
  if (!docs.length) return null;

  let best = null;
  for (const d of docs) {
    const pages = Number(d?.number_of_pages_median || 0);
    if (!Number.isFinite(pages) || pages <= 0) continue;
    const docTitle = String(d?.title || '').trim();
    const docAuthor = Array.isArray(d?.author_name) ? String(d.author_name[0] || '') : '';
    const score = (overlapScore(title, docTitle) * 0.7) + (overlapScore(author, docAuthor) * 0.3);
    if (!best || score > best.score) {
      best = { pageCount: Math.round(pages), source: 'openlibrary-search', score };
    }
  }

  if (best && best.score >= 0.45) return best;
  return null;
};

const pageCountFromGoogleBooksSearch = async (title, author) => {
  const q = `intitle:${title} inauthor:${author}`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5`;
  const data = await withTimeoutJson(url);
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return null;

  let best = null;
  for (const item of items) {
    const pages = Number(item?.volumeInfo?.pageCount || 0);
    if (!Number.isFinite(pages) || pages <= 0) continue;

    const gTitle = String(item?.volumeInfo?.title || '').trim();
    const gAuthor = Array.isArray(item?.volumeInfo?.authors)
      ? String(item.volumeInfo.authors[0] || '')
      : '';

    const score = (overlapScore(title, gTitle) * 0.7) + (overlapScore(author, gAuthor) * 0.3);
    if (!best || score > best.score) {
      best = { pageCount: Math.round(pages), source: 'google-books-search', score };
    }
  }

  if (best && best.score >= 0.45) return best;
  return null;
};

const median = (nums) => {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const pageCountFromOpenLibraryWorkEditions = async (title, author) => {
  const searchUrl = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&limit=5`;
  const data = await withTimeoutJson(searchUrl);
  const docs = Array.isArray(data?.docs) ? data.docs : [];
  if (!docs.length) return null;

  let bestDoc = null;
  let bestScore = 0;
  for (const d of docs) {
    const docTitle = String(d?.title || '').trim();
    const docAuthor = Array.isArray(d?.author_name) ? String(d.author_name[0] || '') : '';
    const score = (overlapScore(title, docTitle) * 0.7) + (overlapScore(author, docAuthor) * 0.3);
    if (score > bestScore) {
      bestScore = score;
      bestDoc = d;
    }
  }

  const workKey = String(bestDoc?.key || '').trim();
  if (!workKey || bestScore < 0.45) return null;

  const editionsUrl = `https://openlibrary.org${workKey}/editions.json?limit=200`;
  const editionsData = await withTimeoutJson(editionsUrl);
  const entries = Array.isArray(editionsData?.entries) ? editionsData.entries : [];
  const pages = entries
    .map((e) => Number(e?.number_of_pages || 0))
    .filter((n) => Number.isFinite(n) && n >= 40 && n <= 2200);

  if (!pages.length) return null;
  const pageCount = median(pages);
  if (!pageCount) return null;

  return {
    pageCount,
    source: 'openlibrary-work-editions',
    score: bestScore
  };
};

const fetchPageCount = async (isbns, title, author) => {
  for (const isbn of isbns) {
    const ol = await pageCountFromOpenLibrary(isbn);
    if (ol) return { ...ol, isbn };

    const gb = await pageCountFromGoogleBooks(isbn);
    if (gb) return { ...gb, isbn };
  }

  const olSearch = await pageCountFromOpenLibrarySearch(title, author);
  if (olSearch) return { ...olSearch, isbn: '' };

  const gbSearch = await pageCountFromGoogleBooksSearch(title, author);
  if (gbSearch) return { ...gbSearch, isbn: '' };

  const olWorkEditions = await pageCountFromOpenLibraryWorkEditions(title, author);
  if (olWorkEditions) return { ...olWorkEditions, isbn: '' };

  return null;
};

async function main() {
  const raw = await fs.readFile(BOOK_LIST_PATH, 'utf8');
  const books = JSON.parse(raw);
  if (!Array.isArray(books)) {
    throw new Error('BookList.json is not an array');
  }

  const missing = books
    .map((book, index) => ({ book, index }))
    .filter(({ book }) => isMissingPagination(book))
    .filter(({ book }) => normalizeIsbn(book?.ISBN || book?.EAN).length >= 10);

  const targets = hasAll ? missing : missing.slice(0, SAMPLE_LIMIT);

  const report = {
    startedAt: new Date().toISOString(),
    mode: hasAll ? 'full' : 'sample',
    apply: hasApply,
    totalBooks: books.length,
    missingWithIsbn: missing.length,
    targets: targets.length,
    updated: 0,
    unresolved: 0,
    sourceCounts: {
      openlibrary: 0,
      'google-books': 0,
      'openlibrary-search': 0,
      'google-books-search': 0,
      'openlibrary-work-editions': 0
    },
    failures: [],
    examplesUpdated: []
  };

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= targets.length) return;

      const { book, index } = targets[i];
      const isbnCandidates = toIsbnCandidates(book);
      const isbn = isbnCandidates[0] || '';
      const title = String(book?.Title || '').trim();
      const author = String(book?.Author || book?.AlphaAuthor || '').trim();
      const result = await fetchPageCount(isbnCandidates, title, author);

      if (result && result.pageCount > 0) {
        books[index] = {
          ...books[index],
          PAGINATION: String(result.pageCount)
        };
        report.updated += 1;
        report.sourceCounts[result.source] += 1;

        if (report.examplesUpdated.length < 25) {
          report.examplesUpdated.push({
            uid: books[index]?._uid || '',
            title: books[index]?.Title || '',
            isbn,
            isbnUsed: result.isbn || '',
            pagination: String(result.pageCount),
            source: result.source
          });
        }
      } else {
        report.unresolved += 1;
        if (report.failures.length < 50) {
          report.failures.push({
            uid: books[index]?._uid || '',
            title: books[index]?.Title || '',
            isbn
          });
        }
      }

      if ((i + 1) % 25 === 0 || i + 1 === targets.length) {
        // eslint-disable-next-line no-console
        console.log(`Progress: ${i + 1}/${targets.length}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length || 1) }, () => worker()));

  if (hasApply) {
    const backupPath = path.resolve(
      ROOT,
      'public',
      `BookList.backup.pagination.${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    );
    await fs.writeFile(backupPath, `${raw.endsWith('\n') ? raw : `${raw}\n`}`, 'utf8');
    await fs.writeFile(BOOK_LIST_PATH, `${JSON.stringify(books, null, 2)}\n`, 'utf8');
    report.backupPath = backupPath;
  }

  report.finishedAt = new Date().toISOString();
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Pagination update complete: updated=${report.updated}, unresolved=${report.unresolved}, apply=${hasApply}`);
  // eslint-disable-next-line no-console
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
