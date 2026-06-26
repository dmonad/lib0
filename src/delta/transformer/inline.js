import * as delta from '../delta.js'
import * as math from '../../math.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * The (unexported) delta {@link import('../delta.js').createMark Mark} type, referenced here for the
 * local mark-bucketing annotations.
 *
 * @typedef {ReturnType<typeof delta.createMark>} Mark
 */

/**
 * One entry of the segment layout maintained by {@link InlineTransformer}. A segment is either a
 * coalesced run of pass-through positions (root text + opaque non-inlined nodes - same length in both
 * coordinate spaces) or a single inline node (1 structured position that expands to `inlineLen`
 * inlined positions).
 */
class Seg {
  /**
   * @param {boolean} isInline whether this seg is an inline node (its children are spliced into the parent)
   * @param {number} structLen
   * @param {number} inlineLen
   */
  constructor (isInline, structLen, inlineLen) {
    this.isInline = isInline
    this.structLen = structLen
    this.inlineLen = inlineLen
  }
}

/**
 * Whether `el` is a child node that should be inlined - i.e. a node delta whose `name` is in the
 * configured `names` set (use `null` to select anonymous/typeless nodes).
 *
 * @param {any} el
 * @param {Array<string|null>} names
 * @return {boolean}
 */
const isInlineNode = (el, names) => delta.$deltaAny.check(el) && names.includes(el.name)

/**
 * Whether any direct child of `d` is an inline node - the only thing this transformer inlines. Called
 * on each incoming change to feed the cached {@link InlineTransformer#hasInline} flag, which drives
 * the fast-path: while no inline node has ever appeared, the structured and inlined representations
 * are identical and a change is its own transform. An inline node nested inside a non-inlined node is
 * opaque (one level) and intentionally not counted.
 *
 * @param {delta.DeltaAny} d
 * @param {Array<string|null>} names
 * @return {boolean}
 */
const hasInlineChild = (d, names) => {
  for (const op of d.children) {
    if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (isInlineNode(el, names)) return true
      }
    }
  }
  return false
}

/**
 * Net change in a parent's direct child count from applying a settled child-change delta: positions
 * inserted minus positions deleted (retain/modify keep the count). Lets an inline node's inlined
 * length be kept current when a `modify` edits it, without re-deriving the node's children.
 *
 * @param {delta.DeltaAny} d
 * @return {number}
 */
const netLen = d => {
  let n = 0
  for (const op of d.children) {
    if (delta.$insertOp.check(op) || delta.$textOp.check(op)) {
      n += op.insert.length
    } else if (delta.$deleteOp.check(op)) {
      n -= op.delete
    }
  }
  return n
}

/**
 * Apply a settled *structured* change to the segment layout `segs` in place, advancing it to the
 * layout of the changed state without re-deriving the whole list. The cursor `(si, so)` is a
 * structured position - seg index plus structural offset within that seg. The layout is kept
 * coalesced (no two adjacent pass-through segs, no empty pass-through seg; every inline node is its
 * own length-1 seg, kept even when its inlined length is 0) so it stays identical to a from-scratch
 * derivation of the settled state. One level only: a direct inline node's length is `childCnt`; an
 * inline node nested deeper is an opaque element of length 1.
 *
 * @param {Array<Seg>} segs
 * @param {delta.DeltaAny} change
 * @param {Array<string|null>} names the node names that are inlined (see {@link isInlineNode})
 */
