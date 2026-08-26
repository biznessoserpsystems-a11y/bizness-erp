import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Only meaningful for a GitHub Pages *project* site, served from
// /repo-name/ rather than the domain root - every other deployment
// (Render, a custom domain, local dev) leaves this unset and gets '/',
// completely unchanged from before. Getting this wrong under a subpath
// deployment doesn't degrade gracefully: every asset URL and the SPA's
// own client-side routing break outright, not partially.
const BASE_PATH = process.env.VITE_BASE_PATH || '/';

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    VitePWA({
      // Auto-updates the service worker (and prompts an immediate
      // refresh) rather than silently trapping someone on an old,
      // possibly-buggy cached version — a real risk for a business app
      // under active development, not just a cosmetic PWA setting.
      registerType: 'autoUpdate',
      manifest: {
        name: 'Bizness-OS',
        short_name: 'Bizness-OS',
        description: 'Full-stack modular ERP for Ghana-based businesses',
        theme_color: '#0B6E4F',
        background_color: '#0B6E4F',
        display: 'standalone',
        // Must track BASE_PATH, not stay hardcoded to '/' - otherwise
        // an installed PWA under a GitHub Pages subpath opens to the
        // domain root instead of where the app actually lives, which
        // fails outright rather than just looking slightly off.
        start_url: BASE_PATH,
        scope: BASE_PATH,
        icons: [
          { src: `${BASE_PATH}icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${BASE_PATH}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${BASE_PATH}icon-maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: `${BASE_PATH}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Only the built app shell (JS/CSS/HTML/fonts) is precached —
        // deliberately not /api/* routes, and mutation requests are
        // never cached at all (runtimeCaching below is scoped to GET
        // only). globPatterns covers just Vite's own build output, so
        // API responses are never swept into the precache by accident.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        // GET /api/ requests get a real but deliberately conservative
        // offline reading capability: NetworkFirst means the network is
        // always tried first and always wins when available — this is
        // not stale-while-revalidate or cache-first, which would risk
        // quietly showing stale financial data even while online. The
        // cache is only ever consulted when the network genuinely
        // fails, and even then only for up to an hour — a week-old
        // cached balance is worse than no offline view at all. Actual
        // write requests (POST/PATCH/DELETE) are handled entirely at
        // the application layer in api.js, not here — they're blocked
        // before they're even attempted while offline, never queued by
        // the service worker for a later, unvalidated replay.
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-get-cache',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/tests/setup.js'],
  },
});
