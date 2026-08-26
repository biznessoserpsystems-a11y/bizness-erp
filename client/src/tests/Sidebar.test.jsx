import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../context/ThemeContext', () => ({
  getSidebarLogoSrc: (variant) => `/logo-${variant === 'mark' ? 'mark' : 'full'}-white.png`,
}));

import { useAuth } from '../context/AuthContext';

function renderSidebar({ hasPermission = () => true, natureOfBusiness = null } = {}) {
  useAuth.mockReturnValue({ hasPermission, company: { nature_of_business: natureOfBusiness } });
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Sidebar mobileOpen={true} onClose={() => {}} railOnly={false} onExpandRail={() => {}} />
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('Sidebar - Nature of Business gating', () => {
  test('a company with no nature_of_business set sees every module, including gated ones', () => {
    renderSidebar({ natureOfBusiness: null });
    expect(screen.getByText('School Management')).toBeInTheDocument();
    expect(screen.getByText('Manufacturing')).toBeInTheDocument();
  });

  test('School Management is hidden entirely for a company outside education, even with full permissions', () => {
    renderSidebar({ natureOfBusiness: 'Trading & Distribution', hasPermission: () => true });
    expect(screen.queryByText('School Management')).not.toBeInTheDocument();
  });

  test('School Management is shown for an actual educational company', () => {
    renderSidebar({ natureOfBusiness: 'Educational Institutions' });
    expect(screen.getByText('School Management')).toBeInTheDocument();
  });
});

describe('Sidebar - permission filtering', () => {
  test('a section where only some items require a permission the user lacks still shows the permission-free items', () => {
    // School Management's Students & Admissions item requires
    // school.view; its Workspace item has no permission requirement at
    // all - so denying school.view alone should NOT hide the section.
    renderSidebar({
      natureOfBusiness: 'Educational Institutions',
      hasPermission: (code) => code !== 'school.view',
    });
    const section = screen.getByText('School Management').closest('.sidebar-group');
    expect(within(section).getByText('Workspace')).toBeInTheDocument();
    expect(within(section).queryByText('Students & Admissions')).not.toBeInTheDocument();
  });

  test('a fully denied permission set still leaves permission-free items (like Overview) visible', () => {
    renderSidebar({ hasPermission: () => false });
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });
});

describe('Sidebar - search filtering', () => {
  test('typing in the search box filters items by label, case-insensitively', () => {
    renderSidebar();
    fireEvent.change(screen.getByPlaceholderText('Search menu…'), { target: { value: 'EXECUTIVE DASHBOARD' } });
    expect(screen.getByText('Executive Dashboard', { selector: 'a' })).toBeInTheDocument();
    expect(screen.queryByText('School Management')).not.toBeInTheDocument();
  });

  test('a search query matching no items or section names shows nothing', () => {
    renderSidebar();
    fireEvent.change(screen.getByPlaceholderText('Search menu…'), { target: { value: 'zzz-no-such-thing-zzz' } });
    expect(screen.queryByText('Overview')).not.toBeInTheDocument();
  });
});
