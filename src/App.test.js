import { fireEvent, render, screen } from '@testing-library/react';
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
