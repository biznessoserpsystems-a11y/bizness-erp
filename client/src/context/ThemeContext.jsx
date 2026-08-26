import { createContext, useContext, useEffect, useState } from 'react';

const MODE_KEY = 'bizness-os:theme-mode';           // 'light' | 'dark' | 'system'
const ACCENT_KEY = 'bizness-os:theme-accent';        // preset key, see ACCENT_PRESETS
const SECONDARY_KEY = 'bizness-os:theme-secondary';  // preset key, see SECONDARY_PRESETS

// Every preset keeps the same "one primary + one restrained accent" design
// philosophy from the original palette — these are alternate color pairs,
// not a free-for-all color picker, so nothing a person picks here can end
// up looking inconsistent with the rest of the app's typography/spacing/shape.
export const ACCENT_PRESETS = {
  cedi: {
    label: 'Cedi Green',
    swatch: '#0B6E4F',
    vars: { '--color-primary': '#0B6E4F', '--color-primary-dark': '#08543C', '--color-gold': '#C9971F', '--color-gold-dark': '#A87C15' },
  },
  ocean: {
    label: 'Ocean Blue',
    swatch: '#1D5A8C',
    vars: { '--color-primary': '#1D5A8C', '--color-primary-dark': '#14425F', '--color-gold': '#D48A3C', '--color-gold-dark': '#B06F27' },
  },
  indigo: {
    label: 'Royal Indigo',
    swatch: '#4A3F8C',
    vars: { '--color-primary': '#4A3F8C', '--color-primary-dark': '#362C68', '--color-gold': '#C9971F', '--color-gold-dark': '#A87C15' },
  },
  terracotta: {
    label: 'Terracotta',
    swatch: '#B3541E',
    vars: { '--color-primary': '#B3541E', '--color-primary-dark': '#8A3F15', '--color-gold': '#6B7B2A', '--color-gold-dark': '#52611E' },
  },
  slate: {
    label: 'Charcoal Slate',
    swatch: '#3D4550',
    vars: { '--color-primary': '#3D4550', '--color-primary-dark': '#2A3038', '--color-gold': '#C9971F', '--color-gold-dark': '#A87C15' },
  },
  crimson: {
    label: 'Crimson Red',
    swatch: '#9B2A2A',
    vars: { '--color-primary': '#9B2A2A', '--color-primary-dark': '#7A2020', '--color-gold': '#C9971F', '--color-gold-dark': '#A87C15' },
  },
  teal: {
    label: 'Deep Teal',
    swatch: '#0F766E',
    vars: { '--color-primary': '#0F766E', '--color-primary-dark': '#0B5B54', '--color-gold': '#D9A441', '--color-gold-dark': '#B3852F' },
  },
  amber: {
    label: 'Amber Mustard',
    swatch: '#B7791F',
    vars: { '--color-primary': '#B7791F', '--color-primary-dark': '#8F5E15', '--color-gold': '#4A5D23', '--color-gold-dark': '#374519' },
  },
  plum: {
    label: 'Royal Plum',
    swatch: '#6B2D5C',
    vars: { '--color-primary': '#6B2D5C', '--color-primary-dark': '#4F2044', '--color-gold': '#C9971F', '--color-gold-dark': '#A87C15' },
  },
  sapphire: {
    label: 'Sapphire Blue',
    swatch: '#1E4E8C',
    vars: { '--color-primary': '#1E4E8C', '--color-primary-dark': '#153A69', '--color-gold': '#C9971F', '--color-gold-dark': '#A87C15' },
  },
  burgundy: {
    label: 'Burgundy Wine',
    swatch: '#7A1F3D',
    vars: { '--color-primary': '#7A1F3D', '--color-primary-dark': '#5C1730', '--color-gold': '#C9971F', '--color-gold-dark': '#A87C15' },
  },
  bronze: {
    label: 'Antique Bronze',
    swatch: '#8C5A2B',
    vars: { '--color-primary': '#8C5A2B', '--color-primary-dark': '#6B4420', '--color-gold': '#2D5F4F', '--color-gold-dark': '#224A3D' },
  },
  olive: {
    label: 'Olive Grove',
    swatch: '#55672F',
    vars: { '--color-primary': '#55672F', '--color-primary-dark': '#425023', '--color-gold': '#B3541E', '--color-gold-dark': '#8A3F15' },
  },
  midnight: {
    label: 'Midnight Navy',
    swatch: '#1B2A4A',
    vars: { '--color-primary': '#1B2A4A', '--color-primary-dark': '#122036', '--color-gold': '#C9971F', '--color-gold-dark': '#A87C15' },
  },
  rust: {
    label: 'Rust Orange',
    swatch: '#A6461D',
    vars: { '--color-primary': '#A6461D', '--color-primary-dark': '#7E3416', '--color-gold': '#4A5D23', '--color-gold-dark': '#374519' },
  },
};

