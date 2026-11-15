const fetchAllSupabaseRows = async (request, route, pageSize = 1000) => {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('Supabase page size must be a positive integer.');
  }

  const [resource, query = ''] = route.split('?');
  if (!resource) throw new Error('Supabase route is required.');

  const params = new URLSearchParams(query);
  params.set('limit', String(pageSize));

  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    params.set('offset', String(offset));
    const page = await request(`${resource}?${params.toString()}`);
    if (!Array.isArray(page)) throw new Error(`Supabase query for ${resource} did not return rows.`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

module.exports = { fetchAllSupabaseRows };
