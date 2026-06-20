/**
 * Test bootstrap. When running outside a browser (e.g. under Node) there is no DOM, so the
 * DOM-dependent tests in `delta/rdt/dom.test.js` cannot run. This module installs a jsdom-backed
 * `document` + `MutationObserver` on `globalThis` so those tests run in Node/CI too.
 *
 * It MUST be imported before any other module in `src/test.js` and is loaded **synchronously**:
 * `dom.js` reads `document` and the node-type constants at module-evaluation time, and
 * `environment.js` computes `hasDom` at import — both must observe the jsdom globals. A top-level
 * `await import('jsdom')` would NOT work here: top-level await does not block sibling-module
 * evaluation, so `environment.js` would still see no DOM. We therefore pull jsdom in synchronously
 * via `createRequire` (jsdom is CommonJS), reaching `node:module` through
 * `process.getBuiltinModule` so there is no static `node:module` import to break browser bundles.
 *
 * `jsdom` is a dev-only dependency that never ships in the published package: it loads only under
 * Node (never a browser, where `document` already exists, nor Deno).
 */

/* c8 ignore start */
if (
  typeof document === 'undefined' &&
  typeof process !== 'undefined' &&
  typeof process.getBuiltinModule === 'function' &&
  !('Deno' in globalThis)
) {
  const { createRequire } = process.getBuiltinModule('module')
  const { JSDOM } = createRequire(import.meta.url)('jsdom')
  const { window } = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.document = window.document
  globalThis.MutationObserver = window.MutationObserver
  globalThis.DOMParser = window.DOMParser
  globalThis.CustomEvent = window.CustomEvent
}
/* c8 ignore stop */