// The secondary color drives the sidebar/nav background (--color-secondary
// → --color-sidebar-bg). Kept to a separate, deliberately dark-neutral set
// rather than folded into ACCENT_PRESETS above: the sidebar's light text/
// icon colors (--color-sidebar-text, --color-sidebar-icon, etc.) are fixed
// values tuned for a dark background, so every option here stays dark
// enough to keep that same contrast regardless of which one is picked —
// mixing in light options would silently break sidebar readability.
export const SECONDARY_PRESETS = {
  charcoal: { label: 'Warm Charcoal', swatch: '#211E19', vars: { '--color-secondary': '#211E19' } },
  navy: { label: 'Deep Navy', swatch: '#14232F', vars: { '--color-secondary': '#14232F' } },
  espresso: { label: 'Espresso Brown', swatch: '#2B2019', vars: { '--color-secondary': '#2B2019' } },
  graphite: { label: 'Graphite Slate', swatch: '#23262B', vars: { '--color-secondary': '#23262B' } },
  forest: { label: 'Forest Night', swatch: '#16241D', vars: { '--color-secondary': '#16241D' } },
  plum: { label: 'Deep Plum', swatch: '#241826', vars: { '--color-secondary': '#241826' } },
  stone: { label: 'Warm Stone', swatch: '#2B2622', vars: { '--color-secondary': '#2B2622' } },
  indigoNight: { label: 'Indigo Night', swatch: '#1E1B3A', vars: { '--color-secondary': '#1E1B3A' } },
  wine: { label: 'Wine Black', swatch: '#2A1420', vars: { '--color-secondary': '#2A1420' } },
};

// The login/register/forgot/reset-password pages show the real
// Bizness-OS logo prominently, and their brand panel's background
// follows --color-primary the same as the rest of the app - so an
// arbitrary company theme choice (crimson red, olive green, amber)
// can end up directly behind the logo, where a few of these presets
// visibly clash: the gold wordmark loses contrast against a
// similarly warm/gold background (amber, bronze), or the overall
// combination just reads as mismatched with the logo's own blue/gold
// palette (crimson, burgundy, plum, terracotta, rust, olive).
// Verified by rendering the actual logo against every preset's real
// gradient and looking at the result, not by guessing from hex
// codes - the blue-family presets and the one true neutral share the
// logo's own color DNA and keep both the blue and the gold cleanly
// legible; the rest don't.
export const LOGIN_SAFE_ACCENTS = ['ocean', 'indigo', 'slate', 'teal', 'sapphire', 'midnight'];
const LOGIN_FALLBACK_ACCENT = 'midnight';

