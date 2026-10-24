import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AuthorWorksView, { getSurname } from '../AuthorWorksView';

const author = {
  id: 'author-1',
  name: 'Charles Dickens',
  sortName: 'Dickens, Charles',
  wikipediaPageTitle: 'Charles Dickens'
};

test('sorts authors by surname', () => {
  expect(getSurname({ name: 'Charles Dickens', sortName: 'Dickens, Charles' })).toBe('Dickens');
  expect(getSurname({ name: 'Herman Melville' })).toBe('Melville');
});

test('shows the author biography, chronological Works, first edition covers, and edition summary modal', async () => {
  const originalFetch = global.fetch;
  const works = [
    {
      id: 'later',
      title: 'Later Work',
      releaseDate: '1859',
      sourceUrl: 'https://en.wikipedia.org/wiki/A_Tale_of_Two_Cities',
      authors: [author],
      books: [
        { uid: 'edition-later', title: 'Later Work', isbn: '222', image: 'later-cover.jpg', publicationDate: '1900' }
      ]
    },
    {
      id: 'earlier',
      title: 'Earlier Work',
      releaseDate: '1843',
      sourceUrl: 'https://en.wikipedia.org/wiki/A_Christmas_Carol',
      authors: [author],
      books: [
        { uid: 'edition-first', title: 'Earlier Work First Edition', isbn: '111', image: 'first-cover.jpg', publicationDate: '1843' },
        { uid: 'edition-reprint', title: 'Earlier Work Reprint', isbn: '333', image: 'reprint-cover.jpg', publicationDate: '1900' }
      ]
    }
  ];
  global.fetch = jest.fn(async (url) => {
    if (url === '/api/catalog/works') {
      return { ok: true, json: async () => works };
    }
    if (url === '/api/catalog/wikipedia/summary?pageTitle=Charles%20Dickens') {
      return { ok: true, json: async () => ({ extract: 'Author biography.', thumbnail: 'author.jpg', url: 'https://en.wikipedia.org/wiki/Charles_Dickens' }) };
    }
    if (url === '/api/catalog/wikipedia/summary?pageTitle=A%20Christmas%20Carol') {
      return { ok: true, json: async () => ({ extract: 'Work summary.', url: 'https://en.wikipedia.org/wiki/A_Christmas_Carol' }) };
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  try {
    render(<AuthorWorksView author={author} />);

    expect(await screen.findByText('Author biography.')).toBeInTheDocument();
    expect(screen.getByText('Author biography.')).toHaveClass('is-collapsed');
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    expect(screen.getByText('Author biography.')).toHaveClass('is-expanded');
    const authorSection = screen.getByLabelText('Works by Charles Dickens');
    const workButtons = within(authorSection).getAllByRole('button', { name: /Open/ });
    expect(workButtons[0]).toHaveAccessibleName('Open Earlier Work, 1843');
    expect(workButtons[1]).toHaveAccessibleName('Open Later Work, 1859');
    expect(within(workButtons[0]).getByAltText('Earlier Work')).toHaveAttribute('src', 'first-cover.jpg');

    fireEvent.click(workButtons[0]);
    expect(await screen.findByText('Work summary.')).toBeInTheDocument();
    expect(screen.getByText('Linked editions (2)')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelectorAll('.book')).toHaveLength(2);
    expect(within(dialog).getByText('Earlier Work First Edition')).toBeInTheDocument();
    expect(within(dialog).getByText('Earlier Work Reprint')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(dialog).getByText('ISBN 111')).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/catalog/wikipedia/summary?pageTitle=A%20Christmas%20Carol'));
  } finally {
    global.fetch = originalFetch;
  }
});
