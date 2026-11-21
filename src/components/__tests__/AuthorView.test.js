import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import AuthorView from '../AuthorView';

test('groups mobile book tiles by author in a two-column grid', () => {
  const books = [
    { _uid: 'jane-1', Title: 'First Jane Book', Author: 'Doe, Jane', SeriesId: 'OWC', Image: 'jane-1.jpg' },
    { _uid: 'jane-2', Title: 'Second Jane Book', Author: 'Doe, Jane', SeriesId: 'OWC', Image: 'jane-2.jpg' },
    { _uid: 'ann-1', Title: 'Ann Book', Author: 'Smith, Ann', SeriesId: 'BNC', Image: 'ann.jpg' }
  ];

  render(<AuthorView books={books} />);

  const janeGroup = screen.getByLabelText('Books by Jane Doe');
  expect(within(janeGroup).getByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument();
  expect(janeGroup.querySelectorAll('.author-mobile-col')).toHaveLength(2);
  expect(within(janeGroup).getByRole('img', { name: 'First Jane Book' })).toBeInTheDocument();
  expect(within(janeGroup).getByRole('img', { name: 'Second Jane Book' })).toBeInTheDocument();

  const annGroup = screen.getByLabelText('Books by Ann Smith');
  expect(within(annGroup).getByRole('img', { name: 'Ann Book' })).toBeInTheDocument();
  expect(annGroup.querySelectorAll('.author-mobile-col')).toHaveLength(1);
});

test('offers the spine crop tool from an eligible book edit dialog', () => {
  const onOpenSpineCrop = jest.fn();
  render(
    <AuthorView
      books={[{ _uid: 'pcd-book', Title: 'PCD Book', Author: 'Doe, Jane', SeriesId: 'PCD' }]}
      seriesOptions={[{ id: 'PCD', spineMode: 'pcd-crop' }]}
      onOpenSpineCrop={onOpenSpineCrop}
    />
  );

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Open Spine Crop Tool' }));

  expect(onOpenSpineCrop).toHaveBeenCalledWith('pcd-book');
});
