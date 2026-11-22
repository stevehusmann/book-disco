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

test('shows author Works grouped by type, first edition covers, and the edition summary modal', async () => {
  const originalFetch = global.fetch;
  const onOpenSpineCrop = jest.fn();
  const works = [
    {
      id: 'later',
      title: 'Later Work',
      workType: 'Nonfiction',
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
      workType: 'Novel',
      releaseDate: '1843',
      sourceUrl: 'https://en.wikipedia.org/wiki/A_Christmas_Carol',
      authors: [author],
      books: [
        { uid: 'edition-first', title: 'Earlier Work First Edition', isbn: '111', image: 'first-cover.jpg', publicationDate: '1843', book: { SeriesId: 'PCD', PublicationYear: '1843/1845' } },
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
    render(
      <AuthorWorksView
        author={author}
        onOpenSpineCrop={onOpenSpineCrop}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );

    expect(await screen.findByText('Author biography.')).toBeInTheDocument();
    expect(screen.getByText('Author biography.')).toHaveClass('is-collapsed');
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }));
    expect(screen.getByText('Author biography.')).toHaveClass('is-expanded');
    const authorSection = screen.getByLabelText('Works by Charles Dickens');
    const novelSection = within(authorSection).getByLabelText('Novel works by Charles Dickens');
    const nonfictionSection = within(authorSection).getByLabelText('Nonfiction works by Charles Dickens');
    const workButtons = within(novelSection).getAllByRole('button', { name: /Open/ });
    expect(workButtons[0]).toHaveAccessibleName('Open Earlier Work, 1843');
    expect(within(nonfictionSection).getAllByRole('button', { name: 'Open Later Work, 1859' })).toHaveLength(2);
    expect(within(workButtons[0]).getByAltText('Earlier Work')).toHaveAttribute('src', 'first-cover.jpg');

    fireEvent.click(workButtons[0]);
    expect(await screen.findByText('Work summary.')).toBeInTheDocument();
    expect(screen.getByText('Linked editions (2)')).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(dialog.querySelectorAll('.book')).toHaveLength(2);
    expect(dialog.querySelectorAll('.book-container-no-hover')).toHaveLength(2);
    expect(within(dialog).getByText('Work publication year: 1843/1845')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Earlier Work First Edition')).not.toHaveLength(0);
    expect(within(dialog).getAllByText('Earlier Work Reprint')).not.toHaveLength(0);
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Edit' })[0]);
    expect(await screen.findByText('Edit Book')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Spine Crop Tool' }));
    expect(onOpenSpineCrop).toHaveBeenCalledWith('edition-first');
    expect(within(dialog).getByText('ISBN 111')).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/catalog/wikipedia/summary?pageTitle=A%20Christmas%20Carol'));
  } finally {
    global.fetch = originalFetch;
  }
});

test('edits author details and recategorizes a Work using saved category types', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  const work = {
    id: 'work-edit',
    title: 'The Raven',
    workType: 'Novel',
    releaseDate: '1845',
    authors: [author],
    books: []
  };
  global.fetch = jest.fn(async (url, options = {}) => {
    calls.push({ url, options });
    if (url === '/api/catalog/works') return { ok: true, json: async () => [work] };
    if (url === '/api/catalog/work-types') return { ok: true, json: async () => ['Novel', 'Poetry'] };
    if (url.startsWith('/api/catalog/wikipedia/summary')) return { ok: true, json: async () => ({}) };
    if (url === '/api/catalog/authors/author-1' || url === '/api/catalog/works/work-edit') {
      return { ok: true, json: async () => ({}) };
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  try {
    render(<AuthorWorksView author={author} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit author' }));
    fireEvent.change(screen.getByLabelText('Author name'), { target: { value: 'Edgar Allan Poe' } });
    fireEvent.change(screen.getByLabelText('Sort name'), { target: { value: 'Poe, Edgar Allan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save author' }));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({
      url: '/api/catalog/authors/author-1',
      options: expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ authorIds: ['author-1'], name: 'Edgar Allan Poe', sortName: 'Poe, Edgar Allan' })
      })
    })));

    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit The Raven category' }))[0]);
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Poetry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save category' }));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({
      url: '/api/catalog/works/work-edit',
      options: expect.objectContaining({ method: 'PUT', body: JSON.stringify({ workType: 'Poetry' }) })
    })));
  } finally {
    global.fetch = originalFetch;
  }
});
