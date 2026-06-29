const fs = require('node:fs/promises');
const path = require('node:path');
const axios = require('axios');
const { Jimp, intToRGBA } = require('jimp');

const BOOK_LIST_PATH = path.resolve(__dirname, '..', 'public', 'BookList.json');
const TARGET_V1 = [0x01, 0x15, 0x1e]; // #01151e
const TARGET_V2 = [0x00, 0x06, 0x12]; // #000612
const MAX_DISTANCE = Math.sqrt(255 * 255 * 3);

const args = process.argv.slice(2);
const hasAll = args.includes('--all');
const hasApply = args.includes('--apply');
const limitArg = args.find((a) => a.startsWith('--limit='));
const parsedLimit = limitArg ? Number(limitArg.split('=')[1]) : 50;
const SAMPLE_LIMIT = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.floor(parsedLimit) : 50;

const distancePercent = (a, b) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return (Math.sqrt(dr * dr + dg * dg + db * db) / MAX_DISTANCE) * 100;
};

const isPcBook = (book) => {
  const seriesId = String(book?.SeriesId || '').trim();
  const series = String(book?.Series || '').trim();
  return seriesId === 'PC' || (/Penguin Classics/i.test(series) && !/Deluxe/i.test(series));
};

const classifyFromBuffer = async (buffer) => {
  const image = await Jimp.read(buffer);
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  if (!w || !h) return 'v3';

  const x = Math.max(0, Math.min(w - 1, 20));
  const y = Math.max(0, Math.min(h - 1, h - 20));
  const { r, g, b } = intToRGBA(image.getPixelColor(x, y));
  const sample = [r, g, b];

  const d1 = distancePercent(sample, TARGET_V1);
  const d2 = distancePercent(sample, TARGET_V2);
  const nearest = d1 <= d2 ? 'v1' : 'v2';
  const nearestDistance = Math.min(d1, d2);

  return nearestDistance > 5 ? 'v3' : nearest;
};

async function main() {
  const raw = await fs.readFile(BOOK_LIST_PATH, 'utf8');
  const books = JSON.parse(raw);
  if (!Array.isArray(books)) {
    throw new Error('BookList.json is not an array');
  }

  let v1 = 0;
  let v2 = 0;
  let v3 = 0;
  let failed = 0;

  const pcIndexes = [];
  books.forEach((book, idx) => {
    if (isPcBook(book)) pcIndexes.push(idx);
  });

  const indexesToProcess = hasAll ? pcIndexes : pcIndexes.slice(0, SAMPLE_LIMIT);
  let processed = 0;
  const total = indexesToProcess.length;
  const CONCURRENCY = 20;
  let cursor = 0;

  // eslint-disable-next-line no-console
  console.log(`Mode: ${hasAll ? 'full' : 'sample'} (${total}/${pcIndexes.length}) | write=${hasApply ? 'yes' : 'no'}`);

  const classifyBookAtIndex = async (bookIndex) => {
    const book = books[bookIndex];
    if (!book?.Image) {
      book.PCversion = 'v3';
      v3 += 1;
      return;
    }

    try {
      const response = await axios.get(book.Image, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'mybookshelf-precompute/1.0'
        }
      });

      const version = await classifyFromBuffer(Buffer.from(response.data));
      book.PCversion = version;
      if (version === 'v1') v1 += 1;
      else if (version === 'v2') v2 += 1;
      else v3 += 1;
    } catch (_err) {
      book.PCversion = 'v3';
      v3 += 1;
      failed += 1;
    }
  };

  const worker = async () => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= total) return;
      await classifyBookAtIndex(indexesToProcess[i]);
      processed += 1;
      if (processed % 50 === 0 || processed === total) {
        // eslint-disable-next-line no-console
        console.log(`Progress: ${processed}/${total}`);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));

  if (hasApply) {
    await fs.writeFile(BOOK_LIST_PATH, `${JSON.stringify(books, null, 2)}\n`, 'utf8');
  }
  // eslint-disable-next-line no-console
  console.log(`PCversion precompute complete: v1=${v1}, v2=${v2}, v3=${v3}, failed=${failed}, wrote=${hasApply}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
