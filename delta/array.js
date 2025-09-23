import * as s from '../schema.js'
import { AbstractDeltaArrayBuilder } from './abstract-array.js'

/**
 * @template Content
 * @typedef {import('./abstract-array.js').AbstractDeltaArray<'array',import('./ops.js').DeltaArrayOps<Content>>} DeltaArray
 */

/**
 * @template ArrayContent
 * @extends AbstractDeltaArrayBuilder<'array', import('./ops.js').DeltaArrayOps<ArrayContent>>
 */
export class DeltaArrayBuilder extends AbstractDeltaArrayBuilder {
  /**
   * @param {s.Schema<ArrayContent>} $insert
   */
  constructor ($insert) {
    super('array', $insert)
  }
}

/**
 * @template ArrayContent
 * @param {s.Schema<ArrayContent>} $insert
 * @return {s.Schema<DeltaArray<ArrayContent>>}
 */
export const $array = $insert => /** @type {any} */ (s.$instanceOf(AbstractDeltaArrayBuilder, o => o.type === 'array' && o.$insert.extends($insert)))
/**
 * @type {s.Schema<DeltaArray<any>>}
 */
export const $arrayAny = /** @type {any} */ (s.$instanceOf(AbstractDeltaArrayBuilder, o => o.type === 'array'))

/**
 * @template [V=any]
 * @param {s.Schema<V>} $insert
 * @return {DeltaArrayBuilder<V>}
 */
export const array = ($insert = s.$any) => new DeltaArrayBuilder($insert)
