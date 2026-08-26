import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrendChip } from '../pages/ManagementAccountReport';

describe('TrendChip', () => {
  test('missing data renders a neutral dash rather than a misleading color', () => {
    render(<TrendChip change={undefined} pctChange={undefined} />);
    const el = screen.getByText('—');
    expect(el.style.color).toBe('var(--color-text-muted)');
  });

  test('a null pctChange also renders the neutral dash', () => {
    render(<TrendChip change={100} pctChange={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  describe('favorableDirection="up" (the default, correct for revenue/profit/cash)', () => {
    test('a rise shows as success (green), with an up arrow', () => {
      render(<TrendChip change={500} pctChange={12} />);
      const el = screen.getByText('▲ 12.0%');
      expect(el.style.color).toBe('var(--color-success)');
    });

    test('a fall shows as danger (red), with a down arrow', () => {
      render(<TrendChip change={-500} pctChange={-8} />);
      const el = screen.getByText('▼ 8.0%');
      expect(el.style.color).toBe('var(--color-danger)');
    });
  });

  // The exact property this file's own comment exists to guard: "up"
  // isn't always good. A rising expense line needs the opposite
  // coloring from a rising revenue line, and this is the mechanism that
  // makes that possible for any future caller that needs it.
  describe('favorableDirection="down" (for a metric like an expense line, where less is better)', () => {
    test('a rise shows as danger (red) - more expense is bad news, not good', () => {
      render(<TrendChip change={500} pctChange={15} favorableDirection="down" />);
      const el = screen.getByText('▲ 15.0%');
      expect(el.style.color).toBe('var(--color-danger)');
    });

    test('a fall shows as success (green) - spending less is good news here', () => {
      render(<TrendChip change={-500} pctChange={-15} favorableDirection="down" />);
      const el = screen.getByText('▼ 15.0%');
      expect(el.style.color).toBe('var(--color-success)');
    });
  });

  test('a change too small to matter (under the 0.5% threshold) is colored neutral, even though the arrow still reflects its tiny direction', () => {
    render(<TrendChip change={0.001} pctChange={0.1} />);
    const el = screen.getByText('▲ 0.1%');
    expect(el.style.color).toBe('var(--color-text-muted)');
  });

  test('the percentage shown is always the absolute value, with the sign conveyed by the arrow instead', () => {
    render(<TrendChip change={-1000} pctChange={-25} />);
    expect(screen.getByText('▼ 25.0%')).toBeInTheDocument();
    expect(screen.queryByText('▼ -25.0%')).not.toBeInTheDocument();
  });
});
