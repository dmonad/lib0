import * as delta from '../delta.js'
import * as math from '../../math.js'
import { Transformer, createTransformResult } from './core.js'

/**
 * @typedef {import('./core.js').Template} Template
 */

/**
 * Replace each null-node child (a child delta with no `name`) by its own children; keep named-node
 * children. One level only - a null node nested inside another stays a node.
 *
 * @template Children
 * @typedef {Children extends delta.Delta<infer C extends delta.DeltaConf>
 *   ? (C extends { name: string } ? Children : delta.DeltaConfGetChildren<C>)
 *   : Children} InlineNullChildren
 */

/**
 * `true` if any null-node child of `IN` allows text - inlining merges that text into the parent.
 *
 * @template {delta.DeltaConf} IN
 * @typedef {(delta.DeltaConfGetChildren<IN> extends delta.Delta<infer C extends delta.DeltaConf>
 *   ? (C extends { name: string } ? never : (delta.DeltaConfGetText<C> extends string ? true : never))
 *   : never) extends never ? false : true} NullChildHasText
 */

/**
 * Output conf of inlining null nodes: every null node's children (and text) are merged into the
 * parent and the null wrapper is dropped; name, attrs and named-node children are unchanged. One
 * level only. `any` in yields `any` out (via DeltaConfOverwrite's TypeIsAny short-circuit).
 *
 * @template {delta.DeltaConf} IN
 * @typedef {import('../../ts.js').TypeIsAny<IN, any, delta.DeltaConfOverwrite<IN,
 *   { children: InlineNullChildren<delta.DeltaConfGetChildren<IN>> }
 *   & (NullChildHasText<IN> extends true ? { text: true } : {})
 * >>} ApplyInlineNullNodes
 */

/**
 * One entry of the segment layout maintained by InlineNullNodesTransformer. A segment is either a
 * coalesced run of pass-through positions (root text + opaque/named nodes - same length in both
 * coordinate spaces) or a single null node (1 structured position that expands to `inlineLen`
 * inlined positions).
 */
class Seg {
  /**
   * @param {boolean} isNull
   * @param {number} structLen
   * @param {number} inlineLen
   */
  constructor (isNull, structLen, inlineLen) {
    this.isNull = isNull
    this.structLen = structLen
    this.inlineLen = inlineLen
  }
}

/**
 * A "null node" is an anonymous/typeless child node (`name === null`) that gets inlined into its
 * parent's child sequence.
 *
 * @param {any} el
 * @return {boolean}
 */
const isNullNode = el => delta.$deltaAny.check(el) && el.name === null

/**
 * Whether any direct child of `d` is a null node - the only thing this transformer inlines. Called
 * on each incoming change to feed the cached {@link InlineNullNodesTransformer#hasNullNode} flag,
 * which drives the fast-path: while no null node has ever appeared, the structured and inlined
 * representations are identical and a change is its own transform. A null node nested inside a named
 * node is opaque (one level) and intentionally not counted.
 *
 * @param {delta.DeltaAny} d
 * @return {boolean}
 */
const hasNullNodeChild = d => {
  for (const op of d.children) {
    if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (isNullNode(el)) return true
      }
    }
  }
  return false
}

/**
 * Derive the segment layout (the "offsets and inline node length" state) from a settled structured
 * state. One level only: the children of a direct null node are counted via its `childCnt`, but a
 * null node nested deeper is just an opaque element of length 1.
 *
 * @param {delta.DeltaAny} d
 * @return {Array<Seg>}
 */
const deriveSegs = d => {
  /**
   * @type {Array<Seg>}
   */
  const segs = []
  /**
   * @param {number} len
   */
  const pushPass = len => {
    const last = segs[segs.length - 1]
    if (last !== undefined && !last.isNull) {
      last.structLen += len
      last.inlineLen += len
    } else {
      segs.push(new Seg(false, len, len))
    }
  }
  for (const op of d.children) {
    if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (isNullNode(el)) {
          segs.push(new Seg(true, 1, /** @type {delta.DeltaAny} */ (el).childCnt))
        } else {
          pushPass(1)
        }
      }
    } else if (delta.$textOp.check(op)) {
      pushPass(op.insert.length)
    }
    // a settled state only contains insert/text ops; anything else is ignored defensively
  }
  return segs
}

