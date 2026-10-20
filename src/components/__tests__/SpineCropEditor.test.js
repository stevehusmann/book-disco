import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SpineCropEditor from '../SpineCropEditor';

describe('SpineCropEditor save feedback', () => {
  test('shows saved state for each book and the current session total', () => {
    const books = [
      { ISBN: 'saved-book', Title: 'Saved Book', SeriesId: 'PCD', SpineCrop: { src: '/cover.jpg' } },
      { ISBN: 'new-book', Title: 'New Book', SeriesId: 'PCD' }
    ];

    render(
      <SpineCropEditor
        books={books}
        setBooks={jest.fn()}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );

    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Crops saved: 1 / 2');
    expect(screen.getByRole('option', { name: /Saved Book.*crop saved/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /New Book.*no crop/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate Preview' })).toBeDisabled();
    expect(screen.queryByText('Upload file')).not.toBeInTheDocument();
  });

  test('routes direct image URLs through the same-origin image proxy', () => {
    render(
      <SpineCropEditor
        books={[]}
        setBooks={jest.fn()}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );

    fireEvent.click(screen.getByLabelText('Direct image URL'));
    fireEvent.change(screen.getByPlaceholderText('https://example.com/spine.jpg'), {
      target: { value: 'https://images.example.org/spine.jpg' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    expect(screen.getByAltText('Spine crop source loader').src).toContain('/api/image-proxy?url=');
    expect(screen.getByRole('button', { name: 'Generate Preview' })).toBeDisabled();
  });

  test('shows the selected book cover beside the spine crop preview', () => {
    const books = [
      { ISBN: 'preview-book', Title: 'Preview Book', Image: '/preview-cover.jpg', SeriesId: 'PCD' }
    ];

    render(
      <SpineCropEditor
        books={books}
        setBooks={jest.fn()}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );

    fireEvent.change(screen.getByLabelText('PCD Book'), { target: { value: 'preview-book' } });

    expect(screen.getByLabelText('Book preview with spine and cover')).toBeInTheDocument();
    expect(screen.getByAltText('Preview Book cover')).toHaveAttribute('src', '/preview-cover.jpg');
    expect(screen.getByText('Select crop')).toBeInTheDocument();
  });

  test('uses pagination to size the generated spine preview', () => {
    const books = [
      { ISBN: 'preview-book', Title: 'Preview Book', PAGINATION: 300, SeriesId: 'PCD' }
    ];
    const { container, rerender } = render(
      <SpineCropEditor
        books={books}
        setBooks={jest.fn()}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );

    fireEvent.change(screen.getByLabelText('PCD Book'), { target: { value: 'preview-book' } });
    const previewSpine = container.querySelector('.spine-crop-preview-spine');
    const initialWidth = Number.parseFloat(previewSpine.style.width);
    expect(initialWidth).toBeGreaterThan(14);

    const updatedBook = { ...books[0], PAGINATION: 600 };
    rerender(
      <SpineCropEditor
        books={[updatedBook]}
        setBooks={jest.fn()}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );
    expect(Number.parseFloat(container.querySelector('.spine-crop-preview-spine').style.width)).toBeGreaterThan(initialWidth);
  });

  test('provides source image zoom controls', () => {
    render(
      <SpineCropEditor
        books={[]}
        setBooks={jest.fn()}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Zoom source image in' }));
    expect(screen.getByText('Source image zoom: 125%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom source image out' }));
    expect(screen.getByText('Source image zoom: 100%')).toBeInTheDocument();
  });

  test('filters PCD books by title, author, and identifier', () => {
    const books = [
      { ISBN: 'first-book', Title: 'First Book', Author: 'Jane Author', SeriesId: 'PCD' },
      { ISBN: 'second-book', Title: 'Second Book', Author: 'John Writer', SeriesId: 'PCD' }
    ];

    render(
      <SpineCropEditor
        books={books}
        setBooks={jest.fn()}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );

    fireEvent.change(screen.getByLabelText('Search PCD books'), { target: { value: 'jane' } });

    expect(screen.getByRole('option', { name: /First Book.*Jane Author/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Second Book/ })).not.toBeInTheDocument();
  });

  test('deletes the selected book record after confirmation', async () => {
    const books = [
      { _uid: 'orphan-book', ISBN: 'orphan-book', Title: 'Orphan Book', SeriesId: 'PCD' },
      { _uid: 'kept-book', ISBN: 'kept-book', Title: 'Kept Book', SeriesId: 'PCD' }
    ];
    const setBooks = jest.fn();
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <SpineCropEditor
        books={books}
        setBooks={setBooks}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );
    fireEvent.change(screen.getByLabelText('PCD Book'), { target: { value: 'orphan-book' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Book Record' }));

    await waitFor(() => expect(screen.getByText('Deleted Orphan Book from the library.')).toBeInTheDocument());
    expect(confirmSpy).toHaveBeenCalledWith('Permanently delete "Orphan Book" from the library?');
    expect(global.fetch).toHaveBeenCalledWith('/api/books/orphan-book', { method: 'DELETE' });
    const updateBooks = setBooks.mock.calls[0][0];
    expect(updateBooks(books)).toEqual([books[1]]);

    confirmSpy.mockRestore();
    global.fetch = originalFetch;
  });
});