const applySegsChange = (segs, change, names) => {
  let si = 0
  let so = 0
  // Move the cursor onto a seg boundary (so === 0), splitting the current pass-through seg if the
  // cursor sits in its interior. A null seg has structLen 1, so the cursor is never in its interior.
  const ensureBoundary = () => {
    if (so === 0) return
    const s = segs[si]
    segs.splice(si + 1, 0, new Seg(false, s.structLen - so, s.inlineLen - so))
    s.structLen = so
    s.inlineLen = so
    si++
    so = 0
  }
  for (const op of change.children) {
    if (delta.$retainOp.check(op)) {
      // formats on a retain never change the layout - just advance the cursor
      let rem = op.retain
      while (rem > 0 && si < segs.length) {
        const room = segs[si].structLen - so
        if (rem < room) {
          so += rem
          rem = 0
        } else {
          rem -= room
          si++
          so = 0
        }
      }
    } else if (delta.$textOp.check(op) || delta.$insertOp.check(op)) {
      // Build the inserted layout: a text op is one pass-through run; an insert op is a mix of
      // length-1 null segs and pass-through runs that coalesce the opaque (named) elements.
      /** @type {Array<Seg>} */
      const ins = []
      if (delta.$textOp.check(op)) {
        ins.push(new Seg(false, op.insert.length, op.insert.length))
      } else {
        for (const el of op.insert) {
          const last = ins[ins.length - 1]
          if (isInlineNode(el, names)) {
            ins.push(new Seg(true, 1, /** @type {delta.DeltaAny} */ (el).childCnt))
          } else if (last !== undefined && !last.isInline) {
            last.structLen++
            last.inlineLen++
          } else {
            ins.push(new Seg(false, 1, 1))
          }
        }
      }
      if (ins.length === 1 && !ins[0].isInline) {
        // fast path - pure pass-through content grows an adjacent run (no split); the common case
        const len = ins[0].structLen
        if (so > 0) {
          segs[si].structLen += len
          segs[si].inlineLen += len
          so += len
        } else if (si > 0 && !segs[si - 1].isInline) {
          segs[si - 1].structLen += len
          segs[si - 1].inlineLen += len
        } else if (si < segs.length && !segs[si].isInline) {
          segs[si].structLen += len
          segs[si].inlineLen += len
          so = len
        } else {
          segs.splice(si, 0, ins[0])
          si++
        }
      } else {
        // general case (the content contains an inline node): land on a boundary, then coalesce the
        // block's pass-through ends into the surrounding runs
        ensureBoundary()
        let block = ins
        if (si > 0 && !segs[si - 1].isInline && !block[0].isInline) {
          segs[si - 1].structLen += block[0].structLen
          segs[si - 1].inlineLen += block[0].inlineLen
          block = block.slice(1)
        }
        let tail = 0
        if (si < segs.length && !segs[si].isInline && block.length > 0 && !block[block.length - 1].isInline) {
          const lastSeg = block[block.length - 1]
          tail = lastSeg.structLen
          segs[si].structLen += lastSeg.structLen
          segs[si].inlineLen += lastSeg.inlineLen
          block = block.slice(0, -1)
        }
        segs.splice(si, 0, ...block)
        si += block.length
        so = tail
      }
    } else if (delta.$deleteOp.check(op)) {
      ensureBoundary()
      let rem = op.delete
      while (rem > 0 && si < segs.length) {
        const s = segs[si]
        if (s.isInline) {
          // the single structured position is the whole inline node
          segs.splice(si, 1)
          rem -= 1
        } else {
          const take = math.min(s.structLen, rem)
          s.structLen -= take
          s.inlineLen -= take
          rem -= take
          if (s.structLen === 0) segs.splice(si, 1)
          // a partial delete leaves rem 0 and the shortened seg in place
        }
      }
      // a deletion can bring two pass-through runs together - coalesce, keeping the cursor on the seam
      if (si > 0 && si < segs.length && !segs[si - 1].isInline && !segs[si].isInline) {
        const leftLen = segs[si - 1].structLen
        segs[si - 1].structLen += segs[si].structLen
        segs[si - 1].inlineLen += segs[si].inlineLen
        segs.splice(si, 1)
        si--
        so = leftLen
      }
    } else if (delta.$modifyOp.check(op)) {
      if (si < segs.length) {
        const s = segs[si]
        if (so === 0 && s.isInline) {
          // editing inside an inline node changes only its inlined length
          s.inlineLen += netLen(op.value)
          si++
        } else {
          // an opaque (named) node - no layout change; step over its single structured position
          so++
          if (so >= s.structLen) {
            si++
            so = 0
          }
        }
      }
    }
  }
}

/**
 * Map a structured root-mark offset to its inlined offset through the seg layout. A mark on a
 * pass-through position keeps its in-run offset; a mark on an inline node's own structured position
 * maps to that node's inlined start (its `childStart`). A key past the end clamps to the inlined end
 * (a change-delta root mark may sit at the trailing implicit-retain boundary).
 *
 * @param {Array<Seg>} segs
 * @param {number} key
 * @return {number}
 */
const structOffsetToInlineOffset = (segs, key) => {
  let s = 0
  let inl = 0
  for (const seg of segs) {
    if (key < s + seg.structLen) return seg.isInline ? inl : inl + (key - s)
    s += seg.structLen
    inl += seg.inlineLen
  }
  return inl
}

