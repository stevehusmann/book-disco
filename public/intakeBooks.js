const fs = require('fs');
const csv = require('csv-parser');

// 1. Point it at your local CSV file
const CSV_FILE_PATH = './OWC-Titles.csv'; 
const OUTPUT_JSON_PATH = './BNClassics_Update2.json';

const results = [];

// 2. Stream and parse the CSV
fs.createReadStream(CSV_FILE_PATH)
  .pipe(csv())
  .on('data', (row) => {
    // You can process or clean the rows here if needed!
    const role = row["CONTRIBUTORS ROLE"].split("; ");
    const contributors = row["AUTHOR(S)/EDITOR(S)"].split("; ");
    const authors = [];
    const editors = [];
    const translators = [];
    for (let i=0; i<role.length; i++) {
      if (role[i] === 'By (author)') {
        authors.push(contributors[i]);
      }
      if (role[i] === 'Edited by') {
        editors.push(contributors[i]);
      }
      if (role[i] === 'Translated by') {
        translators.push(contributors[i]);
      }
    }
    if (authors.length === 0){
      row["AUTHORS"]=["Unknown"];
    }
    if (authors.length > 0){
      row["AUTHORS"]=authors;
    }
    if (editors.length > 0){
      row["EDITORS"]=editors;
    }
    if (translators.length > 0){
      row["TRANSLATORS"]=translators;
    }         
    row["GOODREADS"] = `https://www.goodreads.com/search?utf8=%E2%9C%93&query=${row["ISBN"]}`
    delete row["CONTRIBUTORS ROLE"];
    delete row["AUTHOR(S)/EDITOR(S)"];
    delete row["NOTES"];
    results.push(row);
  })
  .on('end', () => {
    // 3. Write the final array straight to your JSON file
    fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(results, null, 2), 'utf8');
    
    console.log(`Success! ${results.length} rows converted.`);
    console.log(`Saved directly to: ${OUTPUT_JSON_PATH}`);
  })
  .on('error', (err) => {
    console.error('Error reading the CSV file:', err);
  });