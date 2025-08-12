import * as object from '../object.js'
import * as traits from '../traits.js'
import * as error from '../error.js'
import * as s from '../schema.js'

export const $attribution = s.$object({
  insert: s.$array(s.$string).optional,
  insertAt: s.$number.optional,
  delete: s.$array(s.$string).optional,
  deleteAt: s.$number.optional,
  attributes: s.$record(s.$string, s.$array(s.$string)).optional,
  attributesAt: s.$number.optional
})

/**
 * @typedef {s.TypeOf<$attribution>} Attribution
 */

/**
 * @implements {traits.EqualityTrait}
 */
export class AbstractDelta {
  constructor () {
    this.remote = false
    /**
     * @type {any} origin
     */
    this.origin = null
    this.isDiff = true
  }

  /**
   * @return {any}
   */
  toJSON () {
    error.methodUnimplemented()
  }

  /**
   * @param {AbstractDelta} other
   * @param {boolean} priority
   */
  rebase (other, priority) {
    error.methodUnimplemented()
  }

  /**
   * @param {AbstractDelta} other
   */
  apply (other) {
    error.methodUnimplemented()
  }

  /**
   * @return {this}
   */
  clone () {
    error.methodUnimplemented()
  }

  /**
   * @param {any} _other
   * @return {boolean}
   */
  [traits.EqualityTraitSymbol] (_other) {
    error.methodUnimplemented()
  }
}

export const $delta = s.$instanceOf(AbstractDelta)
export const $$delta = /** @type {s.$Schema<s.$InstanceOf<AbstractDelta>>} */ (s.$constructedBy(s.$InstanceOf, s => s.shape.prototype instanceof AbstractDelta))

/**
 * Helper function to merge attribution and attributes. The latter input "wins".
 *
 * @template {{ [key: string]: any }} T
 * @param {T | null} a
 * @param {T | null} b
 */
export const mergeAttrs = (a, b) => object.isEmpty(a) ? b : (object.isEmpty(b) ? a : object.assign({}, a, b))

/**
 * @template {AbstractDelta?} D
 * @param {D} a
 * @param {D} b
 * @return {D}
 */
export const mergeDeltas = (a, b) => {
  if (a !== null && b !== null) {
    const c = /** @type {D & AbstractDelta} */ (a.clone())
    c.apply(b)
    return c
  }
  return a === null ? b : a
}
