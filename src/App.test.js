import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('opens series management settings', async () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Manage Series' }));
  expect(await screen.findByLabelText('Height / width ratio')).toBeInTheDocument();
  expect(screen.getByLabelText('Spine rendering')).toBeInTheDocument();
});
