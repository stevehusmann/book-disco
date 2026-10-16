import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
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
});