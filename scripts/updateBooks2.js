const fs = require('fs');

// 1. Read the JSON file
const rawData = fs.readFileSync('BNClassics_Update.json', 'utf8');
const data = JSON.parse(rawData);

// 2. Map through each item and add your new field
const updatedData = data.map(item => {
  const itemCopy = { ...item };
  const ISBN = itemCopy.ISBN.trim();
  itemCopy.Image = `https://covers.openlibrary.org/b/isbn/${ISBN}-L.jpg`;
  //itemCopy.Image = `https://oxfordworldsclassics.com/view/covers/${ISBN}.png`
  /*
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
  itemCopy.Title = title;
  itemCopy.AlphaTitle = alphaTitle;
  let author = '';
  const authorNames = itemCopy["AUTHORS"];
  if (authorNames.length > 1){
    for (let i = 0; i < authorNames.length; i++ ) {
      const authorSplit = authorNames[i]?.split(', ');
      if (authorSplit?.length > 1) {
      author += `${authorSplit[1]} ${authorSplit[0]}, `;
      } else {
        author += `${authorNames[i]}, `;
      }
    }                 
  } else {
      const authorSplit = authorNames[0].split(', ');
      if (authorSplit?.length > 1) {
      author = authorSplit[1] + ' ' + authorSplit[0]; 
      } else {
        author = authorNames[0];
      }
  }
  itemCopy.Author = author;
  itemCopy.AlphaAuthor = itemCopy["AUTHORS"][0];
*/
  return itemCopy;
});

const sortedByTitle = updatedData.sort((a, b) => {
  return a.AlphaTitle.localeCompare(b.AlphaTitle);
});
// 3. Write it back to a new file
fs.writeFileSync('BNClassics_Update.json', JSON.stringify(sortedByTitle, null, 2));

