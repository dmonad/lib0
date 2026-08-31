/**
 * Isomorphic module for true random numbers / buffers / uuids.
 *
 * uuidv4 uses the native `crypto.randomUUID` when available and falls back to a
 * `getRandomValues`-based implementation otherwise (insecure browser contexts,
 * react-native).
 *
 * @module random
 */

import * as math from './math.js'
import * as binary from './binary.js'
import { getRandomValues } from 'lib0/webcrypto'

export const rand = Math.random

export const uint32 = () => getRandomValues(new Uint32Array(1))[0]

export const uint53 = () => {
  const arr = getRandomValues(new Uint32Array(8))
  return (arr[0] & binary.BITS21) * (binary.BITS32 + 1) + (arr[1] >>> 0)
}

/**
 * @template T
 * @param {Array<T>} arr
 * @return {T}
 */
export const oneOf = arr => arr[math.floor(rand() * arr.length)]

// @ts-ignore
const uuidv4Template = [1e7] + -1e3 + -4e3 + -8e3 + -1e11

/**
 * Fallback for environments without `crypto.randomUUID` (insecure browser
 * contexts, react-native).
 *
 * @return {string}
 */
export const _uuidv4Polyfill = () => uuidv4Template.replace(/[018]/g, /** @param {number} c */ c =>
  (c ^ uint32() & 15 >> c / 4).toString(16)
)

/**
 * @type {() => string}
 */
export const uuidv4 = /* @__PURE__ */ (() =>
  typeof crypto !== 'undefined' && crypto.randomUUID != null
    ? crypto.randomUUID.bind(crypto)
    : _uuidv4Polyfill
)()
