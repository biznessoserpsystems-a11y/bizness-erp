import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ThemeProvider, useTheme, useLoginSafeStyle, LOGIN_SAFE_ACCENTS, ACCENT_PRESETS, getSidebarLogoSrc } from '../context/ThemeContext';

function renderWithProvider() {
  return renderHook(
    () => ({ theme: useTheme(), style: useLoginSafeStyle() }),
    { wrapper: ThemeProvider }
  );
}

describe('LOGIN_SAFE_ACCENTS', () => {
  test('every accent preset is a real key in ACCENT_PRESETS', () => {
    LOGIN_SAFE_ACCENTS.forEach((key) => {
      expect(ACCENT_PRESETS[key]).toBeDefined();
    });
  });

  test('includes the presets confirmed by actually rendering the logo against them', () => {
    expect(LOGIN_SAFE_ACCENTS).toEqual(
      expect.arrayContaining(['ocean', 'indigo', 'slate', 'teal', 'sapphire', 'midnight'])
    );
  });

  test('excludes presets where the gold logo text loses contrast against a similarly warm background', () => {
    expect(LOGIN_SAFE_ACCENTS).not.toContain('amber');
    expect(LOGIN_SAFE_ACCENTS).not.toContain('bronze');
  });

  test('excludes presets that clash outright with the logo\'s blue/gold palette', () => {
    ['crimson', 'burgundy', 'plum', 'terracotta', 'rust'].forEach((key) => {
      expect(LOGIN_SAFE_ACCENTS).not.toContain(key);
    });
  });
});

describe('useLoginSafeStyle', () => {
  test('returns no override when the current accent is already logo-safe', () => {
    const { result } = renderWithProvider();
    act(() => result.current.theme.setAccent('sapphire'));
    expect(result.current.style).toEqual({});
  });

  test('returns no override for every logo-safe accent, not just one', () => {
    const { result } = renderWithProvider();
    LOGIN_SAFE_ACCENTS.forEach((key) => {
      act(() => result.current.theme.setAccent(key));
      expect(result.current.style).toEqual({});
    });
  });

  test('overrides to the logo-matched fallback when the current accent is not logo-safe', () => {
    const { result } = renderWithProvider();
    act(() => result.current.theme.setAccent('crimson'));
    expect(result.current.style['--color-primary']).toBe(ACCENT_PRESETS.midnight.vars['--color-primary']);
    expect(result.current.style['--color-primary-dark']).toBe(ACCENT_PRESETS.midnight.vars['--color-primary-dark']);
  });

  test('overrides for every non-logo-safe accent in the full catalog, not just one example', () => {
    const { result } = renderWithProvider();
    Object.keys(ACCENT_PRESETS)
      .filter((key) => !LOGIN_SAFE_ACCENTS.includes(key))
      .forEach((key) => {
        act(() => result.current.theme.setAccent(key));
        expect(result.current.style['--color-primary']).toBe(ACCENT_PRESETS.midnight.vars['--color-primary']);
      });
  });

  test('reacts to the accent changing while already rendered, not just on first mount', () => {
    const { result } = renderWithProvider();
    act(() => result.current.theme.setAccent('sapphire'));
    expect(result.current.style).toEqual({});
    act(() => result.current.theme.setAccent('crimson'));
    expect(result.current.style['--color-primary']).toBe(ACCENT_PRESETS.midnight.vars['--color-primary']);
    act(() => result.current.theme.setAccent('ocean'));
    expect(result.current.style).toEqual({});
  });
});

describe('getSidebarLogoSrc', () => {
  // The actual property that matters now: the sidebar logo is a single,
  // fixed white variant - the function no longer takes a secondary
  // color at all, since white was chosen specifically because
  // recoloring the wordmark to match each sidebar's own hue could put
  // it in the same hue family as the background it sits on, a real
  // legibility risk confirmed against actual screenshots of the
  // deployed sidebar. White was verified separately to read cleanly
  // against every one of the nine dark presets.
  test('returns the white wordmark variant', () => {
    expect(getSidebarLogoSrc('full')).toBe('/logo-full-white.png');
  });

  test('distinguishes the full wordmark from the compact mark', () => {
    expect(getSidebarLogoSrc('full')).toBe('/logo-full-white.png');
    expect(getSidebarLogoSrc('mark')).toBe('/logo-mark-white.png');
  });

  test('treats anything other than "mark" as the full wordmark, rather than erroring', () => {
    expect(getSidebarLogoSrc(undefined)).toBe('/logo-full-white.png');
    expect(getSidebarLogoSrc('typo')).toBe('/logo-full-white.png');
  });
});
