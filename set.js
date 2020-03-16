/**
 * Utility module to work with sets.
 *
 * @module set
 */

export const create = () => new Set()

/**
 * @template T
 * @param {Set<T>} set
 * @return {Array<T>}
 */
export const toArray = set => Array.from(set)
