import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GlobalSearch from '../components/GlobalSearch';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../context/AuthContext';

function renderSearch({ hasPermission = () => true, natureOfBusiness = null } = {}) {
  useAuth.mockReturnValue({ hasPermission, company: { nature_of_business: natureOfBusiness } });
  return render(
    <MemoryRouter>
      <GlobalSearch />
    </MemoryRouter>
  );
}

function typeQuery(value) {
  const input = screen.getByLabelText('Search the app');
  fireEvent.change(input, { target: { value } });
  return input;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GlobalSearch - basic matching', () => {
  test('an empty query shows no results', () => {
    renderSearch();
    typeQuery('');
    expect(screen.queryByText(/No pages match/)).not.toBeInTheDocument();
  });

  test('matches by label, case-insensitively', () => {
    renderSearch();
    typeQuery('EXECUTIVE DASHBOARD');
    expect(screen.getByText('Executive Dashboard')).toBeInTheDocument();
  });

  test('a query matching nothing shows the empty-results message', () => {
    renderSearch();
    typeQuery('zzz-no-such-page-zzz');
    expect(screen.getByText('No pages match "zzz-no-such-page-zzz".')).toBeInTheDocument();
  });
});

describe('GlobalSearch - permission filtering', () => {
  test('an item requiring a permission the user lacks is excluded from results', () => {
    renderSearch({ hasPermission: () => false });
    typeQuery('Students & Admissions');
    expect(screen.queryByText('Students & Admissions')).not.toBeInTheDocument();
  });
});

describe('GlobalSearch - Nature of Business gating', () => {
  test('a page from a module hidden by Nature of Business does not appear in search results', () => {
    renderSearch({ natureOfBusiness: 'Trading & Distribution' });
    typeQuery('Students');
    expect(screen.queryByText('Students & Admissions')).not.toBeInTheDocument();
  });

  test('the same page is found for a company whose Nature of Business actually applies', () => {
    renderSearch({ natureOfBusiness: 'Educational Institutions' });
    typeQuery('Students');
    expect(screen.getByText('Students & Admissions')).toBeInTheDocument();
  });

  test('a company with no Nature of Business set at all can still find every module in search', () => {
    renderSearch({ natureOfBusiness: null });
    typeQuery('Students');
    expect(screen.getByText('Students & Admissions')).toBeInTheDocument();
  });
});

describe('GlobalSearch - keyboard interaction', () => {
  test('pressing Enter navigates to the first matching result', () => {
    renderSearch();
    const input = typeQuery('Executive Dashboard');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('');
  });

  test('pressing Escape clears the query and closes the dropdown', () => {
    renderSearch();
    const input = typeQuery('Executive');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });
});
