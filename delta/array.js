import * as s from '../schema.js'
import { AbstractDeltaArrayBuilder } from './abstract-array.js'
import * as ops from './ops.js'

/**
 * @template ArrayContent
 * @template {boolean} [WithText=false]
 * @extends AbstractDeltaArrayBuilder<'array', import('./ops.js').DeltaArrayOps<ArrayContent,WithText>>
 */
export class DeltaArray extends AbstractDeltaArrayBuilder {
  /**
   * @param {s.Schema<ArrayContent>} $insert
   * @param {WithText} withText
   */
  constructor ($insert, withText) {
    super('array', $insert)
    this.withText = withText
  }
}

/**
 * @template ArrayContent
 * @template {boolean} [WithText=false]
 * @param {s.Schema<ArrayContent>} $insert
 * @param {WithText} [withText]
 * @return {s.Schema<DeltaArray<ArrayContent, WithText>>}
 */
export const $array = ($insert, withText) => /** @type {any} */ (s.$instanceOf(AbstractDeltaArrayBuilder, o => o.type === 'array' && o.ops.every(op => {
  if (ops.$textOp.check(op)) return !!withText
  if (ops.$insertOp.check(op)) return op.insert.every(opi => $insert.check(opi))
  return true
})))
/**
 * @type {s.Schema<DeltaArray<any,any>>}
 */
export const $arrayAny = /** @type {any} */ (s.$instanceOf(AbstractDeltaArrayBuilder, o => o.type === 'array'))

/**
 * @template [V=any]
 * @template {boolean} [WithText=any]
 * @param {s.Schema<V>} $insert
 * @param {WithText} [withText]
 * @return {DeltaArray<V,WithText>}
 */
export const array = ($insert = s.$any, withText) => /** @type {DeltaArray<V,WithText>} */ (new DeltaArray($insert, withText ?? true))
