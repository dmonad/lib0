import * as delta from '../delta.js'
import * as math from '../../math.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * A `lib0:value` carrier node holds a single scalar in its `value` attribute (the convention
 * established by the {@link import('./attr.js').attr} transformer). At a *child* position such a
 * node is resolved to a one-position **embed** of that scalar; at an *attr* position carriers are
 * resolved by {@link import('./project.js').project} itself (it owns the position knowledge).
 *
 * @param {any} el
 * @return {boolean}
 */
const isValueNode = el => delta.$deltaAny.check(el) && el.name === 'lib0:value'

/**
 * The scalar carried by a `lib0:value` delta (its `value` attribute op's value), or `undefined`.
 *
 * @param {delta.DeltaAny} el
 */
const valueOf = el => /** @type {any} */ (el.attrs).value?.value

/**
 * Stateful transformer that resolves `lib0:value` carrier *children* of a node: a `lib0:value` node
 * (1 position) becomes an embed of its scalar value (1 position), and back. Count-preserving, so a
 * single sparse positional map (`insert([1])` at carrier positions, coalesced `retain(n)` over
 * gaps) indexes both directions - the same `childTs` technique as {@link import('./children.js')}.
 *
 * A standalone, *composable* one-level resolver (the `lib0:value` counterpart of
 * {@link import('./inline.js').inline}`(['lib0:inline'])`): place it after any transformer that emits
 * `lib0:value` carriers, or compose it with {@link import('./children.js').children} to descend into
 * deeper levels. `project` lifts the carriers in its *own* structure, so `unwrapValue` is only needed
 * for carriers emitted by a non-`project` transformer.
 *
 * Editing a resolved scalar from side B (the view) is not round-tripped in v1: a value *update*
 * driven from side A (a `modify` on the carrier) maps to `delete(1).insert([newValue])`, but a side
 * B `delete`+`insert` of the embed is treated structurally.
 *
 * @extends {Transformer<any,any>}
 */
export class UnwrapValueTransformer extends Transformer {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   */
  constructor ($in, $out) {
    super($in, $out)
    /**
     * Sparse positional map of carriers: `insert([1])` at each `lib0:value` child, `retain(n)` over
     * gaps (text and pass-through nodes).
     *
     * @type {delta.DeltaBuilderAny}
     */
    this.map = delta.create()
  }

  /**
   * @param {delta.DeltaBuilderAny} d the change to map
   * @param {boolean} fwd `true` maps side A (carriers present) -> B (resolved), `false` maps back
   * @return {import('./core.js').TransformResultAny}
   */
  transform (d, fwd) {
    // `cloneShallow` carries the node's name, attribute ops, and own (root) marks; only child nodes are
    // (re)built below, and nested children's marks ride on those rebuilt children. It is the shared
    // mark-carrying primitive, so this node's marks cannot be silently dropped. `any` keeps `out` within
    // the shared TS instantiation budget (see {@link import('./inline.js')}).
    const out = /** @type {any} */ (delta.cloneShallow(d))
    const newMap = delta.create()
    let srcNode = this.map.children.start
    let srcOff = 0
    /**
     * Copy `n` positions from the old map to `newMap`, advancing the cursor.
     *
     * @param {number} n
     */
    const carry = n => {
      let rem = n
      while (rem > 0 && srcNode != null) {
        const take = math.min(srcNode.length - srcOff, rem)
        if (delta.$insertOp.check(srcNode)) {
          newMap.insert(srcNode.insert.slice(srcOff, srcOff + take))
        } else {
          newMap.retain(take)
        }
        srcOff += take
        rem -= take
        if (srcOff >= srcNode.length) { srcNode = srcNode.next; srcOff = 0 }
      }
    }
    /**
     * Advance the cursor `n` positions without copying.
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
    // whether the cursor currently sits on a carrier position
    const peekCarrier = () => srcNode != null && delta.$insertOp.check(srcNode)
    for (const op of d.children) {
      if (delta.$retainOp.check(op)) {
        out.retain(op.retain, op.format, op.attribution)
        carry(op.retain)
      } else if (delta.$textOp.check(op)) {
        out.insert(op.insert, op.format, op.attribution)
        newMap.retain(op.insert.length) // text is a gap
      } else if (delta.$insertOp.check(op)) {
        for (const el of op.insert) {
          if (fwd && isValueNode(el)) {
            out.insert([valueOf(el)], op.format, op.attribution)
            newMap.insert([1]) // mark carrier
          } else {
            out.insert([el], op.format, op.attribution)
            newMap.retain(1) // pass-through / literal
          }
        }
      } else if (delta.$deleteOp.check(op)) {
        out.delete(op.delete)
        drop(op.delete)
      } else if (delta.$modifyOp.check(op)) {
        if (fwd && peekCarrier()) {
          // a value update arrives as a `modify` on the carrier node setting its `value` attr
          const newV = /** @type {any} */ (op.value.attrs).value?.value
          if (newV !== undefined) {
            out.delete(1)
            out.insert([newV], op.format, op.attribution)
          } else {
            out.retain(1, op.format, op.attribution)
          }
        } else {
          out.modify(delta.clone(op.value), op.format, op.attribution)
        }
        carry(1)
      }
    }
    carry(Infinity) // trailing untouched positions
    out.done(false)
    this.map = newMap
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
 * A `lib0:value` carrier child lifts to its scalar `value` type; any other child passes through.
 * Naked-param conditional, so it distributes over a children union.
 *
 * @template C
 * @typedef {C extends delta.Delta<{ name: 'lib0:value', attrs: { value: infer V extends import('../../trait/fingerprint.js').Fingerprintable } }> ? V : C} UnwrapValueChild
 */

/**
 * `unwrapValue`'s output conf: `IN` with every `lib0:value` carrier child replaced by its lifted
 * scalar (see {@link UnwrapValueChild}); name/attrs/text unchanged.
 *
 * @template {delta.DeltaConf} IN
 * @typedef {import('./core.js').ResolveOut<delta.DeltaConfOverwrite<IN, { children: UnwrapValueChild<delta.DeltaConfGetChildren<IN>> }>>} UnwrapValueOut
 */

/**
 * Template for {@link UnwrapValueTransformer}.
 *
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, UnwrapValueOut<IN>>}
 */
export class UnwrapValue extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
   */
  constructor ($d) {
    super($d, /** @type {any} */ (delta.$deltaAny))
  }

  get name () { return 'lib0:unwrapValue' }

  /**
   * @return {Transformer<IN, UnwrapValueOut<IN>>}
   */
  init () {
    return /** @type {any} */ (new UnwrapValueTransformer(this.$in, this.$out))
  }
}

/**
 * Resolve `lib0:value` carrier *children* to embeds of their scalar value (and back). One level
 * only; compose with {@link import('./children.js').children} to descend. A flat, composable resolver
 * for carriers emitted *outside* a `project` (which lifts its own); symmetric with
 * {@link import('./inline.js').inline}`(['lib0:inline'])`. Returns a reusable {@link UnwrapValue}
 * template (`.init()` for a standalone transformer).
 *
 * @template {delta.DeltaConf} IN
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @return {UnwrapValue<IN>}
 */
export const unwrapValue = $d => new UnwrapValue($d)
