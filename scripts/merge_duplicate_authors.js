const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = process.cwd();
const INPUT_PATH = path.join(ROOT, 'public', 'AuthorList.json');
const OUTPUT_PATH = path.join(ROOT, 'public', 'AuthorList.json');
const REPORT_PATH = path.join(ROOT, 'public', 'author_merge_report.json');

const toAsciiFold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizeSpace = (s) => String(s || '').replace(/\s+/g, ' ').trim();

const normalizeTitle = (title) => {
  const t = toAsciiFold(String(title || '').toLowerCase())
    .replace(/&amp;|&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t.replace(/^(the|a|an)\s+/, '');
};

const particles = new Set(['de', 'da', 'del', 'di', 'du', 'la', 'le', 'van', 'von', 'of', 'the']);

const personTokens = (name) => {
  const normalized = normalizeSpace(toAsciiFold(toDisplayName(name).toLowerCase()))
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !particles.has(t));
};

const toDisplayName = (name) => {
  const s = normalizeSpace(name);
  if (!s.includes(',')) return s;
  const parts = s.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return s;
  return `${parts.slice(1).join(' ')} ${parts[0]}`.replace(/\s+/g, ' ').trim();
};

const levenshtein = (a, b) => {
  const s = String(a || '');
  const t = String(b || '');
  const m = s.length;
  const n = t.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
};

const nameSimilarity = (aName, bName) => {
  const a = personTokens(aName);
  const b = personTokens(bName);
  if (!a.length || !b.length) return { similar: false, reason: '' };

  const aFirst = a[0];
  const bFirst = b[0];
  const firstNear = aFirst === bFirst || levenshtein(aFirst, bFirst) <= 1;

  const aSet = new Set(a);
  const bSet = new Set(b);
  const shared = [...aSet].filter((t) => bSet.has(t));

  const smaller = a.length <= b.length ? a : b;
  const largerSet = a.length <= b.length ? bSet : aSet;
  const subset = smaller.every((t) => largerSet.has(t));

  const aSurnames = new Set(a.slice(1));
  const bSurnames = new Set(b.slice(1));
  const sharedSurname = [...aSurnames].some((t) => bSurnames.has(t)) || [...aSurnames].some((t) => bSet.has(t)) || [...bSurnames].some((t) => aSet.has(t));

  if (subset && firstNear) return { similar: true, reason: 'name-subset' };
  if (firstNear && sharedSurname) return { similar: true, reason: 'first-and-surname' };
  if (shared.length >= 2 && firstNear) return { similar: true, reason: 'shared-name-tokens' };

  return { similar: false, reason: '' };
};

const titleSet = (author) => {
  const s = new Set();
  (author.books || []).forEach((b) => {
    const t = normalizeTitle(b?.title || '');
    if (t) s.add(t);
  });
  return s;
};

const intersectionCount = (aSet, bSet) => {
  let count = 0;
  for (const v of aSet) {
    if (bSet.has(v)) count += 1;
  }
  return count;
};

const uniqueBooks = (books) => {
  const out = [];
  const seen = new Set();
  books.forEach((b) => {
    const key = `${b?.uid || ''}|${b?.isbn || ''}|${normalizeTitle(b?.title || '')}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(b);
    }
  });
  return out;
};

const chooseCanonical = (a, b) => {
  const aTokens = personTokens(a.canonicalName || '');
  const bTokens = personTokens(b.canonicalName || '');

  const aWiki = Boolean(a.wikipedia && a.wikipedia.title);
  const bWiki = Boolean(b.wikipedia && b.wikipedia.title);
  if (aWiki !== bWiki) return aWiki ? a : b;

  if (aTokens.length !== bTokens.length) return aTokens.length > bTokens.length ? a : b;

  const aLen = String(a.canonicalName || '').length;
  const bLen = String(b.canonicalName || '').length;
  if (aLen !== bLen) return aLen > bLen ? a : b;

  return String(a.canonicalName || '').localeCompare(String(b.canonicalName || '')) <= 0 ? a : b;
};

async function main() {
  const raw = await fs.readFile(INPUT_PATH, 'utf8');
  const authors = JSON.parse(raw);
  if (!Array.isArray(authors)) throw new Error('AuthorList.json must be an array');

  const used = new Array(authors.length).fill(false);
  const merged = [];
  const mergeDetails = [];

  for (let i = 0; i < authors.length; i += 1) {
    if (used[i]) continue;

    let current = { ...authors[i] };
    current.variants = Array.isArray(current.variants) ? [...current.variants] : [];
    current.books = Array.isArray(current.books) ? [...current.books] : [];

    for (let j = i + 1; j < authors.length; j += 1) {
      if (used[j]) continue;

      const candidate = authors[j];
      const sim = nameSimilarity(current.canonicalName || '', candidate.canonicalName || '');
      if (!sim.similar) continue;

      const overlap = intersectionCount(titleSet(current), titleSet(candidate));
      if (overlap < 1) continue;

      const keep = chooseCanonical(current, candidate);
      const drop = keep === current ? candidate : current;

      const mergedVariants = Array.from(new Set([...(current.variants || []), ...(candidate.variants || []), current.canonicalName, candidate.canonicalName].filter(Boolean))).sort((a, b) => a.localeCompare(b));
      const mergedBooks = uniqueBooks([...(current.books || []), ...(candidate.books || [])]);

      current = {
        ...keep,
        canonicalName: keep.canonicalName,
        sortName: keep.sortName || drop.sortName,
        normalizedName: keep.normalizedName || drop.normalizedName,
        signature: keep.signature || drop.signature,
        wikipedia: keep.wikipedia || drop.wikipedia || null,
        variants: mergedVariants,
        books: mergedBooks,
        bookCount: mergedBooks.length
      };

      used[j] = true;
      if (keep !== authors[i]) {
        used[i] = true;
      }

      mergeDetails.push({
        kept: current.canonicalName,
        merged: candidate.canonicalName,
        reason: `${sim.reason}+title-overlap`,
        sharedTitles: overlap
      });
    }

    merged.push(current);
  }

  merged.sort((a, b) => String(a.canonicalName || '').localeCompare(String(b.canonicalName || '')));
  merged.forEach((a, idx) => {
    a.id = `author-${idx + 1}`;
  });

  const report = {
    startedAt: new Date().toISOString(),
    inputAuthors: authors.length,
    outputAuthors: merged.length,
    mergedCount: authors.length - merged.length,
    merges: mergeDetails.slice(0, 500),
    finishedAt: new Date().toISOString()
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Merged authors: ${authors.length} -> ${merged.length}`);
  // eslint-disable-next-line no-console
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