/**
 * Build an output delta that passes through the node name and attribute ops of `src` (only the
 * children are transformed by this transformer).
 *
 * reason: returns `any` rather than `DeltaBuilderAny` on purpose. The result is internal scratch the
 * transformer mutates with fluent builder calls; typing it would instantiate a `DeltaConfOverwrite`
 * per call, and across this file that tips the shared TS2589 instantiation budget that the long
 * pipe-type test (delta-transformer.test.js) sits against. The public output type lives on `init`.
 *
 * @param {delta.DeltaAny} src
 * @return {any}
 */
const passThrough = src => {
  const d = delta.create(/** @type {any} */ (src.name))
  for (const op of src.attrs) {
    // reason: `attrs` is a mapped type over the conf's attr keys, so a dynamic-key write can't be
    // checked (same limitation delta.slice suppresses when copying attrs).
    // @ts-ignore
    d.attrs[op.key] = op.clone()
  }
  return d
}

/**
 * Stateful transformer that inlines null-type child nodes. Side A is the structured representation
 * (null nodes present, e.g. `<p>some<>text</></p>`), side B is the inlined representation (null
 * nodes flattened, e.g. `<p>sometext</p>`).
 *
 * The state the user calls "offsets and inline node length" is the segment layout, derived on each
 * apply from `aState` - a mirror of the structured side that is kept current by applying every
 * mapped change to it.
 *
 * @extends {Transformer<any,any>}
 */
export class InlineNullNodesTransformer extends Transformer {
  constructor () {
    super()
    /**
     * @type {delta.DeltaBuilderAny}
     */
    this.aState = delta.create()
    /**
     * Whether `aState` has ever contained a direct null node child - the cached value of
     * `hasNullNodeChild(this.aState)`. Monotonic: once a change introduces a null node it stays set
     * (even if that node is later deleted), which only costs a missed fast-path, never correctness.
     *
     * @type {boolean}
     */
    this.hasNullNode = false
  }

  /**
   * structured change -> inlined change
   *
   * @param {delta.DeltaBuilderAny} da
   */
  applyA (da) {
    this.hasNullNode ||= hasNullNodeChild(da)
    if (!this.hasNullNode) {
      // fast-path: nothing to inline now or after this change - structured === inlined, so the
      // change passes through unchanged. Keep the mirror current and hand back the same delta.
      this.aState.apply(da)
      return createTransformResult(null, da)
    }
    const segs = deriveSegs(this.aState)
    const b = passThrough(da)
    let si = 0
    let so = 0
    let srcInline = 0
    let emitted = 0
    /**
     * @param {number} target
     */
    const alignB = target => {
      if (target > emitted) {
        b.retain(target - emitted)
        emitted = target
      }
    }
    /**
     * Advance the structured cursor by `n` positions, returning the inlined length spanned.
     *
     * @param {number} n
     */
    const advanceStruct = n => {
      let rem = n
      let inl = 0
      while (rem > 0 && si < segs.length) {
        const s = segs[si]
        const take = math.min(s.structLen - so, rem)
        inl += s.isNull ? s.inlineLen : take
        so += take
        rem -= take
        if (so >= s.structLen) {
          si++
          so = 0
        }
      }
      return inl
    }
    for (const op of da.children) {
      if (delta.$retainOp.check(op)) {
        if (op.format == null && op.attribution == null) {
          srcInline += advanceStruct(op.retain)
        } else {
          // formatted retain: emit the format over the mapped inline range. A null node's wrapper has
          // no inlined representation, so its format is dropped (consistent with the inliner); root
          // text and opaque nodes carry the format straight through.
          alignB(srcInline)
          let rem = op.retain
          while (rem > 0 && si < segs.length) {
            const s = segs[si]
            const take = math.min(s.structLen - so, rem)
            const inl = s.isNull ? s.inlineLen : take
            b.retain(inl, s.isNull ? null : op.format, s.isNull ? null : op.attribution)
            emitted += inl
            srcInline += inl
            so += take
            rem -= take
            if (so >= s.structLen) { si++; so = 0 }
          }
        }
      } else if (delta.$textOp.check(op)) {
        alignB(srcInline)
        b.insert(op.insert, op.format, op.attribution)
      } else if (delta.$insertOp.check(op)) {
        alignB(srcInline)
        for (const el of op.insert) {
          if (isNullNode(el)) {
            // splice the null node's children verbatim (one level)
            b.append(/** @type {delta.DeltaAny} */ (el))
          } else {
            b.insert([el], op.format, op.attribution)
          }
        }
      } else if (delta.$deleteOp.check(op)) {
        alignB(srcInline)
        const delInline = advanceStruct(op.delete)
        b.delete(delInline)
        srcInline += delInline
        emitted += delInline
      } else if (delta.$modifyOp.check(op)) {
        const s = segs[si]
        alignB(srcInline)
        if (s !== undefined && s.isNull) {
          // data side edited inside a null node: its inner ops act on the node's children, which are
          // spliced into b at the same offset - replay them directly
          for (const inner of op.value.children) {
            if (delta.$retainOp.check(inner)) {
              b.retain(inner.retain, inner.format, inner.attribution)
              emitted += inner.retain
            } else if (delta.$textOp.check(inner) || delta.$insertOp.check(inner)) {
              b.insert(inner.insert, inner.format, inner.attribution)
            } else if (delta.$deleteOp.check(inner)) {
              b.delete(inner.delete)
              emitted += inner.delete
            } else if (delta.$modifyOp.check(inner)) {
              b.modify(delta.clone(inner.value), inner.format, inner.attribution)
              emitted += 1
            }
          }
          srcInline += s.inlineLen
          advanceStruct(1)
        } else {
          // opaque (named) node: forward the modify verbatim
          b.modify(delta.clone(op.value), op.format, op.attribution)
          emitted += 1
          srcInline += advanceStruct(1)
        }
      }
    }
    this.aState.apply(da)
    b.done(false)
    return createTransformResult(null, b)
  }

