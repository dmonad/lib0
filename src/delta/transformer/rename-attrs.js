import * as delta from '../delta.js'
import { Transformer, Template, createTransformResult, withAttrs, attrsShapeOf } from './core.js'

/**
 * @template {{[K:string|number]:string|number}} Renames
 * @template {delta.DeltaConf} IN
 * @typedef {delta.DeltaConfOverwrite<IN,{ attrs: import('../../ts.js').PropsRename<delta.DeltaConfGetAttrs<IN>,Renames> }>} ApplyRenameAttrs
 */

/**
 * @param {delta.DeltaAny?} d
 * @param {{[K:string|number]:string|number}} renames
 * @param {{[K:string|number]:string|number}} revRenames
 * @return {import('./core.js').TransformResultAny}
 */
const renameDeltaAttrs = (d, renames, revRenames) => {
  if (d == null) return createTransformResult(null, null)
  const forwardTransform = delta.clone(d)
  for (const attr of forwardTransform.attrs) {
    const key = attr.key
    const r = renames[key]
    const rv = revRenames[key]
    if (r != null) {
      // @ts-ignore
      forwardTransform.attrs[r] = attr
      // delete original
      delete forwardTransform.attrs[key]
      // @ts-ignore
      attr.key = r
    } else if (rv != null) {
      // used in a rename, delete original
      delete forwardTransform.attrs[key]
    }
  }
  // a mark on a renamed attribute follows the rename; a mark on a dropped (rename-target) attribute is
  // dropped. Content-offset (number-key) marks are untouched. Marks rode in on `delta.clone` above.
  delta.remapRootMarks(forwardTransform, key => {
    const r = renames[key]
    if (r != null) return r
    if (revRenames[key] != null) return null
    return key
  })
  return createTransformResult(null, forwardTransform)
}

/**
 * Renames node attributes (`a` -> `b`) in both directions. Holds no per-application state, so
 * {@link RenameAttrs} builds a single instance and shares it across every `init`.
 *
 * @extends Transformer<any,any>
 */
export class RenameAttrsTransformer extends Transformer {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   * @param {{[K:string|number]:string|number}} renames
   */
  constructor ($in, $out, renames) {
    super($in, $out)
    this.arenames = renames
    /**
     * @type {{[K:string|number]:string|number}}
     */
    this.brenames = {}
    for (const k in renames) {
      this.brenames[renames[k]] = k
    }
  }

  /**
   * @param {delta.DeltaAny} deltaA
   * @return {import('./core.js').TransformResultAny}
   */
  applyA (deltaA) {
    return renameDeltaAttrs(deltaA, this.arenames, this.brenames)
  }

  /**
   * @param {delta.DeltaAny} deltaB
   * @return {import('./core.js').TransformResultAny}
   */
  applyB (deltaB) {
    return renameDeltaAttrs(deltaB, this.brenames, this.arenames).reverse()
  }
}

/**
 * Compute the output schema of an attribute rename: rename matching attr keys, drop keys that are
 * rename targets, keep the rest (mirrors {@link renameDeltaAttrs} / {@link ApplyRenameAttrs}). Falls
 * back to `$deltaAny` when the input schema is loose.
 *
 * @param {import('../../schema.js').Schema<delta.DeltaAny>} $d
 * @param {{[K:string|number]:string|number}} renames
 * @return {import('../../schema.js').Schema<delta.DeltaAny>}
 */
const renamedAttrsOut = ($d, renames) => {
  const m = attrsShapeOf($d)
  if (m == null) return delta.$deltaAny
  /** @type {{[K:string|number]:string|number}} */
  const rev = {}
  for (const k in renames) rev[renames[k]] = k
  /** @type {{[K:string|number]:import('../../schema.js').Schema<any>}} */
  const m2 = {}
  for (const k in m) {
    if (renames[k] != null) m2[renames[k]] = m[k]
    else if (rev[k] == null) m2[k] = m[k]
  }
  return withAttrs($d, m2)
}

/**
 * Template that renames node attributes (`a` -> `b`) in both directions.
 *
 * @template {{[K:string|number]:string|number}} Renames
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, ApplyRenameAttrs<Renames, IN>>}
 */
export class RenameAttrs extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
   * @param {Renames} renames
   */
  constructor ($d, renames) {
    super($d, /** @type {any} */ (renamedAttrsOut($d, renames)))
    /**
     * @type {Renames}
     */
    this.renames = renames
  }

  get fpName () { return 'lib0:renameAttrs:' + JSON.stringify(this.renames) }

  /**
   * @return {Transformer<IN,ApplyRenameAttrs<Renames,IN>>}
   */
  init () {
    return /** @type {any} */ (new RenameAttrsTransformer(this.$in, this.$out, this.renames))
  }
}

/**
 * Rename node attributes (`a` -> `b`) in both directions. Returns a reusable {@link RenameAttrs}
 * template (a `project` hole, or `.init()` for a standalone transformer). The `const Renames` param
 * keeps the `{a:'b'}` literal so the output type is precise without a manual const-assertion.
 *
 * @template {delta.DeltaConf} IN
 * @template {{[K:string|number]:string|number}} const Renames
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @param {Renames} renames
 * @return {RenameAttrs<Renames, IN>}
 */
export const renameAttrs = ($d, renames) => new RenameAttrs($d, renames)
