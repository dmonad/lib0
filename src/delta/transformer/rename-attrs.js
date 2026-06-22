import * as delta from '../delta.js'
import { Transformer, Template, createTransformResult } from './core.js'

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
   * @param {{[K:string|number]:string|number}} renames
   */
  constructor (renames) {
    super()
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
 * Template that renames node attributes (`a` -> `b`) in both directions. Stateless: it builds its
 * {@link RenameAttrsTransformer} once and returns that same instance from every `init`.
 *
 * @template {{[K:string|number]:string|number}} Renames
 */
export class RenameAttrs extends Template {
  /**
   * @param {Renames} renames
   */
  constructor (renames) {
    super()
    /**
     * Retained (beyond the built transformer) so the `Renames` type parameter stays inferrable from
     * a `RenameAttrs<Renames>` instance - `pipe`'s `ApplyPipe` dispatches on `infer Renames`.
     *
     * @type {Renames}
     */
    this.renames = renames
    this.transformer = new RenameAttrsTransformer(renames)
  }

  get stateless () { return true }

  /**
   * @template {delta.DeltaConf} IN
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN,ApplyRenameAttrs<Renames,IN>>}
   */
  init (_$d) {
    return /** @type {Transformer<IN,ApplyRenameAttrs<Renames,IN>>} */ (this.transformer)
  }
}

/**
 * Create a {@link RenameAttrs} template that renames the given node attributes in both directions.
 *
 * @template {{[K:string|number]:string|number}} Renames
 * @param {Renames} renames
 */
export const renameAttrs = renames => new RenameAttrs(renames)
