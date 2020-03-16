/**
 * Utility functions to work with buffers (Uint8Array).
 *
 * @module buffer
 */

import * as string from './string.js'
import * as env from './environment.js'

/**
 * @param {number} len
 */
export const createUint8ArrayFromLen = len => new Uint8Array(len)

/**
 * Create Uint8Array with initial content from buffer
 *
 * @param {ArrayBuffer} buffer
 * @param {number} byteOffset
 * @param {number} length
 */
export const createUint8ArrayViewFromArrayBuffer = (buffer, byteOffset, length) => new Uint8Array(buffer, byteOffset, length)

/**
 * Create Uint8Array with initial content from buffer
 *
 * @param {ArrayBuffer} buffer
 */
export const createUint8ArrayFromArrayBuffer = buffer => new Uint8Array(buffer)

/* istanbul ignore next */
/**
 * @param {Uint8Array} bytes
 * @return {string}
 */
const toBase64Browser = bytes => {
  let s = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    s += string.fromCharCode(bytes[i])
  }
  // eslint-disable-next-line no-undef
  return btoa(s)
}

/**
 * @param {Uint8Array} bytes
 * @return {string}
 */
const toBase64Node = bytes => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')

/* istanbul ignore next */
/**
 * @param {string} s
 * @return {Uint8Array}
 */
const fromBase64Browser = s => {
  // eslint-disable-next-line no-undef
  const a = atob(s)
  const bytes = createUint8ArrayFromLen(a.length)
  for (let i = 0; i < a.length; i++) {
    bytes[i] = a.charCodeAt(i)
  }
  return bytes
}

/**
 * @param {string} s
 */
const fromBase64Node = s => new Uint8Array(Buffer.from(s, 'base64').buffer)

/* istanbul ignore next */
export const toBase64 = env.isBrowser ? toBase64Browser : toBase64Node

/* istanbul ignore next */
export const fromBase64 = env.isBrowser ? fromBase64Browser : fromBase64Node

/**
 * Copy the content of an Uint8Array view to a new ArrayBuffer.
 *
 * @param {Uint8Array} uint8Array
 * @return {Uint8Array}
 */
export const copyUint8Array = uint8Array => {
  const newBuf = createUint8ArrayFromLen(uint8Array.byteLength)
  newBuf.set(uint8Array)
  return newBuf
}
