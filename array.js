/**
 * Utility module to work with Arrays.
 *
 * @module array
 */

/**
 * Return the last element of an array. The element must exist
 *
 * @template L
 * @param {Array<L>} arr
 * @return {L}
 */
export const last = arr => arr[arr.length - 1]

/**
 * @template T
 * @return {Array<T>}
 */
export const create = () => []

/**
 * @template T
 * @param {Array<T>} a
 * @return {Array<T>}
 */
export const copy = a => a.slice()

/**
 * Append elements from src to dest
 *
 * @template M
 * @param {Array<M>} dest
 * @param {Array<M>} src
 */
export const appendTo = (dest, src) => {
  for (let i = 0; i < src.length; i++) {
    dest.push(src[i])
  }
}

/**
 * @function
 * @template T
 * @param {ArrayLike<T>|Iterable<T>} arraylike
 * @return {T}
 */
export const from = Array.from
