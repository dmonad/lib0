
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

/**
 * Append elements from src to dest
 *
 * @template T
 * @param {Array<T>} dest
 * @param {Array<T>} src
 */
export const appendTo = (dest, src) => {
  for (let i = 0; i < src.length; i++) {
    dest.push(src[i])
  }
}

export const from = Array.from
