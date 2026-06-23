const fs = require('fs');
const axios = require('axios');

const FILE_PATH = './BNClassics_Update2.json';
const FILE_PATH2 = './BNClassics_Update3.json';

// Helper to pause briefly between API hits to be respectful (only 200ms needed here!)
const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchCoversViaAPI() {
  const rawData = fs.readFileSync(FILE_PATH, 'utf8');
  const books = JSON.parse(rawData);

  console.log(`Starting clean API data fetch for ${books.length} books...`);

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const url = book.GOODREADS;

    if (!url) continue;

    // 1. Extract the ISBN number from the end of your query string
    const isbnMatch = url.match(/query=(\d+)/);
    if (!isbnMatch) {
      console.log(`[${i + 1}/${books.length}] No ISBN found in URL string.`);
      continue;
    }
    const isbn = isbnMatch[1];

        book.IMAGE = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      

      await delay(200); // Tiny pause

    } catch (error) {
      console.error(`   ❌ API Error for ${isbn}:`, error.message);
    }

    // Progress Autosave every 25 records
    if (i % 25 === 0) {
      fs.writeFileSync(FILE_PATH2, JSON.stringify(books, null, 2), 'utf8');
    }
  }

  fs.writeFileSync(FILE_PATH2, JSON.stringify(books, null, 2), 'utf8');
  console.log('\nSuccess! Process completed using Open Library paths.');
}

fetchCoversViaAPI();