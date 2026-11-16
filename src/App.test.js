import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

test('opens series management settings', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn((url) => Promise.resolve({
    ok: true,
    json: async () => url === '/api/series' ? [] : { books: [], total: 0, pageCount: 1 }
  }));
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Manage Series' }));
  expect(await screen.findByLabelText('Height / width ratio')).toBeInTheDocument();
  expect(screen.getByLabelText('Thickness multiplier')).toHaveValue(1);
  expect(screen.getByLabelText('Spine rendering')).toBeInTheDocument();
  global.fetch = originalFetch;
});

test('lists and deletes books that are not displayed', async () => {
  const book = { _uid: 'hardcover-book', Title: 'Hidden Hardcover', Author: 'A. Writer', BINDING: 'hbk' };
  const originalFetch = global.fetch;
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  global.fetch = jest.fn((url, options) => {
    if (url === '/api/books/not-displayed') {
      return Promise.resolve({ ok: true, json: async () => [book] });
    }
    if (url.startsWith('/api/books?')) {
      return Promise.resolve({ ok: true, json: async () => ({ books: [], total: 0, pageCount: 1 }) });
    }
    if (url === '/api/series') {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url === '/api/books/hardcover-book' && options?.method === 'DELETE') {
      return Promise.resolve({ ok: true });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });

  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Manage Undisplayed Books' }));
    expect(await screen.findByText('Hidden Hardcover')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await screen.findByText('All book records are currently eligible for display.');
    expect(global.fetch).toHaveBeenCalledWith('/api/books/hardcover-book', { method: 'DELETE' });
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Hidden Hardcover'));
  } finally {
    global.fetch = originalFetch;
    confirm.mockRestore();
  }
});

test('deletes a book record from the main library', async () => {
  const book = { _uid: 'library-book', Title: 'Example Library Book', Author: 'A. Writer' };
  const originalFetch = global.fetch;
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true);
  let deleted = false;
  global.fetch = jest.fn(async (url, options) => {
    if (url.startsWith('/api/books?')) {
      return { ok: true, json: async () => ({ books: deleted ? [] : [book], total: deleted ? 0 : 1, pageCount: 1 }) };
    }
    if (url === '/api/series') return { ok: true, json: async () => [] };
    if (url === '/api/catalog/authors') return { ok: true, json: async () => [] };
    if (url === '/api/books/library-book' && options?.method === 'DELETE') {
      deleted = true;
      return { ok: true, status: 204 };
    }
    return { ok: true, json: async () => ({}) };
  });

  try {
    render(<App />);
    expect(await screen.findByText('Example Library Book')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Example Library Book from database' }));
    expect(await screen.findByText('0 Books')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith('/api/books/library-book', { method: 'DELETE' });
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Example Library Book'));
  } finally {
    global.fetch = originalFetch;
    confirm.mockRestore();
  }
});

test('lists authors with linked editions alphabetically by surname and shows the selected author works', async () => {
  const authors = [
    { id: 'melville', name: 'Herman Melville', sortName: 'Melville, Herman', wikipediaPageTitle: 'Herman Melville', hasLinkedWorks: true, hasLinkedEditions: true },
    { id: 'dickens', name: 'Charles Dickens', sortName: 'Dickens, Charles', wikipediaPageTitle: 'Charles Dickens', hasLinkedWorks: true, hasLinkedEditions: true },
    { id: 'dickens-duplicate', name: ' Charles  Dickens ', sortName: 'Dickens, Charles', hasLinkedWorks: true, hasLinkedEditions: true },
    { id: 'edition-only', name: 'Edition Only Author', sortName: 'Author, Edition Only', hasLinkedWorks: false, hasLinkedEditions: true },
    { id: 'unlinked', name: 'Unlinked Author', sortName: 'Author, Unlinked', hasLinkedWorks: false, hasLinkedEditions: false }
  ];
  const works = [{
    id: 'work-1',
    title: 'Great Expectations',
    releaseDate: '1861',
    sourceUrl: 'https://en.wikipedia.org/wiki/Great_Expectations',
    authors: [authors[2]],
    books: []
  }];
  const originalFetch = global.fetch;
  global.fetch = jest.fn((url) => {
    if (url === '/api/catalog/authors') return Promise.resolve({ ok: true, json: async () => authors });
    if (url === '/api/catalog/works') return Promise.resolve({ ok: true, json: async () => works });
    if (url === '/api/catalog/wikipedia/summary?pageTitle=Charles%20Dickens') {
      return Promise.resolve({ ok: true, json: async () => ({ extract: 'Biography', thumbnail: 'dickens.jpg' }) });
    }
    if (url === '/api/series') return Promise.resolve({ ok: true, json: async () => [] });
    if (url.startsWith('/api/books?')) {
      return Promise.resolve({ ok: true, json: async () => ({ books: [], total: 0, pageCount: 1 }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });

  try {
    render(<App />);
    expect(screen.getByLabelText('Sort:')).toHaveValue('author-asc');
    const authorSelect = await screen.findByLabelText('Authors:');
    const options = within(authorSelect).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['Select an author', 'Charles Dickens', 'Herman Melville']);

    fireEvent.change(authorSelect, { target: { value: 'dickens' } });
    expect(await screen.findAllByText('Great Expectations')).not.toHaveLength(0);
    expect(await screen.findByAltText('Charles Dickens')).toHaveAttribute('src', 'dickens.jpg');
  } finally {
    global.fetch = originalFetch;
  }
});
