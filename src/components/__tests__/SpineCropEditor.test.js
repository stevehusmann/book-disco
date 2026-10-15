import React from 'react';
import { render, screen } from '@testing-library/react';
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
  });
});