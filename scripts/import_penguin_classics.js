const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const CSV_PATH = path.join(PUBLIC_DIR, 'Penguin Classics.csv');
const BOOKLIST_PATH = path.join(PUBLIC_DIR, 'BookList.json');
const REPORT_PATH = path.join(PUBLIC_DIR, 'penguin_import_report.json');
const BACKUP_PATH = path.join(PUBLIC_DIR, `BookList.backup.${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

const CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 30000;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (ch === '\r') {
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((c) => (c || '').trim().length > 0))
    .map((r) => {
      const obj = {};
      for (let i = 0; i < header.length; i += 1) {
        obj[header[i]] = (r[i] || '').trim();
      }
      return obj;
    });
}

function normalizeIsbn(v) {
  return String(v || '').replace(/[^0-9Xx]/g, '');
}

function toAlphaTitle(title) {
  const raw = String(title || '').trim();
  if (!raw) return '';
  const noOpenQuote = raw.replace(/^["'“”‘’]+/, '');
  return noOpenQuote.replace(/^(The|A|An)\s+/i, '').trim();
}

function toAlphaAuthor(author) {
  const s = String(author || '').trim();
  if (!s) return '';
  if (s.includes(';')) {
    const first = s.split(';')[0].trim();
    return toAlphaAuthor(first);
  }
  if (s.includes(' and ')) {
    const first = s.split(' and ')[0].trim();
    return toAlphaAuthor(first);
  }
  // Commas in this CSV usually separate multiple authors, so only invert
  // when there is no comma and it looks like a simple first/last name.
  if (s.includes(',')) return '';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return s;
  const last = parts.pop();
  return `${last}, ${parts.join(' ')}`;
}

function pickByRole(authors, matcher) {
  if (!Array.isArray(authors)) return '';
  return authors
    .filter((a) => matcher(String(a?.role?.description || '').toLowerCase()))
    .map((a) => String(a?.authorDisplay || '').trim())
    .filter(Boolean)
    .join('; ');
}

function readMetaContent(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<meta\\s+[^>]*name=["']${escaped}["'][^>]*content=["']([\\s\\S]*?)["'][^>]*>`, 'i');
  const m = html.match(re);
  return m ? m[1] : '';
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractPageData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return null;
  return JSON.parse(m[1]);
}

function toIsoDateString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value.date) return String(value.date);
  return '';
}

async function scrapePenguin(url) {
  const html = await fetchText(url);
  const next = extractPageData(html);
  const pageProps = next?.props?.pageProps || {};
  const td = pageProps.titleData || {};

  const authors = Array.isArray(td.authors) ? td.authors : [];

  const pagination = td.totalPages ? String(td.totalPages) : '';
  const editors = pickByRole(authors, (role) => role.includes('editor'));
  const translators = pickByRole(authors, (role) => role.includes('translator') || role.includes('translated'));

  const description =
    String(readMetaContent(html, 'description') || '').trim() ||
    String(readMetaContent(html, 'synopsis') || '').trim() ||
    String(td.synopsis || '').trim() ||
    String(td.description || '').trim() ||
    '';

  const publicationDate =
    String(readMetaContent(html, 'publicationDate') || '').trim() ||
    toIsoDateString(td.onSaleDate) ||
    String(pageProps.publishDate || '').trim() ||
    '';

  // Penguin page data does not consistently expose original-work publication date.
  const originalPublicationDate =
    String(td.originalPublicationDate || '').trim() ||
    String(td.firstPublished || '').trim() ||
    '';

  return {
    Pagination: pagination,
    Editors: editors,
    Translators: translators,
    Description: description,
    OriginalPublicationDate: originalPublicationDate,
    PublicationDate: publicationDate
  };
}

function writeReport(report) {
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
}

