/**
 * Environment detection primitives shared by `environment.js` and `storage.js`.
 *
 * Internal module (not exported in `package.json`) — it exists so that `storage.js` can check
 * `isBrowser` without importing `environment.js`, which imports `storage.js` (circular import).
 */

/* c8 ignore next */
export const isNode = /* @__PURE__ */(() => typeof process !== 'undefined' && process.release && /node|io\.js/.test(process.release.name) && Object.prototype.toString.call(typeof process !== 'undefined' ? process : 0) === '[object process]')()

/**
 * True iff this script is running in deno
 * @type {boolean}
 */
/* c8 ignore next 2 */
// @ts-ignore
export const isDeno = /* @__PURE__ */(() => typeof Deno !== 'undefined')()

/* c8 ignore start */
export const globalScope = /* @__PURE__ */(() =>/** @type {any} */ (typeof globalThis !== 'undefined'
  ? globalThis
  : typeof window !== 'undefined'
    ? window
    // @ts-ignore
    : typeof global !== 'undefined' ? global : {}))()
/* c8 ignore stop */

/**
 * True iff this script is running in a browser-family environment — either a DOM main
 * thread (`window` + `document`) or a WebWorker / ServiceWorker (a `WorkerGlobalScope`,
 * which has `btoa`/`atob`/`fetch` but no DOM). Excludes Node and Deno.
 * @type {boolean}
 */
/* c8 ignore next */
export const isBrowser = /* @__PURE__ */(() =>
  !isNode && !isDeno && (
    (typeof window !== 'undefined' && typeof document !== 'undefined') ||
    // WebWorker / ServiceWorker: no window/document, but a worker global scope
    (typeof globalScope.WorkerGlobalScope !== 'undefined' && globalScope.self instanceof globalScope.WorkerGlobalScope)
  )
)()
