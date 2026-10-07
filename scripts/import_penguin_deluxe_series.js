const fs = require('node:fs/promises');
const path = require('node:path');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');

const ROOT = process.cwd();
const BOOK_LIST_PATH = path.resolve(ROOT, 'public', 'BookList.json');
const REPORT_PATH = path.resolve(ROOT, 'public', 'penguin_deluxe_import_report.json');
const SERIES_URL = 'https://www.penguinrandomhouse.com/series/254/penguin-classics-deluxe-edition/';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dryRun = args.includes('--dry-run');
const hasAll = args.includes('--all');
const limitArg = args.find((a) => a.startsWith('--limit='));
const parsedLimit = limitArg ? Number(limitArg.split('=')[1]) : 20;
const limit = hasAll ? Infinity : Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 20;

function normalizeText(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return cheerio.load(`<div>${String(value ?? '')}</div>`).text().replace(/\s+/g, ' ').trim();
}

function normalizeIsbn(value) {
  return String(value ?? '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

function toAlphaTitle(title) {
  const raw = normalizeText(title);
  if (!raw) return '';
  return raw.replace(/^\s*(?:The|A|An)\s+/i, '').trim();
}

function toAlphaAuthor(author) {
  const raw = normalizeText(author);
  if (!raw) return '';
  if (raw.includes(';')) return toAlphaAuthor(raw.split(';')[0]);
  if (raw.includes(' and ')) return toAlphaAuthor(raw.split(' and ')[0]);
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return raw;
  const last = parts.pop();
  return `${last}, ${parts.join(' ')}`;
}

function sanitizeBookPayload(book) {
  return {
    Title: normalizeText(book.Title || ''),
    Author: normalizeText(book.Author || ''),
    Website: normalizeText(book.Website || ''),
    ISBN: normalizeIsbn(book.ISBN || ''),
    EAN: normalizeIsbn(book.EAN || ''),
    Image: normalizeText(book.Image || ''),
    Series: normalizeText(book.Series || ''),
    SeriesId: normalizeText(book.SeriesId || ''),
    BINDING: normalizeText(book.BINDING || 'pbk').toLowerCase() || 'pbk',
    AlphaTitle: normalizeText(book.AlphaTitle || toAlphaTitle(book.Title || '')),
    AlphaAuthor: normalizeText(book.AlphaAuthor || toAlphaAuthor(book.Author || '')),
    _uid: normalizeText(book._uid || '')
  };
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; mybookshelf-importer/1.0; +https://github.com)'
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return await res.text();
}

async function collectSeriesUrls() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto(SERIES_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForSelector('h2', { timeout: 30000 });

    const urls = await page.$$eval('a[href]', (anchors) => {
      const seen = new Set();
      const matches = [];

      for (const anchor of anchors) {
        const href = anchor.href;
        if (!/^https:\/\/www\.penguinrandomhouse\.com\/books\/\d+\//.test(href)) continue;
        if (/\/readers-guide\//.test(href)) continue;
        if (seen.has(href)) continue;
        seen.add(href);
        matches.push(href);
      }

      return matches;
    });

    return urls;
  } finally {
    await browser.close();
  }
}

function extractMetadata(html, sourceUrl) {
  const $ = cheerio.load(html);
  const ogTitle = normalizeText($('meta[property="og:title"]').attr('content') || '');
  const ogImage = normalizeText($('meta[property="og:image"]').attr('content') || '');

  const titleMatch = html.match(/"title":"((?:\\.|[^"\\])+)"\s*,\s*"subtitle"/);
  const authorMatch = html.match(/"author":"((?:\\.|[^"\\])+)"\s*,\s*"imprint"/);
  const isbnMatch = html.match(/"isbnStr":"([0-9Xx]+)"/)
    || html.match(/"isbn":"([0-9Xx]+)"/);
  const seriesMatch = html.match(/"series":\s*\{\s*"code":"([^"]+)",\s*"title":"((?:\\.|[^"\\])+?)"/);

  const explicitTitle = titleMatch ? decodeHtml(titleMatch[1]) : '';
  const explicitAuthor = authorMatch ? decodeHtml(authorMatch[1]) : '';
  const seriesCode = seriesMatch ? seriesMatch[1] : '254';
  const seriesTitle = seriesMatch ? decodeHtml(seriesMatch[2]) : 'Penguin Classics Deluxe Edition';

  const title = explicitTitle || ogTitle.replace(/\s*:\s*\d{13}\s*\|\s*PenguinRandomHouse\.com: Books$/i, '');
  const author = explicitAuthor || '';
  const isbn = normalizeIsbn(isbnMatch ? isbnMatch[1] : '');
  const image = ogImage || '';

  return {
    Title: title,
    Author: author,
    Website: sourceUrl,
    ISBN: isbn,
    EAN: isbn,
    Image: image,
    Series: seriesTitle,
    SeriesId: seriesCode,
    BINDING: 'pbk',
    _uid: `penguin-deluxe-${sourceUrl.split('/books/')[1]?.split('/')[0] || Date.now()}`
  };
}

async function mergeCandidates(candidates) {
  let existing = [];

  try {
    const raw = await fs.readFile(BOOK_LIST_PATH, 'utf8');
    existing = JSON.parse(raw);
  } catch (_error) {
    existing = [];
  }

  const byKey = new Map();
  for (const book of existing) {
    const key = normalizeIsbn(book?.ISBN || book?.EAN || book?.Website || `${book?.Title || ''}|${book?.Author || ''}`)
      || String(book?.Website || `${book?.Title || ''}|${book?.Author || ''}`);
    byKey.set(key, book);
  }

  const merged = [...existing];
  let added = 0;
  let updated = 0;

  for (const candidate of candidates) {
    const normalized = sanitizeBookPayload(candidate);
    const key = normalizeIsbn(normalized.ISBN || normalized.EAN || normalized.Website || `${normalized.Title}|${normalized.Author}`)
      || normalized.Website || `${normalized.Title}|${normalized.Author}`;

    const existingMatch = byKey.get(key);
    if (existingMatch) {
      const next = {
        ...existingMatch,
        ...normalized,
        AlphaTitle: normalized.AlphaTitle || existingMatch.AlphaTitle || toAlphaTitle(normalized.Title),
        AlphaAuthor: normalized.AlphaAuthor || existingMatch.AlphaAuthor || toAlphaAuthor(normalized.Author)
      };
      const idx = merged.indexOf(existingMatch);
      merged[idx] = next;
      byKey.set(key, next);
      updated += 1;
    } else {
      byKey.set(key, normalized);
      merged.push(normalized);
      added += 1;
    }
  }

  return { books: merged, added, updated };
}

async function run() {
  const urls = await collectSeriesUrls();
  const limitedUrls = typeof limit === 'number' && Number.isFinite(limit) ? urls.slice(0, limit) : urls;

  const samples = [];
  for (const url of limitedUrls) {
    const html = await fetchHtml(url);
    const metadata = extractMetadata(html, url);
    if (!metadata.Title) continue;
    samples.push(metadata);
  }

  const report = {
    startedAt: new Date().toISOString(),
    seriesUrl: SERIES_URL,
    requestedLimit: limit,
    discovered: urls.length,
    captured: samples.length,
    dryRun,
    apply
  };

  if (dryRun || !apply) {
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({
      discovered: urls.length,
      captured: samples.length,
      dryRun: true,
      preview: samples.slice(0, 5)
    }, null, 2));
    return;
  }

  const { books, added, updated } = await mergeCandidates(samples);
  await fs.writeFile(BOOK_LIST_PATH, JSON.stringify(books, null, 2), 'utf8');
  await fs.writeFile(REPORT_PATH, JSON.stringify({
    ...report,
    added,
    updated,
    finalBooks: books.length
  }, null, 2), 'utf8');

  console.log(JSON.stringify({
    discovered: urls.length,
    captured: samples.length,
    added,
    updated,
    finalBooks: books.length
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
