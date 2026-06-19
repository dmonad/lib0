import * as delta from '../delta.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * Relabels a node: side B carries the configured `name`, side A keeps the source node's original
 * name. Otherwise identity. Useful to mark a `children`-mapped collection as `lib0:inline` (so a
 * downstream {@link import('./inline.js').inline}`(['lib0:inline'])` splices it into its parent) or
 * simply to rename the container (e.g. a data collection projected as a `<ul>`).
 *
 * @extends {Transformer<any,any>}
 */
export class RenameTransformer extends Transformer {
  /**
   * @param {string} name
   */
  constructor (name) {
    super()
    this.target = name
    /** @type {string|undefined} */
    this.srcName = undefined
  }

  /**
   * @param {delta.DeltaBuilderAny} d
   * @return {import('./core.js').TransformResultAny}
   */
  applyA (d) {
    if (d.name != null) this.srcName = d.name
    const out = delta.clone(d)
    out.name = /** @type {any} */ (this.target)
    return createTransformResult(null, out)
  }

  /**
   * @param {delta.DeltaBuilderAny} d
   * @return {import('./core.js').TransformResultAny}
   */
  applyB (d) {
    const out = delta.clone(d)
    out.name = /** @type {any} */ (this.srcName)
    return createTransformResult(out, null)
  }
}

/**
 * Template for {@link RenameTransformer}.
 */
export class Rename extends Template {
  /**
   * @param {string} name
   */
  constructor (name) {
    super()
    this.target = name
  }

  get stateless () { return false }

  /**
   * @param {import('../../schema.js').Schema<delta.DeltaAny>} _$d
   * @return {Transformer<any,any>}
   */
  init (_$d) {
    return new RenameTransformer(this.target)
  }
}

/**
 * Create a {@link Rename} template that relabels a node to `name` (side B) and back (side A).
 *
 * @param {string} name
 */
export const rename = name => new Rename(name)
