const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '..', 'public', 'BookList.json');
const outputPath = path.join(__dirname, '..', 'backend', 'BookList.supabase.csv');
const books = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

if (!Array.isArray(books)) {
  throw new Error('BookList.json must contain an array of books.');
}

const seenUids = new Set();
const csvCell = (value) => `"${String(value).replace(/"/g, '""')}"`;
const rows = ['"uid","book"'];

books.forEach((book, index) => {
  if (!book || typeof book !== 'object' || Array.isArray(book)) {
    throw new Error(`Book at index ${index} is not an object.`);
  }

  const uid = String(book._uid || book.uid || book.ISBN || book.EAN || book.Title || `book-${index}`);
  if (seenUids.has(uid)) {
    throw new Error(`Duplicate book identifier: ${uid}`);
  }
  seenUids.add(uid);
  rows.push(`${csvCell(uid)},${csvCell(JSON.stringify(book))}`);
});

fs.writeFileSync(outputPath, `${rows.join('\n')}\n`);
console.log(`Exported ${books.length} books to ${outputPath}`);