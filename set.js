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

/**
 * @template T
 * @param {Set<T>} set
 * @return {T}
 */
export const first = set => {
  return set.values().next().value || undefined
}

/**
 * @template T
 * @param {Iterable<T>} entries
 * @return {Set<T>}
 */
export const from = entries => {
  return new Set(entries)
}
