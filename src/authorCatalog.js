const normalizeAuthorName = (name) => String(name || '')
  .normalize('NFKC')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

export const groupCatalogAuthors = (authors) => {
  const groupedAuthors = new Map();
  (Array.isArray(authors) ? authors : []).forEach((author) => {
    const nameKey = normalizeAuthorName(author?.name);
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
