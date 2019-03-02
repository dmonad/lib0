
import * as math from './math.js'

/**
 * @param {Array<number>} arr Array of values
 * @return {number}
 */
export const median = arr => (arr[math.floor(arr.length / 2)] + arr[math.ceil(arr.length / 2)]) / 2

export const average = arr => arr.reduce(math.add, 0) / arr.length
