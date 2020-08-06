/**
 * Utility helpers for working with numbers.
 *
 * @module number
 */

import * as math from './math.js'
import * as binary from './binary.js'

export const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
export const MIN_SAFE_INTEGER = Number.MIN_SAFE_INTEGER

export const LOWEST_INT32 = 1 << 31
/**
 * @type {number}
 */
export const HIGHEST_INT32 = binary.BITS31

/**
 * @module number
 */

/* istanbul ignore next */
export const isInteger = Number.isInteger || (num => typeof num === 'number' && isFinite(num) && math.floor(num) === num)
export const isNaN = Number.isNaN