  /**
   * inlined change -> structured change
   *
   * @param {delta.DeltaBuilderAny} db
   */
  applyB (db) {
    this.hasNullNode ||= hasNullNodeChild(db)
    if (!this.hasNullNode) {
      // fast-path: with no null nodes the inlined and structured coordinate spaces coincide, so the
      // inlined change is already the structured change.
      this.aState.apply(db)
      return createTransformResult(db, null)
    }
    const segs = deriveSegs(this.aState)
    const a = passThrough(db)
    let si = 0
    let so = 0
    let structBefore = 0
    let emittedStruct = 0
    // An accumulator for edits that fall inside the current null node. Several inlined ops can
    // target the same null node, so they must coalesce into a single `modify` op. `openSegIdx` is
    // the seg index it belongs to, or -1 when there is no open modify.
    let openInner = /** @type {any} */ (delta.create())
    let openNodeStruct = 0
    let openInnerEmitted = 0
    let openSegIdx = -1
    /**
     * @param {number} target
     */
    const alignA = target => {
      if (target > emittedStruct) {
        a.retain(target - emittedStruct)
        emittedStruct = target
      }
    }
    const flushModify = () => {
      if (openSegIdx !== -1) {
        alignA(openNodeStruct)
        a.modify(openInner.done(false))
        emittedStruct += 1
        openSegIdx = -1
      }
    }
    /**
     * @param {number} target inlined offset within the open null node
     */
    const alignInner = target => {
      if (target > openInnerEmitted) {
        openInner.retain(target - openInnerEmitted)
        openInnerEmitted = target
      }
    }
    /**
     * @param {number} idx
     */
    const openModifyFor = idx => {
      openInner = /** @type {any} */ (delta.create())
      openNodeStruct = structBefore
      openInnerEmitted = 0
      openSegIdx = idx
    }
    // empty null nodes (inlineLen 0) are zero-width in inlined coords - step over them. Only at a
    // seg boundary (so === 0); `so` does not change while skipping.
    const skipEmpty = () => {
      if (so !== 0) return
      while (si < segs.length && segs[si].isNull && segs[si].inlineLen === 0) {
        structBefore += segs[si].structLen
        si++
      }
    }
    for (const op of db.children) {
      if (delta.$retainOp.check(op)) {
        const fmt = op.format
        const attr = op.attribution
        let rem = op.retain
        while (rem > 0) {
          skipEmpty()
          if (si >= segs.length) break
          const s = segs[si]
          const take = math.min(s.inlineLen - so, rem)
          if (fmt != null || attr != null) {
            // a formatted retain re-formats existing content: pass-through content takes it
            // directly; content inside a null node is reached through a modify on that node.
            if (!s.isNull) {
              flushModify()
              alignA(structBefore + so)
              a.retain(take, fmt, attr)
              emittedStruct += take
            } else {
              if (openSegIdx !== si) {
                flushModify()
                openModifyFor(si)
              }
              alignInner(so)
              openInner.retain(take, fmt, attr)
              openInnerEmitted += take
            }
          }
          so += take
          rem -= take
          if (so >= s.inlineLen) {
            structBefore += s.structLen
            si++
            so = 0
          }
        }
      } else if (delta.$textOp.check(op) || delta.$insertOp.check(op)) {
        skipEmpty()
        const s = segs[si]
        if (s === undefined) {
          flushModify()
          alignA(structBefore)
          a.insert(op.insert, op.format, op.attribution)
        } else if (!s.isNull) {
          flushModify()
          alignA(structBefore + so)
          a.insert(op.insert, op.format, op.attribution)
        } else if (so === 0) {
          // boundary preference: an insert at the start of a null node lands in the root
          flushModify()
          alignA(structBefore)
          a.insert(op.insert, op.format, op.attribution)
        } else {
          // strict interior: insert into the null node
          if (openSegIdx !== si) {
            flushModify()
            openModifyFor(si)
          }
          alignInner(so)
          openInner.insert(op.insert, op.format, op.attribution)
        }
        // an insert does not advance the cursor (it adds content not in the original)
      } else if (delta.$deleteOp.check(op)) {
        let rem = op.delete
        while (rem > 0) {
          skipEmpty()
          if (si >= segs.length) break
          const s = segs[si]
          if (!s.isNull) {
            const k = math.min(s.inlineLen - so, rem)
            flushModify()
            alignA(structBefore + so)
            a.delete(k)
            emittedStruct += k
            so += k
            rem -= k
            if (so >= s.inlineLen) {
              structBefore += s.structLen
              si++
              so = 0
            }
          } else if (so === 0 && rem >= s.inlineLen) {
            // the delete covers the whole node from its start - delete it structurally
            flushModify()
            alignA(structBefore)
            a.delete(1)
            emittedStruct += 1
            rem -= s.inlineLen
            structBefore += s.structLen
            si++
            so = 0
          } else {
            // strict interior delete: remove inside the null node
            const k = math.min(s.inlineLen - so, rem)
            if (openSegIdx !== si) {
              flushModify()
              openModifyFor(si)
            }
            alignInner(so)
            openInner.delete(k)
            openInnerEmitted += k
            so += k
            rem -= k
            if (so >= s.inlineLen) {
              structBefore += s.structLen
              si++
              so = 0
            }
          }
        }
      } else if (delta.$modifyOp.check(op)) {
        skipEmpty()
        const s = segs[si]
        if (s !== undefined && s.isNull) {
          // modify targets an element inside the null node
          if (openSegIdx !== si) {
            flushModify()
            openModifyFor(si)
          }
          alignInner(so)
          openInner.modify(delta.clone(op.value), op.format, op.attribution)
          openInnerEmitted += 1
          so += 1
          if (so >= s.inlineLen) {
            structBefore += s.structLen
            si++
            so = 0
          }
        } else if (s !== undefined) {
          flushModify()
          alignA(structBefore + so)
          a.modify(delta.clone(op.value), op.format, op.attribution)
          emittedStruct += 1
          so += 1
          if (so >= s.inlineLen) {
            structBefore += s.structLen
            si++
            so = 0
          }
        }
      }
    }
    flushModify()
    this.aState.apply(a)
    a.done(false)
    return createTransformResult(a, null)
  }
}

/**
 * Template for {@link InlineNullNodesTransformer}.
 *
 * @implements Template
 */
export class InlineNullNodes {
  get stateless () { return false }

  /**
   * @template {delta.DeltaConf} IN
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN, ApplyInlineNullNodes<IN>>}
   */
  init (_$d) {
    return new InlineNullNodesTransformer()
  }
}

/**
 * Inline null-type child nodes (`<p>some<>text</></p>` <-> `<p>sometext</p>`). Stateful: the
 * returned template's `init()` yields a fresh {@link InlineNullNodesTransformer}.
 */
export const inlineNullNodes = () => new InlineNullNodes()
