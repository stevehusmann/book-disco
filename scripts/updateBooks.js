const fs = require('fs');

// 1. Read the JSON file
const rawData = fs.readFileSync('BNClassics3.json', 'utf8');
const data = JSON.parse(rawData);

// 2. Map through each item and add your new field
const updatedData = data.map(item => {
  const itemCopy = { ...item }; 
  const title = itemCopy["FULL TITLE"];
  let alphaTitle = '';
  if (title.slice(0,4) === "The ") {
    alphaTitle = title.slice(4);
  }
  else if (title.slice(0,2) === "A ") {
    alphaTitle = title.slice(2);
  }
  else if (title.slice(0, 3) === "An ") {
    alphaTitle = title.slice(3);
  }
  else {
    alphaTitle = title;
  }
  itemCopy.AlphaTitle = alphaTitle;

  const authorSplit = itemCopy.Author.split(' ');
  const alphaAuthor = authorSplit[authorSplit.length - 1];

  itemCopy.AlphaAuthor = alphaAuthor;

  return itemCopy;
});

const sortedByTitle = updatedData.sort((a, b) => {
  return a.AlphaTitle.localeCompare(b.AlphaTitle);
});
// 3. Write it back to a new file
fs.writeFileSync('BNClassics_Update.json', JSON.stringify(sortedByTitle, null, 2));

