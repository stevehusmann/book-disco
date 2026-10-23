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

  test('routes direct image URLs through the proxy and keeps a recent URL option', () => {
    window.localStorage.removeItem('spineCropRecentDirectUrls');
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
    expect(screen.getByRole('option', { name: 'https://images.example.org/spine.jpg' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Recent direct image URLs'), {
      target: { value: 'https://images.example.org/spine.jpg' }
    });
    expect(screen.getByPlaceholderText('https://example.com/spine.jpg')).toHaveValue('https://images.example.org/spine.jpg');
    expect(JSON.parse(window.localStorage.getItem('spineCropRecentDirectUrls'))).toEqual([
      'https://images.example.org/spine.jpg'
    ]);
  });

  test('keeps the recent URL dropdown visible when there are no saved URLs', () => {
    window.localStorage.removeItem('spineCropRecentDirectUrls');
    render(
      <SpineCropEditor
        books={[]}
        setBooks={jest.fn()}
        seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      />
    );

    fireEvent.click(screen.getByLabelText('Direct image URL'));

    expect(screen.getByLabelText('Recent direct image URLs')).toBeDisabled();
    expect(screen.getByRole('option', { name: 'No recent URLs yet' })).toBeInTheDocument();
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
    const previewBook = screen.getByTestId('spine-crop-preview-book');
    expect(previewBook).toHaveClass('book', 'series-pcd');
    expect(previewBook).toHaveStyle('width: 226px');
    expect(previewBook).toHaveStyle({
      transform: 'rotateY(30deg) translateZ(30px) translateX(0) translateZ(-47px)',
      height: '339px'
    });
    expect(previewBook.querySelector('.spine-crop-preview-front')).toHaveStyle('transform: translateZ(46px)');
  });

  test('matches the main book aspect ratio for built-in and configured series', () => {
    const cases = [
      { seriesId: 'OWC', options: [{ id: 'OWC', spineMode: 'pcd-crop' }], expectedWidth: 208, expectedHeight: 208 * (7.6875 / 5.1875) },
      { seriesId: 'BNC', options: [{ id: 'BNC', spineMode: 'pcd-crop' }], expectedWidth: 210, expectedHeight: 210 * (8 / 5.25) },
      { seriesId: 'PCD', options: [{ id: 'PCD', spineMode: 'pcd-crop' }], expectedWidth: 226, expectedHeight: 339 },
      { seriesId: 'CUSTOM', options: [{ id: 'CUSTOM', spineMode: 'pcd-crop', heightWidthRatio: 1.8 }], expectedWidth: 210, expectedHeight: 378 }
    ];
    const { container, rerender } = render(null);

    cases.forEach(({ seriesId, options, expectedWidth, expectedHeight }) => {
      rerender(
        <SpineCropEditor
          books={[{ ISBN: 'preview-book', Title: 'Preview Book', SeriesId: seriesId }]}
          setBooks={jest.fn()}
          seriesOptions={options}
        />
      );
      fireEvent.change(screen.getByLabelText('PCD Book'), { target: { value: 'preview-book' } });
      const previewBook = container.querySelector('.spine-crop-preview-book');
      expect(Number.parseFloat(previewBook.style.width)).toBe(expectedWidth);
      expect(Number.parseFloat(previewBook.style.height)).toBeCloseTo(expectedHeight);
    });

  });

  test('loads the saved direct source and restores its crop as an editable selection', async () => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      clearRect: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
      translate: jest.fn(),
      rotate: jest.fn(),
      drawImage: jest.fn()
    }));
    HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/jpeg;base64,preview');
    const savedCrop = {
      src: '/api/image-proxy?url=https%3A%2F%2Fimages.example.org%2Fsaved-spine.jpg',
      mode: 'rect',
      x: 40,
      y: 100,
      width: 80,
      height: 600,
      editorRotation: 0,
      outputRotation: 90
    };

    try {
      render(
        <SpineCropEditor
          books={[{ ISBN: 'saved-direct-book', Title: 'Saved Direct Book', SeriesId: 'PCD', SpineCrop: savedCrop }]}
          setBooks={jest.fn()}
          seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
        />
      );

      fireEvent.change(screen.getByLabelText('PCD Book'), { target: { value: 'saved-direct-book' } });
      const sourceImage = screen.getByAltText('Spine crop source loader');
      expect(sourceImage.src).toContain('/api/image-proxy?url=');
      expect(screen.getByPlaceholderText('https://example.com/spine.jpg')).toHaveValue('https://images.example.org/saved-spine.jpg');

      Object.defineProperties(sourceImage, {
        naturalWidth: { configurable: true, value: 400 },
        naturalHeight: { configurable: true, value: 800 },
        complete: { configurable: true, value: true }
      });
      Object.defineProperty(document.querySelector('.spine-crop-stage'), 'clientWidth', {
        configurable: true,
        value: 300
      });
      fireEvent.load(sourceImage);

      expect(await screen.findByText('x: 40, y: 100, w: 80, h: 600')).toBeInTheDocument();
      expect(document.querySelector('.spine-crop-rect')).toBeInTheDocument();
      expect(screen.getByText('Rotate preview: 90 degrees')).toBeInTheDocument();
      await waitFor(() => expect(document.querySelector('.spine-crop-preview-spine').style.backgroundImage)
        .toContain('data:image/jpeg;base64,preview'));
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
    }
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