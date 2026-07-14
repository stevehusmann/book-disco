const rawApiBaseUrl = (process.env.REACT_APP_API_BASE_URL || '').trim();
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, '');

export const apiUrl = (path) => {
  if (!path) return apiBaseUrl || '';
  if (!apiBaseUrl) return path;
  if (path.startsWith('/')) return `${apiBaseUrl}${path}`;
  return `${apiBaseUrl}/${path}`;
};
