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
 * @template C
 * @return {Array<C>}
 */
export const create = () => /** @type {Array<C>} */ ([])

/**
 * @template D
 * @param {Array<D>} a
 * @return {Array<D>}
 */
export const copy = a => /** @type {Array<D>} */ (a.slice())

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
 * Transforms something array-like to an actual Array.
 *
 * @function
 * @template T
 * @param {ArrayLike<T>|Iterable<T>} arraylike
 * @return {T}
 */
export const from = Array.from

/**
 * True iff condition holds on every element in the Array.
 *
 * @function
 * @template ITEM
 *
 * @param {Array<ITEM>} arr
 * @param {function(ITEM, number, Array<ITEM>):boolean} f
 * @return {boolean}
 */
export const every = (arr, f) => arr.every(f)

/**
 * True iff condition holds on some element in the Array.
 *
 * @function
 * @template S
 * @param {Array<S>} arr
 * @param {function(S, number, Array<S>):boolean} f
 * @return {boolean}
 */
export const some = (arr, f) => arr.some(f)

/**
 * @template ELEM
 *
 * @param {Array<ELEM>} a
 * @param {Array<ELEM>} b
 * @return {boolean}
 */
export const equalFlat = (a, b) => a.length === b.length && every(a, (item, index) => item === b[index])

/**
 * @template ELEM
 * @param {Array<Array<ELEM>>} arr
 * @return {Array<ELEM>}
 */
export const flatten = arr => arr.reduce((acc, val) => acc.concat(val), [])
