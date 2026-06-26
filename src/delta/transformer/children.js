import * as delta from '../delta.js'
import * as math from '../../math.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * Stateful transformer that descends one level into a node's child *nodes* and applies a per-child
 * sub-transformer, chosen by `handler`. Attributes and text pass through untouched. Designed to be
 * applied recursively (see {@link children}).
 *
 * The per-child sub-transformer instances are kept in {@link ChildrenTransformer#childTs}, positionally
 * aligned to the parent's child list (children carry no stable id - identity is positional). `children`
 * never changes the child count at its own level, so side A and side B stay aligned position-for-
 * position and the same `childTs` indexes both directions.
 *
 * `childTs` is a sparse positional map kept as a delta: each transformed child is an `insert([t])` op
 * holding its sub-transformer; every other position (text runs, opted-out nodes) is a coalesced
 * `retain(n)` gap. A run of N text characters costs one retain op, not N array slots. It is walked with
 * a forward cursor in step with the change (see {@link ChildrenTransformer#transform}). Transformer
 * instances are carried by reference across rebuilds, so their per-instance state survives.
 *
 * @extends {Transformer<any,any>}
 */
export class ChildrenTransformer extends Transformer {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   * @param {(child: delta.DeltaAny, $child: import('../../schema.js').Schema<delta.DeltaAny>) => Template | null} handler
   * picks the (schema-bound) template for a child node, or `null` to leave it untransformed. Evaluated
   * once, when the child is inserted, with the derived per-child schema.
   * @param {import('../../schema.js').Schema<delta.DeltaAny>} childSchema per-child-node schema each
   * sub-template is built against (derived from the parent's input schema; `$deltaAny` when not derivable).
   */
  constructor ($in, $out, handler, childSchema) {
    super($in, $out)
    this.handler = handler
    /**
     * Sparse positional map of sub-transformers: `insert([t])` at each transformed child, `retain(n)`
     * over gaps (text and opted-out nodes).
     *
     * @type {delta.DeltaBuilderAny}
     */
    this.childTs = delta.create()
    this.childSchema = childSchema
  }

  /**
   * @param {delta.DeltaBuilderAny} d the change to map
   * @param {boolean} fwd `true` maps side A -> B (applying sub-transformers' `applyA`), `false` maps
   * side B -> A. `children` is 1:1 over children, so the same `childTs` indexes both directions.
   * @return {import('./core.js').TransformResultAny}
   */
  transform (d, fwd) {
    // `cloneShallow` carries the node's name, attribute ops, and own (root) marks; only the child nodes
    // are (re)built below, and nested children's marks ride on those rebuilt children. It is the shared
    // mark-carrying primitive, so this node's marks cannot be silently dropped. `any` keeps `out` within
    // the shared TS instantiation budget (see {@link import('./inline.js')}).
    const out = /** @type {any} */ (delta.cloneShallow(d))
    // Walk the old sparse map with a forward cursor while rebuilding a fresh one. The cursor tracks an
    // old-side child position (list node + offset within it).
    const newTs = delta.create()
    let srcNode = this.childTs.children.start
    let srcOff = 0
    /**
     * Copy `n` positions from the old map to `newTs`, advancing the cursor. Transformer references are
     * preserved (the array slice is shallow), so their per-instance state survives the rebuild.
     *
     * @param {number} n
     */
    const carry = n => {
      let rem = n
      while (rem > 0 && srcNode != null) {
        const take = math.min(srcNode.length - srcOff, rem)
        if (delta.$insertOp.check(srcNode)) {
          newTs.insert(srcNode.insert.slice(srcOff, srcOff + take))
        } else {
          newTs.retain(take)
        }
        srcOff += take
        rem -= take
        if (srcOff >= srcNode.length) { srcNode = srcNode.next; srcOff = 0 }
      }
    }
    /**
     * Advance the cursor `n` positions without copying (a delete drops those transformers).
     *
     * @param {number} n
     */
    const drop = n => {
      let rem = n
      while (rem > 0 && srcNode != null) {
        const take = math.min(srcNode.length - srcOff, rem)
        srcOff += take
        rem -= take
        if (srcOff >= srcNode.length) { srcNode = srcNode.next; srcOff = 0 }
      }
    }
    // the sub-transformer at the cursor, or null for a gap (text / opted-out node)
    const peek = () => (srcNode != null && delta.$insertOp.check(srcNode)) ? srcNode.insert[srcOff] : null
    for (const op of d.children) {
      if (delta.$retainOp.check(op)) {
        out.retain(op.retain, op.format, op.attribution)
        carry(op.retain)
      } else if (delta.$textOp.check(op)) {
        out.insert(op.insert, op.format, op.attribution)
        newTs.retain(op.insert.length) // text is a gap - no sub-transformer
      } else if (delta.$insertOp.check(op)) {
        for (const el of op.insert) {
          const tmpl = delta.$deltaAny.check(el) ? this.handler(el, this.childSchema) : null
          if (tmpl != null) {
            const t = tmpl.init()
            const r = fwd ? t.applyA(el) : t.applyB(el)
            out.insert([fwd ? r.b : r.a], op.format, op.attribution)
            newTs.insert([t])
          } else {
            out.insert([el], op.format, op.attribution)
            newTs.retain(1) // opted-out node is a gap
          }
        }
      } else if (delta.$deleteOp.check(op)) {
        out.delete(op.delete)
        drop(op.delete)
      } else if (delta.$modifyOp.check(op)) {
        const t = peek()
        if (t != null) {
          // op.value is an immutable Delta view; transformers consume a DeltaBuilder, so clone it
          const r = fwd ? t.applyA(delta.clone(op.value)) : t.applyB(delta.clone(op.value))
          out.modify(fwd ? r.b : r.a, op.format, op.attribution)
        } else {
          out.modify(delta.clone(op.value), op.format, op.attribution)
        }
        carry(1)
      }
    }
    // the change implicitly retains everything after its last op - carry those untouched positions'
    // sub-transformers into the rebuilt map (out, being a change, needs no trailing retain)
    carry(Infinity)
    out.done(false)
    this.childTs = newTs
    return fwd ? createTransformResult(null, out) : createTransformResult(out, null)
  }

  /**
   * @param {delta.DeltaBuilderAny} da
   */
  applyA (da) {
    return this.transform(da, true)
  }

  /**
   * @param {delta.DeltaBuilderAny} db
   */
  applyB (db) {
    return this.transform(db, false)
  }
}

/**
 * Derive the per-child-node schema from the parent's input schema, so each child's sub-transformer is
 * built against a concrete schema instead of `$deltaAny`. Falls back to `$deltaAny`.
 *
 * @param {import('../../schema.js').Schema<delta.DeltaAny>} $in
 * @return {import('../../schema.js').Schema<delta.DeltaAny>}
 */
const childSchemaOf = ($in) => {
  if (!delta.$$delta.check($in)) return delta.$deltaAny
  if ($in.shape.recursiveChildren) return $in
  const $ch = $in.shape.$children
  return delta.$$delta.check($ch) ? $ch : delta.$deltaAny
}

/**
 * Template for {@link ChildrenTransformer}.
 *
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, any>}
 */
export class Children extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
   * @param {(child: delta.DeltaAny, $child: import('../../schema.js').Schema<delta.DeltaAny>) => Template | null} handler
   */
  constructor ($d, handler) {
    super($d, /** @type {any} */ (delta.$deltaAny))
    this.handler = handler
    /**
     * @type {import('../../schema.js').Schema<delta.DeltaAny>}
     */
    this.childSchema = childSchemaOf($d)
  }

  get fpName () { return 'lib0:children' }

  /**
   * @return {Transformer<IN, any>}
   */
  init () {
    return new ChildrenTransformer(this.$in, this.$out, this.handler, this.childSchema)
  }
}

/**
 * Descend one level into a node's child *nodes* and apply a sub-transformer to each, chosen by
 * `handler(childNode, $child)`: return a {@link Template} to transform that child, or `null` to leave
 * it untransformed. The handler receives the derived per-child schema `$child` so it can build
 * schema-bound sub-templates. Attributes and text pass through. The handler is evaluated once, when
 * the child is inserted (returning `null` opts the child out permanently). Returns a reusable
 * {@link Children} template (a `project` hole, or `.init()` for a standalone transformer).
 *
 * Composes recursively - e.g. inline every anonymous node at every depth:
 * ```js
 * const inlineAll = $d => children($d, (_c, $c) => pipe($c, $c1 => inline($c1, [null]), inlineAll))
 * ```
 *
 * @template {delta.DeltaConf} IN
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @param {(child: delta.DeltaAny, $child: import('../../schema.js').Schema<delta.DeltaAny>) => Template | null} handler
 * @return {Children<IN>}
 */
export const children = ($d, handler) => new Children($d, handler)