// The sidebar's own logo (both the full wordmark and the compact rail
// mark) originally had its blue-family pixels hue-shifted per secondary
// color preset, to harmonize with whichever sidebar color a company
// chose. That approach had a real problem, confirmed against actual
// screenshots of the deployed sidebar rather than assumed: recoloring
// the wordmark to match the sidebar's own hue family can put it in the
// same hue family as the background it sits on, which is a genuine
// legibility risk - a purple-shifted wordmark on a similarly dark
// purple sidebar has far less contrast than the same wordmark in white
// would. White was verified directly against every one of the nine
// dark secondary presets and reads cleanly on all of them, so a single
// fixed variant now replaces what used to be nine separate ones. The
// metallic gold ("OS", the small accent dot) is untouched either way -
// only the wordmark's own blue became white.
export function getSidebarLogoSrc(variant) {
  return variant === 'mark' ? '/logo-mark-white.png' : '/logo-full-white.png';
}

const ThemeContext = createContext(null);

function loadMode() {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'light';
  } catch {
    return 'light';
  }
}

function loadAccent() {
  try {
    const raw = localStorage.getItem(ACCENT_KEY);
    return raw && ACCENT_PRESETS[raw] ? raw : 'cedi';
  } catch {
    return 'cedi';
  }
}

function loadSecondary() {
  try {
    const raw = localStorage.getItem(SECONDARY_KEY);
    return raw && SECONDARY_PRESETS[raw] ? raw : 'charcoal';
  } catch {
    return 'charcoal';
  }
}

function resolveEffectiveMode(mode) {
  if (mode !== 'system') return mode;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode, accentKey, secondaryKey) {
  const effective = resolveEffectiveMode(mode);
  document.documentElement.setAttribute('data-theme', effective);

  const accentPreset = ACCENT_PRESETS[accentKey] || ACCENT_PRESETS.cedi;
  const secondaryPreset = SECONDARY_PRESETS[secondaryKey] || SECONDARY_PRESETS.charcoal;
  for (const [prop, value] of Object.entries({ ...accentPreset.vars, ...secondaryPreset.vars })) {
    document.documentElement.style.setProperty(prop, value);
  }
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(loadMode);
  const [accent, setAccentState] = useState(loadAccent);
  const [secondary, setSecondaryState] = useState(loadSecondary);

  useEffect(() => {
    applyTheme(mode, accent, secondary);
  }, [mode, accent, secondary]);

  // React live to OS theme changes when the person has chosen "system".
  useEffect(() => {
    if (mode !== 'system') return undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme(mode, accent, secondary);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [mode, accent, secondary]);

  function setMode(next) {
    setModeState(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* private browsing, etc — just won't persist */ }
  }

  function setAccent(next) {
    setAccentState(next);
    try { localStorage.setItem(ACCENT_KEY, next); } catch { /* not fatal */ }
  }

  function setSecondary(next) {
    setSecondaryState(next);
    try { localStorage.setItem(SECONDARY_KEY, next); } catch { /* not fatal */ }
  }

  return (
    <ThemeContext.Provider value={{
      mode, setMode, accent, setAccent, secondary, setSecondary,
      presets: ACCENT_PRESETS, secondaryPresets: SECONDARY_PRESETS,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

/**
 * For the auth pages only (login, register, forgot/reset password),
 * which show the real logo prominently against a background driven by
 * --color-primary. Returns an inline style object to spread onto the
 * page's own outermost element: empty when the company's chosen accent
 * is already one of the presets confirmed to look right behind the
 * logo (LOGIN_SAFE_ACCENTS above), so their actual choice still shows
 * through unchanged; otherwise the logo-matched fallback's own
 * --color-primary/--color-primary-dark, scoped to this element and
 * everything inside it via ordinary CSS custom property inheritance -
 * the rest of the app, using the same theme context, is completely
 * unaffected either way.
 */
export function useLoginSafeStyle() {
  const { accent } = useTheme();
  if (LOGIN_SAFE_ACCENTS.includes(accent)) return {};
  const fallback = ACCENT_PRESETS[LOGIN_FALLBACK_ACCENT];
  return { '--color-primary': fallback.vars['--color-primary'], '--color-primary-dark': fallback.vars['--color-primary-dark'] };
}
