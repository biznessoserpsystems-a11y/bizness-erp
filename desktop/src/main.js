const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * The desktop app is deliberately a thin native shell around the
 * already-built, already-tested web app - not a second copy of the
 * frontend, and not a bundled local backend/database. It points at
 * wherever the real app is actually deployed (Render for the API,
 * GitHub Pages or a custom domain for the frontend), the same way the
 * browser-based PWA install does. Everything - the accounting logic,
 * the offline draft handling, the access control, all of it - is the
 * one real app, just running in its own window instead of a browser
 * tab.
 *
 * The target URL is read from config.json rather than hardcoded, since
 * this repo has no live deployment yet (see the README) - the GitHub
 * Actions workflow writes this file from a repository variable before
 * each build, the same pattern already used for VITE_API_URL in the
 * Pages deployment workflow.
 */

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.appUrl && /^https:\/\//.test(parsed.appUrl)) return parsed;
  } catch {
    // No config.json, or it's malformed - fall through to the
    // unconfigured-build screen below rather than crashing or loading
    // nothing with no explanation.
  }
  return { appUrl: null };
}

function createWindow() {
  const { appUrl } = loadConfig();

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0B6E4F',
    title: 'Bizness-OS',
    webPreferences: {
      // Loading remote, real web content - never expose Node.js APIs
      // to it and always keep the renderer's world isolated from the
      // preload/main context. Turning either of these off would mean
      // the loaded page (or anything that ever compromised it) could
      // reach the filesystem or run arbitrary Node code on this
      // machine, not just do what a browser tab could do.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (appUrl) {
    win.loadURL(appUrl);
  } else {
    win.loadFile(path.join(__dirname, 'unconfigured.html'));
  }

  // Any link intended to open a new window/tab (target="_blank", an
  // external "learn more" link, etc.) opens in the person's actual
  // default browser instead of navigating this app window away from
  // Bizness-OS itself or spawning an unmanaged second Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // macOS convention: clicking the dock icon when no windows are
    // open should reopen one, rather than the app appearing "stuck"
    // running with nothing visible.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // macOS convention: the app stays running in the dock until
  // explicitly quit, even with no windows open. Every other platform
  // quits when the last window closes, matching how a normal desktop
  // app behaves there.
  if (process.platform !== 'darwin') app.quit();
});
