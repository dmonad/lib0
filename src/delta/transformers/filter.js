import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { Transformer, createTransformResult } from './core.js'

/**
 * @typedef {import('./core.js').Template} Template
 */

/**
 * @template {delta.DeltaConf} DConf
 * @template {delta.DeltaConf} IN
 * @typedef {{ [K in keyof DConf & keyof IN]: K extends 'attrs' ? import('../../ts.js').PropsPickShared<DConf[K], IN[K]> : (DConf[K] & IN[K])} & {}} ApplyExpectType
 */

/**
 * Drops everything that does not match the configured schema (only attrs are filtered for now).
 *
 * @template {delta.DeltaConf} DConf
 * @implements Template
 */
export class Filter {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<DConf>>} $d
   */
  constructor ($d) {
    s.assert($d, delta.$$delta)
    this.$d = $d
    this.$dshape = $d.shape
  }

  get stateless () { return false }

  /**
   * @template {delta.DeltaConf} IN
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN,ApplyExpectType<DConf, IN>>}
   */
  init (_$d) {
    return /** @type {Transformer<IN,any>} */ (new FilterTransformer(this.$d))
  }
}

/**
 * @template {delta.DeltaConf} IN
 * @template {delta.DeltaConf} OUT
 * @template {delta.DeltaConf} DConf
 * @extends Transformer<IN,OUT>
 */
export class FilterTransformer extends Transformer {
  /**
   * @param {delta.$Delta<DConf>} $d
   */
  constructor ($d) {
    super()
    this.$dshape = $d.shape
    this.filter = delta.create(delta.$delta({ children: s.$any }))
    /**
     * @type {delta.DeltaAny}
     */
    this.dreversed = delta.create()
  }

  /**
   * @param {delta.DeltaBuilderAny} deltaA
   */
  applyA (deltaA) {
    const $attrs = this.$dshape.$attrs
    const dtrans = delta.clone(deltaA)
    /**
     * @type {delta.DeltaBuilderAny}
     */
    const drev = delta.create()
    for (const entry of dtrans.attrs) {
      if (delta.$setAttrOp.check(entry) || delta.$modifyOp.check(entry)) {
        if (!$attrs.check({ [entry.key]: entry.value })) {
          delete dtrans.attrs[entry.key]
          drev.deleteAttr(entry.key, null)
        } else {
          // @ts-ignore
          drev.attrs[entry.key] = entry.clone()
        }
      } else if (delta.$deleteAttrOp.check(this.dreversed.attrs[entry.key])) {
        delete dtrans.attrs[entry.key]
      }
    }
    // @todo children
    return createTransformResult(null, deltaA)
  }

  /**
   * @param {delta.DeltaBuilderAny} deltaB
   */
  applyB (deltaB) {
    return createTransformResult(deltaB, null)
  }
}

/**
 * Create a {@link Filter} template from a schema describing the allowed shape.
 *
 * @template {delta.DeltaConf} DConf
 * @param {import('../../schema.js').Schema<delta.Delta<DConf>>} $d
 */
export const filter = $d => new Filter($d)
