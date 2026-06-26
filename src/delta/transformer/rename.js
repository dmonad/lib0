import * as delta from '../delta.js'
import { Transformer, Template, createTransformResult, withName } from './core.js'

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
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   * @param {string} name
   */
  constructor ($in, $out, name) {
    super($in, $out)
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
 *
 * @template {string} Name
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, delta.DeltaConfOverwrite<IN, { name: Name }>>}
 */
export class Rename extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
   * @param {Name} name
   */
  constructor ($d, name) {
    super($d, /** @type {any} */ (withName($d, name)))
    this.target = name
  }

  get fpName () { return 'lib0:rename:' + this.target }

  /**
   * @return {Transformer<IN, delta.DeltaConfOverwrite<IN, { name: Name }>>}
   */
  init () {
    return /** @type {any} */ (new RenameTransformer(this.$in, this.$out, this.target))
  }
}

/**
 * Relabel a node to `name` (side B) and back (side A). Returns a reusable {@link Rename} template
 * (a `project` hole, or `.init()` for a standalone transformer).
 *
 * @template {delta.DeltaConf} IN
 * @template {string} Name
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @param {Name} name
 * @return {Rename<Name, IN>}
 */
export const rename = ($d, name) => new Rename($d, name)
