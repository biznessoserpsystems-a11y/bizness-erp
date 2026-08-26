import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from '../pages/Register';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ registerCompany: vi.fn() }),
}));
vi.mock('../context/ThemeContext', () => ({
  useLoginSafeStyle: () => ({}),
}));
vi.mock('../services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

function renderRegister() {
  return render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
}

// The specific consistency property that drifted apart between the two
// pages: Login.jsx wraps its brand-panel logo in a white badge card
// (auth-brand-logo-badge), but Register.jsx was never given the same
// wrapper when the logo was first applied to both pages, leaving the
// logo sitting directly on the dark brand panel background on this
// page only. Caught by comparing the two pages' actual source directly
// rather than assuming they'd stayed in sync.
describe('Register - brand panel logo consistency with Login', () => {
  test('the brand-panel logo is wrapped in the same white badge card Login.jsx uses', () => {
    renderRegister();
    const logo = screen.getAllByAltText('Bizness-OS')[0];
    expect(logo.closest('.auth-brand-logo-badge')).not.toBeNull();
  });

  test('the brand-panel logo itself still renders the real logo file', () => {
    renderRegister();
    const logo = screen.getAllByAltText('Bizness-OS')[0];
    expect(logo.getAttribute('src')).toBe('/logo-full.png');
  });
});
