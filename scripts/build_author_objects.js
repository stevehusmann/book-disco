const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = process.cwd();
const DEFAULT_INPUT = path.join(ROOT, 'public', 'BookList.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'public', 'AuthorList.json');
const DEFAULT_CACHE = path.join(ROOT, 'public', 'author_wikipedia_cache.json');
const DEFAULT_REPORT = path.join(ROOT, 'public', 'author_build_report.json');

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
};

const all = args.includes('--all');
const noApi = args.includes('--no-api');
const inputPath = path.resolve(ROOT, getArgValue('--input') || DEFAULT_INPUT);
const outputPath = path.resolve(ROOT, getArgValue('--output') || DEFAULT_OUTPUT);
const cachePath = path.resolve(ROOT, getArgValue('--cache') || DEFAULT_CACHE);
const reportPath = path.resolve(ROOT, getArgValue('--report') || DEFAULT_REPORT);

const limitArg = getArgValue('--limit');
const parsedLimit = Number(limitArg || 50);
const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 50;

const toAsciiFold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const cleanNameText = (s) =>
  String(s || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const splitAuthorNames = (raw) => {
  const cleaned = cleanNameText(raw);
  if (!cleaned) return [];

  const out = [];
  const firstPass = cleaned.split(/\s*;\s*/).filter(Boolean);

  firstPass.forEach((part) => {
    const andParts = part.split(/\s+and\s+/i).map((x) => x.trim()).filter(Boolean);

    andParts.forEach((seg) => {
      // Keep "Last, First" as one author, but split obvious multi-author comma lists.
      const isLikelySingleInverted = /^[^,]+,\s*[^,]+$/.test(seg);
      if (isLikelySingleInverted) {
        out.push(seg);
        return;
      }

      const commaParts = seg.split(/\s*,\s*/).map((x) => x.trim()).filter(Boolean);
      if (commaParts.length > 1) {
        commaParts.forEach((x) => out.push(x));
      } else {
        out.push(seg);
      }
    });
  });

  return Array.from(new Set(out.map((x) => x.trim()).filter(Boolean)));
};

const toDisplayOrder = (name) => {
  const s = String(name || '').trim();
  if (!s) return '';
  if (!s.includes(',')) return s;
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return s;
  return `${parts.slice(1).join(' ')} ${parts[0]}`.replace(/\s+/g, ' ').trim();
};

const normalizeName = (name, dropMiddleSingleLetters = false) => {
  const display = toDisplayOrder(name);
  const folded = toAsciiFold(display)
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = folded
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !['dr', 'prof', 'sir', 'st', 'saint'].includes(t));

  if (!dropMiddleSingleLetters || tokens.length <= 2) {
    return tokens.join(' ');
  }

  const reduced = tokens.filter((t, i) => {
    if (i === 0 || i === tokens.length - 1) return true;
    return t.length > 1;
  });

  return reduced.join(' ');
};

const nameSignature = (name) => {
  const n = normalizeName(name, true);
  if (!n) return '';
  const tokens = n.split(' ').filter(Boolean);
  if (tokens.length <= 1) return n;
  return `${tokens[0]}::${tokens[tokens.length - 1]}`;
};

const timeoutFetchJson = async (url, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'user-agent': 'mybookshelf-author-builder/1.0'
      },
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

