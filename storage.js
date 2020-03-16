/* global localStorage */

/**
 * Isomorphic variable storage.
 *
 * Uses LocalStorage in the browser and falls back to in-memory storage.
 *
 * @module storage
 */

/* istanbul ignore next */
class VarStoragePolyfill {
  constructor () {
    this.map = new Map()
  }

  /**
   * @param {string} key
   * @param {any} value
   */
  setItem (key, value) {
    this.map.set(key, value)
  }

  /**
   * @param {string} key
   */
  getItem (key) {
    return this.map.get(key)
  }
}

/* istanbul ignore next */
/**
 * @type {any}
 */
let _localStorage = new VarStoragePolyfill()

try {
  // if the same-origin rule is violated, accessing localStorage might thrown an error
  /* istanbul ignore next */
  if (typeof localStorage !== 'undefined') {
    _localStorage = localStorage
  }
} catch (e) { }

/* istanbul ignore next */
/**
 * This is basically localStorage in browser, or a polyfill in nodejs
 */
export const varStorage = _localStorage
