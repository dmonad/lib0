import * as object from 'lib0/object'
import * as traits from 'lib0/traits'
import * as error from 'lib0/error'
import * as s from 'lib0/schema'

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
   * @param {any} _other
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