const resolveWikipediaTitle = async (name, cache) => {
  const key = normalizeName(name, false);
  if (!key) return null;
  if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];

  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(name)}&limit=5&namespace=0&format=json&origin=*`;
  const data = await timeoutFetchJson(url);
  if (!Array.isArray(data) || !Array.isArray(data[1]) || !Array.isArray(data[3])) {
    cache[key] = null;
    return null;
  }

  const titles = data[1];
  const links = data[3];
  let best = null;

  for (let i = 0; i < titles.length; i += 1) {
    const t = String(titles[i] || '').trim();
    const l = String(links[i] || '').trim();
    if (!t || !l) continue;

    const tn = normalizeName(t, true);
    const nn = normalizeName(name, true);
    const sameSignature = nameSignature(t) && nameSignature(name) && nameSignature(t) === nameSignature(name);
    const strictMatch = tn && nn && (tn === nn || tn.includes(nn) || nn.includes(tn));

    if (strictMatch || sameSignature) {
      best = { title: t, url: l };
      break;
    }
  }

  cache[key] = best;
  return best;
};

const ensureDir = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

async function main() {
  const raw = await fs.readFile(inputPath, 'utf8');
  const books = JSON.parse(raw);
  if (!Array.isArray(books)) {
    throw new Error('Input JSON must be an array of books');
  }

  const cache = await fs.readFile(cachePath, 'utf8')
    .then((t) => JSON.parse(t))
    .catch(() => ({}));

  const booksToProcess = all ? books : books.slice(0, limit);

  const byExact = new Map();
  const bySignature = new Map();
  const byWikiTitle = new Map();
  const authors = [];

  const report = {
    startedAt: new Date().toISOString(),
    inputPath,
    outputPath,
    usedApi: !noApi,
    processedBooks: booksToProcess.length,
    totalBooksInInput: books.length,
    createdAuthors: 0,
    mergedByExact: 0,
    mergedBySignature: 0,
    mergedByWiki: 0,
    unresolvedNames: [],
    sampleMerges: []
  };

  for (let i = 0; i < booksToProcess.length; i += 1) {
    const book = booksToProcess[i] || {};
    const sourceName = String(book.Author || book.AlphaAuthor || '').trim();
    if (!sourceName) continue;

    const names = splitAuthorNames(sourceName);
    for (const rawName of names) {
      const displayName = toDisplayOrder(rawName);
      const exact = normalizeName(displayName, false);
      const sig = nameSignature(displayName);
      if (!exact) {
        report.unresolvedNames.push(rawName);
        continue;
      }

      let wiki = null;
      if (!noApi) {
        wiki = await resolveWikipediaTitle(displayName, cache);
      }

      let idx = byExact.get(exact);
      let mergeReason = 'exact';

      if (idx == null && wiki && byWikiTitle.has(wiki.title)) {
        idx = byWikiTitle.get(wiki.title);
        mergeReason = 'wiki';
      }

      if (idx == null && sig && bySignature.has(sig)) {
        const candidates = Array.from(bySignature.get(sig));
        if (candidates.length === 1) {
          idx = candidates[0];
          mergeReason = 'signature';
        }
      }

      if (idx == null) {
        idx = authors.length;
        authors.push({
          id: `author-${idx + 1}`,
          canonicalName: displayName,
          sortName: String(book.AlphaAuthor || '').trim() || displayName,
          normalizedName: exact,
          signature: sig,
          variants: [displayName],
          wikipedia: wiki || null,
          bookCount: 0,
          books: []
        });
        report.createdAuthors += 1;
      } else {
        if (mergeReason === 'wiki') report.mergedByWiki += 1;
        else if (mergeReason === 'signature') report.mergedBySignature += 1;
        else report.mergedByExact += 1;

        if (report.sampleMerges.length < 25) {
          report.sampleMerges.push({
            incoming: displayName,
            mergedInto: authors[idx].canonicalName,
            reason: mergeReason
          });
        }
      }

      const author = authors[idx];
      if (!author.variants.includes(displayName)) {
        author.variants.push(displayName);
      }

      if (!author.wikipedia && wiki) {
        author.wikipedia = wiki;
      }

      const bookRef = {
        uid: String(book._uid || ''),
        title: String(book.Title || '').trim(),
        author: String(book.Author || '').trim(),
        alphaAuthor: String(book.AlphaAuthor || '').trim(),
        isbn: String(book.ISBN || '').trim(),
        seriesId: String(book.SeriesId || '').trim()
      };

      const dedupeKey = `${bookRef.uid}|${bookRef.title}|${bookRef.isbn}`;
      const seen = new Set(author.books.map((b) => `${b.uid}|${b.title}|${b.isbn}`));
      if (!seen.has(dedupeKey)) {
        author.books.push(bookRef);
        author.bookCount += 1;
      }

      byExact.set(exact, idx);
      if (sig) {
        if (!bySignature.has(sig)) bySignature.set(sig, new Set());
        bySignature.get(sig).add(idx);
      }
      if (author.wikipedia?.title) {
        byWikiTitle.set(author.wikipedia.title, idx);
      }
    }
  }

  authors.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  authors.forEach((a, index) => {
    a.id = `author-${index + 1}`;
    a.variants = Array.from(new Set(a.variants)).sort((x, y) => x.localeCompare(y));
  });

  report.finishedAt = new Date().toISOString();
  report.outputAuthors = authors.length;

  await ensureDir(outputPath);
  await ensureDir(cachePath);
  await ensureDir(reportPath);

  await fs.writeFile(outputPath, `${JSON.stringify(authors, null, 2)}\n`, 'utf8');
  await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Authors written: ${authors.length} -> ${outputPath}`);
  // eslint-disable-next-line no-console
  console.log(`Report written: ${reportPath}`);
  // eslint-disable-next-line no-console
  console.log(`Mode: ${all ? 'full' : `sample (${booksToProcess.length})`} | API: ${noApi ? 'off' : 'on'}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
