/**
 * @module fnv1a
 * FNV-1a (32bit) - a fast, non-cryptographic hash function.
 * Spec: http://www.isthe.com/chongo/tech/comp/fnv/
 */

import * as math from '../math.js'

/**
 * FNV-1a offset basis (32bit).
 */
export const offsetBasis = 0x811c9dc5

/**
 * FNV-1a prime (32bit).
 */
export const prime = 0x01000193

/**
 * Compute the FNV-1a 32bit hash of a byte sequence.
 *
 * Pass the result of a previous call as `hash` to digest a message in chunks:
 * `digest(concat(a, b)) === digest(b, digest(a))`.
 *
 * @param {Uint8Array} data
 * @param {number} hash - continue hashing from a previous result (defaults to the offset basis)
 * @return {number} unsigned 32bit hash
 */
/* @__NO_SIDE_EFFECTS__ */
export const digest = (data, hash = offsetBasis) => {
  for (let i = 0; i < data.length; i++) {
    hash = math.imul(hash ^ data[i], prime)
  }
  return hash >>> 0
}

/**
 * Compute the FNV-1a 32bit hash of a string - without allocating the utf8 encoding.
 *
 * Equivalent to `digest(string.encodeUtf8(str))`: the string is hashed as utf8 bytes; lone
 * surrogates are hashed as the replacement character (like TextEncoder encodes them).
 *
 * Prefer this over `digest(string.encodeUtf8(str))` when hashing strings - it skips the
 * TextEncoder call and the Uint8Array allocation, making it ~5x faster for small strings
 * (<=20 chars, e.g. object keys) and ~2x faster for larger ones.
 *
 * @param {string} str
 * @param {number} hash - continue hashing from a previous result (defaults to the offset basis)
 * @return {number} unsigned 32bit hash
 */
/* @__NO_SIDE_EFFECTS__ */
export const digestString = (str, hash = offsetBasis) => {
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i)
    if (c < 0x80) {
      hash = math.imul(hash ^ c, prime)
    } else {
      if (c >= 0xd800 && c < 0xe000) {
        const lo = str.charCodeAt(i + 1) // NaN when out of bounds ⇒ NaN & x === 0
        if (c < 0xdc00 && (lo & 0xfc00) === 0xdc00) {
          c = 0x10000 + ((c & 0x3ff) << 10) + (lo & 0x3ff)
          i++
        } else {
          c = 0xfffd // lone surrogate ⇒ replacement character
        }
      }
      if (c < 0x800) {
        hash = math.imul(hash ^ (0xc0 | (c >> 6)), prime)
      } else {
        if (c < 0x10000) {
          hash = math.imul(hash ^ (0xe0 | (c >> 12)), prime)
        } else {
          hash = math.imul(hash ^ (0xf0 | (c >> 18)), prime)
          hash = math.imul(hash ^ (0x80 | ((c >> 12) & 0x3f)), prime)
        }
        hash = math.imul(hash ^ (0x80 | ((c >> 6) & 0x3f)), prime)
      }
      hash = math.imul(hash ^ (0x80 | (c & 0x3f)), prime)
    }
  }
  return hash >>> 0
}