/**
 * Map an inlined root-mark offset to a structured location. `inner` is `null` for a pass-through
 * position (the mark is a structured root mark at `struct`); otherwise the offset fell inside the
 * inline node at structured position `struct` (seg index `si`), and `inner` is the offset within that
 * node. A key past the end clamps to the structured end.
 *
 * @param {Array<Seg>} segs
 * @param {number} key
 * @return {{ struct: number, inner: number|null, si: number }}
 */
const inlineOffsetToStructLocation = (segs, key) => {
  let s = 0
  let inl = 0
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si]
    if (key < inl + seg.inlineLen) {
      return seg.isInline ? { struct: s, inner: key - inl, si } : { struct: s + (key - inl), inner: null, si }
    }
    s += seg.structLen
    inl += seg.inlineLen
  }
  return { struct: s, inner: null, si: segs.length }
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
  // carry the conservative mark flag (covers attr-value marks the direct assignment above bypasses);
  // marks carried into the rebuilt children below flag it via the builder / addRootMark
  d.maybeHasMarks = src.maybeHasMarks
  return d
}

/**
 * Stateful transformer that inlines child nodes whose name is in the configured `names` set. Side A
 * is the structured representation (inline nodes present, e.g. `<p>some<>text</></p>`), side B is the
 * inlined representation (inline nodes flattened, e.g. `<p>sometext</p>`).
 *
 * The state the user calls "offsets and inline node length" is the segment layout {@link Seg} stored
 * in `segs`: a coalesced run-length view of the structured side where each inline node is one
 * structured position expanding to `inlineLen` inlined positions, and every other position (root text
 * and opaque non-inlined nodes) is a pass-through run. It is kept current incrementally - every mapped
 * change is folded into `segs` by {@link applySegsChange} rather than re-derived from scratch.
 *
 * @extends {Transformer<any,any>}
 */
export class InlineTransformer extends Transformer {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   * @param {Array<string|null>} names the node names to inline (`null` selects anonymous nodes)
   */
  constructor ($in, $out, names) {
    super($in, $out)
    /**
     * @type {Array<string|null>}
     */
    this.names = names
    /**
     * The segment layout of the structured side, maintained incrementally (see {@link applySegsChange}).
     *
     * @type {Array<Seg>}
     */
    this.segs = []
    /**
     * Whether the structured side has ever contained a direct inline-node child. Monotonic: once a
     * change introduces an inline node it stays set (even if that node is later deleted), which only
     * costs a missed fast-path, never correctness.
     *
     * @type {boolean}
     */
    this.hasInline = false
  }

