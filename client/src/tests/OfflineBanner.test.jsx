import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import OfflineBanner from '../components/OfflineBanner';

function setNavigatorOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true, writable: true });
}

describe('OfflineBanner', () => {
  test('renders nothing while online', () => {
    setNavigatorOnline(true);
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  test('renders a visible message while offline', () => {
    setNavigatorOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toHaveTextContent("You're offline");
  });

  // The real property worth checking: the message must be honest about
  // what it can and can't do — it should say plainly that changes can't
  // be saved, not imply anything about queuing or syncing later, since
  // this app deliberately doesn't do that for financial data.
  test('is explicit that changes cannot be saved, not vague about it', () => {
    setNavigatorOnline(false);
    render(<OfflineBanner />);
    expect(screen.getByRole('status')).toHaveTextContent(/changes can't be saved/i);
  });
});
