const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// Keeping your updated safe paths
const FILE_PATH = './BNClassics_Update2.json';
const FILE_PATH2 = './BNClassics_Update3.json';

// Helper to pause between requests so Goodreads doesn't ban your IP
const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchBookCovers() {
  // 1. Read your current JSON data
  const rawData = fs.readFileSync(FILE_PATH, 'utf8');
  const books = JSON.parse(rawData);

  console.log(`Starting hyper-fast Cheerio fetch for ${books.length} books...`);

  // 2. Loop through each book item
  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const url = book.GOODREADS;

    if (!url) {
      console.log(`Skipping index ${i}: No URL found.`);
      continue;
    }

    try {
      console.log(`[${i + 1}/${books.length}] Fetching: ${book.Title || 'Book'}`);
      
      // Download the page HTML source as raw text instantly
      const { data: html } = await axios.get(url, {
        headers: {
          // This tells Goodreads you are a normal web browser, not a bot script
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      // 3. Load the HTML text into Cheerio (This enables your '$' selector magic!)
      const $ = cheerio.load(html);

      // Look for the cover on a profile page OR fallback to the search results image
      let imgSrc = $('.BookCover__image img').attr('src') || 
                   $('.bookCover').attr('src') || 
                   $('.ResponsiveImage').attr('src');

      if (imgSrc) {
        // Optional clean up: Goodreads thumbnails contain sizing codes like "._SX50_". 
        // This regex strips them out so you get the gorgeous full-res covers!
        book.IMAGE = imgSrc.replace(/._SX\d+_\.|._SY\d+_\./g, '');
        console.log(`   Found Image: ${book.IMAGE}`);
      } else {
        console.log(`   ⚠️ Could not find an image selector on this page.`);
      }

      // 4. A mandatory 1.5-second break. 900+ requests back-to-back will cause 
      // Goodreads to block you. Being polite lets the script finish smoothly.
      await delay(1500);

    } catch (error) {
      console.error(`   ❌ Error fetching page for ${book.Title}:`, error.message);
      
      // If you run into "Too Many Requests" errors (Status 429), take a long nap
      if (error.response && error.response.status === 429) {
        console.log("Rate limited! Sleeping for 15 seconds...");
        await delay(15000);
      }
    }

    // 5. Progress Autosave! Saves to your output file every 10 loops so you never lose data.
    if (i % 10 === 0) {
      fs.writeFileSync(FILE_PATH2, JSON.stringify(books, null, 2), 'utf8');
    }
  }

  // 6. Final save when the entire list is finished
  fs.writeFileSync(FILE_PATH2, JSON.stringify(books, null, 2), 'utf8');
  console.log('\nFinished! All discovered image paths saved to BNClassics_Update3.json.');
}

fetchBookCovers();