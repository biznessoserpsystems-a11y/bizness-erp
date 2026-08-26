import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { ThemeProvider, ACCENT_PRESETS } from './context/ThemeContext';
import OfflineBanner from './components/OfflineBanner';
import './styles.css';

// Applied synchronously, before React's first render, so there's no flash
// of the default theme before ThemeProvider's own effect catches up on
// mount — the same values it reads from localStorage on every render after.
(function applyThemeBeforeFirstPaint() {
  try {
    const mode = localStorage.getItem('bizness-os:theme-mode') || 'light';
    const effective = mode === 'system'
      ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    document.documentElement.setAttribute('data-theme', effective);

    const accentKey = localStorage.getItem('bizness-os:theme-accent') || 'cedi';
    const preset = ACCENT_PRESETS[accentKey] || ACCENT_PRESETS.cedi;
    for (const [prop, value] of Object.entries(preset.vars)) {
      document.documentElement.style.setProperty(prop, value);
    }
  } catch {
    // localStorage unavailable — falls back to the default light/Cedi Green theme, which is fine.
  }
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <ThemeProvider>
            <AuthProvider>
              <OfflineBanner />
              <App />
            </AuthProvider>
          </ThemeProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);
