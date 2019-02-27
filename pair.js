
/**
 * @template L
 * @template R
 */
export class Pair {
  /**
   * @param {L} left
   * @param {R} right
   */
  constructor (left, right) {
    this.left = left
    this.right = right
  }
}

export const create = (left, right) => new Pair(left, right)
export const createReversed = (right, left) => new Pair(left, right)

/**
 * @template L
 * @template R
 * @param {Array<Pair<L,R>>} arr
 * @param {function(L, R):any} f
 */
export const forEach = (arr, f) => arr.forEach(p => f(p.left, p.right))

/**
 * @template L
 * @template R
 * @template X
 * @param {Array<Pair<L,R>>} arr
 * @param {function(L, R):X} f
 * @return {Array<X>}
 */
export const map = (arr, f) => arr.map(p => f(p.left, p.right))
