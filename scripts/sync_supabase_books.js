const fs = require('node:fs');
const path = require('node:path');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const allFlag = args.has('--all');

const rootDir = path.resolve(__dirname, '..');
const defaultSource = path.join(rootDir, 'public', 'BookList.json');
const sourcePath = sourceArg ? path.resolve(rootDir, sourceArg.split('=')[1]) : defaultSource;

const normalizeUrl = (value) => {
  if (!value) return '';
  return value.trim().replace(/\/rest\/v1(?:\/books)?\/?>?$/, '').replace(/\/+$/, '');
};

const pickUid = (book, index) => {
  const raw = book?._uid || book?.uid || book?.ISBN || book?.EAN || book?.Title || `book-${index}`;
  return String(raw).trim() || `book-${index}`;
};

const parseBooks = () => {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${sourcePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('Book source must be an array.');
  return parsed;
};

const getSupabaseConfig = () => {
  const supabaseUrl = normalizeUrl(process.env.SUPABASE_URL || '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { supabaseUrl, serviceKey };
};

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

async function upsertBatch(baseUrl, serviceKey, rows) {
  const response = await fetch(`${baseUrl}/rest/v1/books?on_conflict=uid`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(rows)
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase insert failed (${response.status}): ${responseText}`);
  }

  return responseText ? JSON.parse(responseText) : [];
}

async function main() {
  const allBooks = parseBooks();
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  const selectedBooks = !allFlag && Number.isFinite(limit) && limit >= 0
    ? allBooks.slice(0, limit)
    : allBooks;

  if (dryRun) {
    console.log(JSON.stringify({
      source: sourcePath,
      totalAvailable: allBooks.length,
      selected: selectedBooks.length,
      firstSample: selectedBooks.slice(0, 5).map((book, idx) => ({ uid: pickUid(book, idx), title: book?.Title || 'Untitled' }))
    }, null, 2));
    return;
  }

  const { supabaseUrl, serviceKey } = getSupabaseConfig();

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
  }

  const rows = selectedBooks.map((book, index) => ({
    uid: pickUid(book, index),
    book: { ...book, _uid: pickUid(book, index) }
  }));

  const batches = chunk(rows, 100);
  let inserted = 0;

  for (const batch of batches) {
    await upsertBatch(supabaseUrl, serviceKey, batch);
    inserted += batch.length;
    console.log(`Inserted ${batch.length} records into Supabase (${inserted}/${rows.length})`);
  }

  console.log(JSON.stringify({
    source: sourcePath,
    totalAvailable: allBooks.length,
    selected: selectedBooks.length,
    inserted,
    table: 'public.books'
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
