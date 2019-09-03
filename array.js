
/**
 * Return the last element of an array. The element must exist
 *
 * @template T
 * @param {Array<T>} arr
 * @return {T}
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
