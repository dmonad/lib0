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
 * @template {any} Embeds
 * @param {s.$Schema<Embeds>} $embeds
 */
export const createDeltaText = ($embeds = s.$never) => new DeltaTextBuilder($embeds)

/**
 * @template {{ [key:string]: any }} Vals
 * @param {s.$Schema<Vals>} $embeds
 * @return {s.$Schema<DeltaText<Vals>>}
 */
export const $deltaText = $embeds => /** @type {s.$Schema<DeltaText<Vals>>} */ (s.$instanceOf(DeltaTextBuilder, o => $embeds.extends(o.$insert)))
