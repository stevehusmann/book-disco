const normalizeAuthorName = (author) => {
  let name = String(author?.name || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
  const sortName = String(author?.sortName || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');

  if (!name.includes(' ') && !name.includes(',') && (sortName.includes(' ') || sortName.includes(','))) {
    name = sortName;
  }
  if (name.includes(',')) {
    const [surname, ...givenNames] = name.split(',').map((part) => part.trim()).filter(Boolean);
    if (givenNames.length) name = `${givenNames.join(' ')} ${surname}`;
  }

  const nameParts = name.toLowerCase().split(/\s+/).filter(Boolean);
  if (nameParts.length < 2) return nameParts[0] ? `single:${nameParts[0]}` : '';
  return `${nameParts[0]} ${nameParts[nameParts.length - 1]}`;
};

export const groupCatalogAuthors = (authors) => {
  const groupedAuthors = new Map();
  (Array.isArray(authors) ? authors : []).forEach((author) => {
    const nameKey = normalizeAuthorName(author);
    if (!nameKey || !author?.id) return;
    if (!groupedAuthors.has(nameKey)) groupedAuthors.set(nameKey, []);
    groupedAuthors.get(nameKey).push(author);
  });

  return [...groupedAuthors.values()].map((group) => {
    const orderedGroup = [...group].sort((left, right) => (
      Number(Boolean(right.wikipediaPageTitle)) - Number(Boolean(left.wikipediaPageTitle))
      || Number(Boolean(right.sortName)) - Number(Boolean(left.sortName))
      || String(left.id).localeCompare(String(right.id))
    ));
    const primaryAuthor = orderedGroup[0];
    return {
      ...primaryAuthor,
      aliasIds: [...new Set(group.flatMap((author) => [
        author.id,
        ...(Array.isArray(author.aliasIds) ? author.aliasIds : [])
      ]))],
      hasLinkedWorks: group.some((author) => author.hasLinkedWorks),
      hasLinkedEditions: group.some((author) => author.hasLinkedEditions)
    };
  });
};
