import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
// jsdom has no real IndexedDB implementation at all - needed by the
// offline drafts storage layer and any test that touches it.
import 'fake-indexeddb/auto';

// React Testing Library's render() leaves the previous test's DOM tree
// mounted unless explicitly cleaned up — Jest's own preset does this
// automatically, but under Vitest it has to be wired up here, once,
// globally, rather than every component test file remembering to call
// cleanup() itself.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement window.matchMedia at all — it does no real
// layout, so media queries have nothing meaningful to evaluate. Several
// components (Sidebar's desktop/mobile width detection among them) call
// it directly, so it needs a real (if inert) implementation here rather
// than each test file discovering the gap on its own.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
