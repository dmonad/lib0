/* global crypto */

/**
 * @module random
 */
import * as env from './environment.js'
import * as binary from './binary.js'

/* istanbul ignore next */
const uint32BrowserCrypto = () => {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return arr[0]
}

/* istanbul ignore next */
const uint32NoCrypto = () => Math.ceil((Math.random() * binary.BITS32) >>> 0)

/**
 * @param {typeof import('crypto')} crypto
 * @return {function():number}
 */
const uint32NodeCrypto = crypto => () => {
  // @ts-ignore
  const buf = crypto.randomBytes(4)
  return new Uint32Array(buf.buffer)[0]
}

/* istanbul ignore next */
export const uint32 = env.isBrowser
  ? (typeof crypto === 'undefined' ? uint32NoCrypto : uint32BrowserCrypto)
  : uint32NodeCrypto(require('crypto'))
