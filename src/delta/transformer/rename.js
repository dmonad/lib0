import * as delta from '../delta.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * @template {{[K:string|number]:string|number}} Renames
 * @template {delta.DeltaConf} IN
 * @typedef {delta.DeltaConfOverwrite<IN,{ attrs: import('../../ts.js').PropsRename<delta.DeltaConfGetAttrs<IN>,Renames> }>} ApplyAttrRename
 */

/**
 * @param {delta.DeltaAny?} d
 * @param {{[K:string|number]:string|number}} renames
 * @param {{[K:string|number]:string|number}} revRenames
 * @return {import('./core.js').TransformResultAny}
 */
const renameAttrs = (d, renames, revRenames) => {
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
  return createTransformResult(null, forwardTransform)
}

/**
 * Renames node attributes (`a` -> `b`) in both directions. Holds no per-application state, so
 * {@link AttrRename} builds a single instance and shares it across every `init`.
 *
 * @extends Transformer<any,any>
 */
export class AttrRenameTransformer extends Transformer {
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
    return renameAttrs(deltaA, this.arenames, this.brenames)
  }

  /**
   * @param {delta.DeltaAny} deltaB
   * @return {import('./core.js').TransformResultAny}
   */
  applyB (deltaB) {
    return renameAttrs(deltaB, this.brenames, this.arenames).reverse()
  }
}

/**
 * Template that renames node attributes (`a` -> `b`) in both directions. Stateless: it builds its
 * {@link AttrRenameTransformer} once and returns that same instance from every `init`.
 *
 * @template {{[K:string|number]:string|number}} Renames
 */
export class AttrRename extends Template {
  /**
   * @param {Renames} renames
   */
  constructor (renames) {
    super()
    /**
     * Retained (beyond the built transformer) so the `Renames` type parameter stays inferrable from
     * an `AttrRename<Renames>` instance - `pipe`'s `ApplyPipe` dispatches on `infer Renames`.
     *
     * @type {Renames}
     */
    this.renames = renames
    this.transformer = new AttrRenameTransformer(renames)
  }

  get stateless () { return true }

  /**
   * @template {delta.DeltaConf} IN
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN,ApplyAttrRename<Renames,IN>>}
   */
  init (_$d) {
    return /** @type {Transformer<IN,ApplyAttrRename<Renames,IN>>} */ (this.transformer)
  }
}

/**
 * Create an {@link AttrRename} template that renames the given node attributes in both directions.
 *
 * @template {{[K:string|number]:string|number}} Renames
 * @param {Renames} renames
 */
export const rename = renames => new AttrRename(renames)
