import * as s from '../schema.js'
import { AbstractDeltaArrayBuilder } from './abstract-array.js'

/**
 * @template Embeds
 * @typedef {import('./abstract-array.js').AbstractDeltaArray<'text',import('./ops.js').DeltaTextOps<Embeds>>} DeltaText
 */

/**
 * @template {any} Embeds
 * @extends {AbstractDeltaArrayBuilder<'text',import('./ops.js').DeltaTextOps<Embeds>>}
 */
export class DeltaTextBuilder extends AbstractDeltaArrayBuilder {
  /**
   * @param {s.$Schema<Embeds>} $embeds
   */
  constructor ($embeds) {
    super('text', $embeds)
  }
}

/**
 * @overload
 * @return {DeltaTextBuilder<never>}
 */
/**
 * @overload
 * @param {string} [content]
 * @return {DeltaTextBuilder<never>}
 */
/**
 * @template Embeds
 * @overload
 * @param {s.$Schema<Embeds>} [$embeds]
 * @return {DeltaTextBuilder<Embeds>}
 */
/**
 * @template {s.$Schema<any>|string|undefined} Arg1
 * @param {Arg1} arg1
 * @return {DeltaTextBuilder<Arg1 extends s.$Schema<infer Embeds> ? Embeds : never>}
 */
export const text = arg1 => s.$$schema.check(arg1) ? new DeltaTextBuilder(/** @type {s.$Schema<any>} */ (arg1)) : (s.$string.check(arg1) ? new DeltaTextBuilder(s.$never).insert(arg1) : new DeltaTextBuilder(s.$never))

/**
 * @template {{ [key:string]: any }} Vals
 * @param {s.$Schema<Vals>} $embeds
 * @return {s.$Schema<DeltaText<Vals>>}
 */
export const $text = $embeds => /** @type {s.$Schema<DeltaText<Vals>>} */ (s.$instanceOf(DeltaTextBuilder, o => $embeds.extends(o.$insert)))