  /**
   * structured change -> inlined change
   *
   * @param {delta.DeltaBuilderAny} da
   */
  applyA (da) {
    this.hasInline ||= hasInlineChild(da, this.names)
    if (!this.hasInline) {
      // fast-path: nothing to inline now or after this change - structured === inlined, so the
      // change passes through unchanged. Keep the layout current and hand back the same delta.
      applySegsChange(this.segs, da, this.names)
      return createTransformResult(null, da)
    }
    const segs = this.segs
    const b = passThrough(da)
    let si = 0
    let so = 0
    let srcInline = 0
    let emitted = 0
    // position in the resulting inlined doc that `b` has built up to (retain + insert advance it,
    // delete does not). Used to anchor marks lifted out of a spliced inline node (A.3).
    let outPos = 0
    /**
     * @param {number} target
     */
    const alignB = target => {
      if (target > emitted) {
        b.retain(target - emitted)
        outPos += target - emitted
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
        inl += s.isInline ? s.inlineLen : take
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
          // formatted retain: emit the format over the mapped inline range. An inline node's wrapper
          // has no inlined representation, so its format is dropped (consistent with the inliner); root
          // text and opaque nodes carry the format straight through.
          alignB(srcInline)
          let rem = op.retain
          while (rem > 0 && si < segs.length) {
            const s = segs[si]
            const take = math.min(s.structLen - so, rem)
            const inl = s.isInline ? s.inlineLen : take
            b.retain(inl, s.isInline ? null : op.format, s.isInline ? null : op.attribution)
            emitted += inl
            outPos += inl
            srcInline += inl
            so += take
            rem -= take
            if (so >= s.structLen) { si++; so = 0 }
          }
        }
      } else if (delta.$textOp.check(op)) {
        alignB(srcInline)
        b.insert(op.insert, op.format, op.attribution)
        outPos += op.insert.length
      } else if (delta.$insertOp.check(op)) {
        alignB(srcInline)
        for (const el of op.insert) {
          if (isInlineNode(el, this.names)) {
            // splice the inline node's children verbatim (one level), then lift the node's own root
            // marks onto the flattened parent at `childStart + innerKey` (A.3). String-keyed (attr)
            // marks on the inline node have no home in the flattened parent and are dropped.
            const node = /** @type {delta.DeltaAny} */ (el)
            const base = outPos
            b.append(node)
            outPos += node.childCnt
            delta.mergeRootMarks(b, node, k => typeof k === 'number' ? base + k : null)
          } else {
            b.insert([el], op.format, op.attribution)
            outPos += 1
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
        if (s !== undefined && s.isInline) {
          // data side edited inside an inline node: its inner ops act on the node's children, which are
          // spliced into b at the same offset - replay them directly
          const base = outPos
          for (const inner of op.value.children) {
            if (delta.$retainOp.check(inner)) {
              b.retain(inner.retain, inner.format, inner.attribution)
              emitted += inner.retain
              outPos += inner.retain
            } else if (delta.$textOp.check(inner) || delta.$insertOp.check(inner)) {
              b.insert(inner.insert, inner.format, inner.attribution)
              outPos += inner.insert.length
            } else if (delta.$deleteOp.check(inner)) {
              b.delete(inner.delete)
              emitted += inner.delete
            } else if (delta.$modifyOp.check(inner)) {
              b.modify(delta.clone(inner.value), inner.format, inner.attribution)
              emitted += 1
              outPos += 1
            }
          }
          // marks set inside the inline node by this change lift onto the flattened parent (A.3)
          delta.mergeRootMarks(b, op.value, k => typeof k === 'number' ? base + k : null)
          srcInline += s.inlineLen
          advanceStruct(1)
        } else {
          // opaque (named) node: forward the modify verbatim
          b.modify(delta.clone(op.value), op.format, op.attribution)
          emitted += 1
          outPos += 1
          srcInline += advanceStruct(1)
        }
      }
    }
    applySegsChange(this.segs, da, this.names)
    // carry the change's own (root) marks, re-anchoring number offsets through the post-change layout;
    // attr-key marks pass through unchanged. deleteMarks ride verbatim (merged with any lifted above).
    delta.mergeRootMarks(b, da, k => typeof k === 'number' ? structOffsetToInlineOffset(this.segs, k) : k)
    b.done(false)
    return createTransformResult(null, b)
  }

  /**
   * inlined change -> structured change
   *
   * @param {delta.DeltaBuilderAny} db
   */
  applyB (db) {
    this.hasInline ||= hasInlineChild(db, this.names)
    if (!this.hasInline) {
      // fast-path: with no inline nodes the inlined and structured coordinate spaces coincide, so the
      // inlined change is already the structured change.
      applySegsChange(this.segs, db, this.names)
      return createTransformResult(db, null)
    }
    const segs = this.segs
    const a = passThrough(db)
    // --- marks: bucket the change's own (root) marks against the (pre-change) layout. A pass-through
    // offset (or an attr-key mark) becomes a structured root mark; an offset inside an inline node is
    // routed into that node - seeded into its modify when the walk opens one (below), else emitted as a
    // mark-only modify (pure cursor move) or collapsed to the node position (mixed change) after the
    // walk. NB: a change that simultaneously restructures content and moves a cursor maps the cursor in
    // the pre-change layout (best-effort - marks are local/ephemeral).
    /** @type {Array<Mark>} */
    const passMarks = []
    /** @type {Map<number, Array<{ innerKey: number, mark: Mark }>>} */
    const innerBySi = new Map()
    if (db.marks !== null) {
      for (const m of db.marks) {
        if (typeof m.key !== 'number') { passMarks.push(m); continue }
        const r = inlineOffsetToStructLocation(segs, m.key)
        if (r.inner === null) {
          passMarks.push(m.copy(r.struct))
        } else {
          const arr = innerBySi.get(r.si) ?? []
          arr.push({ innerKey: r.inner, mark: m })
          innerBySi.set(r.si, arr)
        }
      }
    }
    // structured start offset of each seg (pre-change), for placing inner marks after the walk
    /** @type {Array<number>} */
    const segStart = []
    for (let i = 0, acc = 0; i < segs.length; i++) { segStart.push(acc); acc += segs[i].structLen }
    let hadChildOps = false
    let si = 0
    let so = 0
    let structBefore = 0
    let emittedStruct = 0
    // An accumulator for edits that fall inside the current inline node. Several inlined ops can
    // target the same inline node, so they must coalesce into a single `modify` op. `openSegIdx` is
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
     * @param {number} target inlined offset within the open inline node
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
      // seed any inner marks bound to this node so they ride on the modify's value (A.3, reverse)
      const im = innerBySi.get(idx)
      if (im !== undefined) {
        for (const { innerKey, mark } of im) delta.addRootMark(openInner, mark.copy(innerKey))
        innerBySi.delete(idx) // consumed - excluded from the post-walk fallback
      }
    }
    // empty inline nodes (inlineLen 0) are zero-width in inlined coords - step over them. Only at a
    // seg boundary (so === 0); `so` does not change while skipping.
    const skipEmpty = () => {
      if (so !== 0) return
      while (si < segs.length && segs[si].isInline && segs[si].inlineLen === 0) {
        structBefore += segs[si].structLen
        si++
      }
    }
    for (const op of db.children) {
      hadChildOps = true
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
            // directly; content inside an inline node is reached through a modify on that node.
            if (!s.isInline) {
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
        } else if (!s.isInline) {
          flushModify()
          alignA(structBefore + so)
          a.insert(op.insert, op.format, op.attribution)
        } else if (so === 0) {
          // boundary preference: an insert at the start of an inline node lands in the root
          flushModify()
          alignA(structBefore)
          a.insert(op.insert, op.format, op.attribution)
        } else {
          // strict interior: insert into the inline node
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
          if (!s.isInline) {
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
            // strict interior delete: remove inside the inline node
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
        if (s !== undefined && s.isInline) {
          // modify targets an element inside the inline node
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
    // place the change's root marks. Pass-through / attr-key marks are structured root marks. Inner
    // marks not consumed by a modify above are emitted as exact mark-only modifies for a pure cursor
    // move, else collapsed to the inline node's structured position (best-effort).
    for (const m of passMarks) delta.addRootMark(a, m)
    if (innerBySi.size > 0) {
      if (!hadChildOps) {
        let cursor = emittedStruct
        for (const [segIdx, marks] of [...innerBySi.entries()].sort((x, y) => x[0] - y[0])) {
          if (segStart[segIdx] > cursor) { a.retain(segStart[segIdx] - cursor); cursor = segStart[segIdx] }
          const mod = /** @type {any} */ (delta.create())
          for (const { innerKey, mark } of marks) delta.addRootMark(mod, mark.copy(innerKey))
          a.modify(mod.done(false))
          cursor += 1
        }
      } else {
        for (const [segIdx, marks] of innerBySi) {
          for (const { mark } of marks) delta.addRootMark(a, mark.copy(segStart[segIdx]))
        }
      }
    }
    if (db.deleteMarks !== null) {
      for (const id of db.deleteMarks) delta.deleteRootMark(a, id)
    }
    applySegsChange(this.segs, a, this.names)
    a.done(false)
    return createTransformResult(a, null)
  }
}

/**
 * Template for {@link InlineTransformer}. Typed loosely: the inlined output shape depends on the
 * runtime `names` and document content, so the OUT side is `any`.
 *
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, any>}
 */
export class Inline extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
   * @param {Array<string|null>} names the node names to inline (`null` selects anonymous nodes)
   */
  constructor ($d, names) {
    super($d, /** @type {any} */ (delta.$deltaAny))
    this.names = names
  }

  get fpName () { return 'lib0:inline:' + this.names.join(',') }

  /**
   * @return {Transformer<IN, any>}
   */
  init () {
    return new InlineTransformer(this.$in, this.$out, this.names)
  }
}

/**
 * Inline child nodes whose name is in `names` by splicing each one's children into its parent (one
 * level; e.g. with `[null]`: `<p>some<>text</></p>` <-> `<p>sometext</p>`). Use `null` for
 * anonymous/typeless nodes, or a node name like `'b'`. Returns a reusable {@link Inline} template
 * (a `project` hole, or `.init()` for a standalone transformer).
 *
 * @template {delta.DeltaConf} IN
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @param {Array<string|null>} names
 * @return {Inline<IN>}
 */
export const inline = ($d, names) => new Inline($d, names)

/**
 * Convenience {@link Inline} factory that inlines anonymous ("null") child nodes
 * (`<p>some<>text</></p>` <-> `<p>sometext</p>`) - i.e. `inline($d, [null])`.
 *
 * @template {delta.DeltaConf} IN
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @return {Inline<IN>}
 */
/* @__NO_SIDE_EFFECTS__ */
export const inlineNullNodes = ($d) => inline($d, [null])
