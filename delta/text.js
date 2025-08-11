import * as s from '../schema.js'
import { AbstractDeltaArrayBuilder } from './abstract-array.js'

/**
 * @template Embeds
 * @typedef {import('./abstract-array.js').AbstractDeltaArray<'text',import('./abstract-array.js').TextDeltaOps<Embeds>>} TextDelta
 */

/**
 * @template {any} Embeds
 * @extends {AbstractDeltaArrayBuilder<'text',import('./abstract-array.js').TextDeltaOps<Embeds>>}
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
