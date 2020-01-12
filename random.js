/* global crypto */

/**
 * @module random
 */
import * as env from './environment.js'
import * as binary from './binary.js'
import * as math from './math.js'

/* istanbul ignore next */
const nodeCrypto = env.isNode ? require('crypto') : null

/**
 * Basically Math.random. Returns a pseudo random number in [0,1).
 */
const rand = Math.random

/* istanbul ignore next */
const uint32BrowserCrypto = () => {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return arr[0]
}

/* istanbul ignore next */
const uint32NoCrypto = () => math.ceil((rand() * binary.BITS32) >>> 0)

const uint32NodeCrypto = () => new Uint32Array(/** @type {any} */ (nodeCrypto).randomBytes(4).buffer)[0]

/* istanbul ignore next */
export const uint32 = env.isNode
  ? uint32NodeCrypto
  : (typeof crypto === 'undefined' ? uint32NoCrypto : uint32BrowserCrypto)

/**
 * @template T
 * @param {Array<T>} arr
 * @return {T}
 */
export const oneOf = arr => arr[math.floor(rand() * arr.length)]

// @ts-ignore
const uuidv4Template = [1e7] + -1e3 + -4e3 + -8e3 + -1e11
export const uuidv4 = () => uuidv4Template.replace(/[018]/g, /** @param {number} c */ c =>
  (c ^ uint32() & 15 >> c / 4).toString(16)
)
