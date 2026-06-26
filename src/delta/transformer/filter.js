import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { Transformer, Template, createTransformResult, withAttrs, attrsShapeOf } from './core.js'

/**
 * @template {delta.DeltaConf} DConf
 * @template {delta.DeltaConf} IN
 * @typedef {delta.AsDeltaConf<{ [K in keyof DConf & keyof IN]: K extends 'attrs' ? import('../../ts.js').PropsPickShared<DConf[K], IN[K]> : (DConf[K] & IN[K])}>} ApplyExpectType
 */

/**
 * Drops everything that does not match the `$allowed` schema (only attrs are filtered for now).
 *
 * @template {delta.DeltaConf} DConf
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, ApplyExpectType<DConf, IN>>}
 */
export class Filter extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d input delta schema
   * @param {import('../../schema.js').Schema<delta.Delta<DConf>>} $allowed the allowed shape
   */
  constructor ($d, $allowed) {
    s.assert($allowed, delta.$$delta)
    super($d, /** @type {any} */ (filterOut($d, $allowed)))
    this.$allowed = $allowed
  }

  get fpName () { return 'lib0:filter' }

  /**
   * @return {Transformer<IN, ApplyExpectType<DConf, IN>>}
   */
  init () {
    return /** @type {any} */ (new FilterTransformer(this.$in, this.$out, this.$allowed))
  }
}

/**
 * Compute the output schema of a filter: keep only the attr keys present in BOTH the input schema and
 * the allowed schema (mirrors {@link ApplyExpectType} / the runtime drop loop). Falls back to
 * `$deltaAny` when either side is loose.
 *
 * @param {import('../../schema.js').Schema<delta.DeltaAny>} $in
 * @param {import('../../schema.js').Schema<delta.DeltaAny>} $allowed
 * @return {import('../../schema.js').Schema<delta.DeltaAny>}
 */
const filterOut = ($in, $allowed) => {
  const mi = attrsShapeOf($in)
  const ma = attrsShapeOf($allowed)
  if (mi == null || ma == null) return delta.$deltaAny
  /** @type {{[K:string|number]:s.Schema<any>}} */
  const m2 = {}
  for (const k in mi) if (k in ma) m2[k] = mi[k]
  return withAttrs($in, m2)
}

/**
 * @template {delta.DeltaConf} IN
 * @template {delta.DeltaConf} OUT
 * @template {delta.DeltaConf} DConf
 * @extends Transformer<IN,OUT>
 */
export class FilterTransformer extends Transformer {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   * @param {delta.$Delta<DConf>} $d
   */
  constructor ($in, $out, $d) {
    super($in, $out)
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
 * Drop everything not matching the `$allowed` schema (only attrs are filtered for now). Returns a
 * reusable {@link Filter} template (a `project` hole, or `.init()` for a standalone transformer).
 *
 * @template {delta.DeltaConf} IN
 * @template {delta.DeltaConf} DConf
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @param {import('../../schema.js').Schema<delta.Delta<DConf>>} $allowed
 * @return {Filter<DConf, IN>}
 */
export const filter = ($d, $allowed) => new Filter($d, $allowed)