async function run() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf8');
  const csvRows = parseCsv(csvText);
  const bookList = JSON.parse(fs.readFileSync(BOOKLIST_PATH, 'utf8'));

  fs.writeFileSync(BACKUP_PATH, JSON.stringify(bookList, null, 2), 'utf8');

  const byIsbn = new Map();
  const byEan = new Map();
  for (let i = 0; i < bookList.length; i += 1) {
    const b = bookList[i];
    const isbn = normalizeIsbn(b.ISBN);
    const ean = normalizeIsbn(b.EAN);
    if (isbn) byIsbn.set(isbn, i);
    if (ean) byEan.set(ean, i);
  }

  const report = {
    startedAt: new Date().toISOString(),
    csvRows: csvRows.length,
    added: 0,
    updated: 0,
    scrapedOk: 0,
    scrapedFailed: 0,
    missingOriginalPublicationDate: 0,
    examplesAdded: [],
    examplesUpdated: [],
    examplesFailed: []
  };

  // Upsert base rows first.
  const working = [...bookList];
  const taskRows = [];

  for (const row of csvRows) {
    const isbn = normalizeIsbn(row.ISBN);
    if (!isbn) continue;

    let idx = byIsbn.get(isbn);
    if (idx === undefined) idx = byEan.get(isbn);

    const base = {
      PenguinID: String(row['Penguin ID'] || '').trim(),
      Title: String(row.Title || '').trim(),
      Author: String(row.Authors || '').trim(),
      Website: String(row.URL || '').trim(),
      ISBN: isbn,
      EAN: isbn,
      Image: String(row.Image || '').trim(),
      SeriesId: 'PC',
      Series: 'Penguin Classics',
      BINDING: 'pbk',
      AlphaTitle: toAlphaTitle(row.Title),
      AlphaAuthor: toAlphaAuthor(row.Authors)
    };

    if (idx === undefined) {
      idx = working.length;
      working.push(base);
      byIsbn.set(isbn, idx);
      byEan.set(isbn, idx);
      report.added += 1;
      if (report.examplesAdded.length < 20) report.examplesAdded.push({ ISBN: isbn, Title: base.Title });
    } else {
      const existing = working[idx] || {};
      working[idx] = {
        ...existing,
        ...base,
        // Keep any pre-existing alpha values if better than generated empties.
        AlphaTitle: base.AlphaTitle || existing.AlphaTitle || '',
        AlphaAuthor: base.AlphaAuthor || existing.AlphaAuthor || ''
      };
      report.updated += 1;
      if (report.examplesUpdated.length < 20) report.examplesUpdated.push({ ISBN: isbn, Title: base.Title });
    }

    taskRows.push({ idx, isbn, url: base.Website, title: base.Title });
  }

  let cursor = 0;

  async function worker() {
    while (cursor < taskRows.length) {
      const current = taskRows[cursor];
      cursor += 1;

      try {
        if (!current.url) throw new Error('Missing URL');
        const scraped = await scrapePenguin(current.url);

        const target = working[current.idx] || {};
        working[current.idx] = {
          ...target,
          PAGINATION: scraped.Pagination || target.PAGINATION || '',
          Editors: scraped.Editors || target.Editors || '',
          Translators: scraped.Translators || target.Translators || '',
          Description: scraped.Description || target.Description || '',
          OriginalPublicationDate: scraped.OriginalPublicationDate || target.OriginalPublicationDate || '',
          PublicationDate: scraped.PublicationDate || target.PublicationDate || ''
        };

        report.scrapedOk += 1;
        if (!scraped.OriginalPublicationDate) report.missingOriginalPublicationDate += 1;
      } catch (err) {
        report.scrapedFailed += 1;
        if (report.examplesFailed.length < 30) {
          report.examplesFailed.push({
            ISBN: current.isbn,
            Title: current.title,
            URL: current.url,
            error: String(err && err.message ? err.message : err)
          });
        }
      }

      if ((report.scrapedOk + report.scrapedFailed) % 25 === 0) {
        report.lastProgressAt = new Date().toISOString();
        report.processed = report.scrapedOk + report.scrapedFailed;
        writeReport(report);
        fs.writeFileSync(BOOKLIST_PATH, JSON.stringify(working, null, 2), 'utf8');
        process.stdout.write(`Processed ${report.processed}/${taskRows.length}\n`);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < CONCURRENCY; i += 1) workers.push(worker());
  await Promise.all(workers);

  report.processed = report.scrapedOk + report.scrapedFailed;
  report.finishedAt = new Date().toISOString();

  fs.writeFileSync(BOOKLIST_PATH, JSON.stringify(working, null, 2), 'utf8');
  writeReport(report);

  console.log('Done.');
  console.log(JSON.stringify({
    csvRows: report.csvRows,
    added: report.added,
    updated: report.updated,
    scrapedOk: report.scrapedOk,
    scrapedFailed: report.scrapedFailed,
    missingOriginalPublicationDate: report.missingOriginalPublicationDate,
    backup: path.basename(BACKUP_PATH),
    report: path.basename(REPORT_PATH)
  }, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
