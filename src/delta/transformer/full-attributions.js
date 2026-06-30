import * as delta from '../delta.js'
import * as s from '../../schema.js'
import * as object from '../../object.js'
import * as math from '../../math.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * # `fullAttributions`
 *
 * A **stateful** transformer that normalizes the `attribution` dimension: whenever an op changes
 * attribution, it re-emits the **complete accumulated** attribution for that position instead of just
 * the incremental change. So a stream like `insert('a', undefined, { insert: [] })` then
 * `retain(1, undefined, { insertAt: 4 })` is forwarded as `insert('a', …, { insert: [] })` then
 * `retain(1, undefined, { insert: [], insertAt: 4 })`. Content, formats, structure and marks pass
 * through untouched. It is the natural upstream of {@link import('./attribution-to-format.js').attributionToFormat},
 * lifting that transformer's "assume the full attribution is present" requirement.
 *
 * State is a private **content-free attribution overlay** (`this.overlay`): a delta mirroring the
 * document shape but carrying no content — text/scalar runs are `retain(len, _, attr)`, child nodes are
 * `modify(childOverlay, _, nodeAttr)`, node attributes are per-key attr ops — each holding that
 * position's accumulated attribution as an *instruction* (`{k:v}` set, `{k:null}` cleared).
 *
 * Per `applyA(d)`: a single read-only walk over `d` (in step with the overlay) builds one content-free
 * delta `full` carrying the resolved full attribution at exactly `d`'s touched positions. `full` is then
 * used twice — `d.apply(full)` enriches the input *in place* (that is the output: no content is copied,
 * `apply` only splits content-free retains), and `overlay.rebase(d)` + `overlay.apply(full)` update the
 * state, both in place and bounded by the change. `applyB` is passthrough + overlay realign (the view
 * never attributes).
 *
 * Object ownership: `applyA` mutates the input delta's **structure** in place (legitimate — the framework
 * hands a transformer a non-done change builder to consume, cf. `children.js`) and returns it as the
 * output. It never mutates a `format`/`attribution` **object** in place. We do **not** own those objects —
 * they may belong to done (shared) data — so they are read-only here, and every attribution we emit is a
 * freshly allocated object (`mergeLeaves`/`applyFull`, mirroring delta.js's `mergeAttr`). The overlay and
 * the output only ever receive fresh top-level objects (`apply`/`rebase` merge via `mergeAttr`; `clone`
 * shallow-copies via `_cloneAttrs`), so no shared object is updated through a reference. Nested `format`
 * maps and leaf values are shared by reference exactly as delta.js shares them — safe because nothing is
 * written in place.
 *
 * Per-change cost is O(change); the overlay is O(document attribution structure). See {@link fullAttributions}.
 *
 * @module delta/transformer/full-attributions
 */

/**
 * Instruction-form shallow merge of `update` into `base`: set every present key, **keep** a `{k:null}`
 * removal verbatim (so it still clears downstream), skip `undefined`. Used for attribution leaves and for
 * the nested `format` map. Mirrors `mergeShallow` with `resolve = false` (delta.js). Allocates a fresh
 * object; never mutates `base`/`update` (they may be done, shared data — read-only).
 *
 * @param {{[k:string]:any}|null|undefined} base
 * @param {{[k:string]:any}} update
 * @return {{[k:string]:any}}
 */
const mergeLeaves = (base, update) => {
  const r = s.$objectAny.check(base) ? { ...base } : {}
  for (const k in update) if (update[k] !== undefined) r[k] = update[k] // set, or keep `null` (instruction)
  return r
}

/**
 * The full attribution at a position after applying a tri-state attribution `update` onto the
 * accumulated `base`, in instruction form. `undefined` ⇒ unchanged, `null` ⇒ clear all; otherwise a
 * shallow tri-state merge whose single nested `format` key merges one level. Mirrors `mergeAttr` with
 * `resolve = false` (delta.js) — kept in instruction form so a cleared key survives as `{k:null}` and is
 * re-emitted (the "set present + clear removed" contract). Allocates a fresh object for the merge case;
 * never mutates `base`/`update` (they may be done, shared data — read-only).
 *
 * @param {{[k:string]:any}|null|undefined} base
 * @param {{[k:string]:any}|null|undefined} update
 * @return {{[k:string]:any}|null|undefined}
 */
const applyFull = (base, update) => {
  if (update === undefined) return base
  if (update === null) return null
  const r = s.$objectAny.check(base) ? { ...base } : {}
  for (const k in update) {
    const v = update[k]
    if (v === undefined) continue
    if (k === 'format' && s.$objectAny.check(v)) {
      const sub = mergeLeaves(r.format, v)
      if (object.isEmpty(sub)) delete r.format
      else r.format = sub
    } else r[k] = v // leaf set, or `null` kept verbatim (instruction)
  }
  return r
}

/**
 * Normalize a *data* op's attribution (insert/text/setAttr/deleteAttr) for storage in `full`: `null`
 * means "none" (⇒ `undefined`, i.e. a gap), an object is already the complete attribution of new content.
 *
 * @param {{[k:string]:any}|null|undefined} a
 * @return {{[k:string]:any}|undefined}
 */
const dataAttr = a => (a == null ? undefined : a)

/**
 * Build the content-free `full` delta for change `d` against the read-only `overlay` (the accumulated
 * attribution, or `null` for freshly inserted content). Carries the resolved full attribution at exactly
 * `d`'s touched positions; recurses into child nodes.
 *
 * @param {import('../delta.js').DeltaAny} d
 * @param {import('../delta.js').DeltaAny|null} overlay
 * @return {import('../delta.js').DeltaBuilderAny}
 */
const buildFull = (d, overlay) => {
  const full = /** @type {any} */ (delta.create())
  let cur = overlay == null ? null : overlay.children.start
  let off = 0
  /**
   * Advance the read cursor by `n` positions without reading (untouched retains, deletes).
   * @param {number} n
   */
  const skip = n => {
    let rem = n
    while (rem > 0 && cur != null) {
      const take = math.min(cur.length - off, rem)
      off += take; rem -= take
      if (off >= cur.length) { cur = cur.next; off = 0 }
    }
  }
  /**
   * Read the attribution run at the cursor (≤ `rem` positions), advancing. Beyond the overlay ⇒ no prior
   * attribution.
   * @param {number} rem
   * @return {[number, {[k:string]:any}|null|undefined]}
   */
  const readRun = rem => {
    if (cur == null) return [rem, undefined]
    const take = math.min(cur.length - off, rem)
    const attr = /** @type {any} */ (cur).attribution
    off += take
    if (off >= cur.length) { cur = cur.next; off = 0 }
    return [take, attr]
  }
  /**
   * The nested overlay + node-attribution at the cursor (a Modify run; else `null`/leaf attr), advancing
   * one position.
   * @return {{ nested: import('../delta.js').DeltaAny|null, attr: {[k:string]:any}|null|undefined }}
   */
  const readModify = () => {
    const node = cur
    const attr = node == null ? undefined : /** @type {any} */ (node).attribution
    const nested = (node != null && delta.$modifyOp.check(node)) ? node.value : null
    if (cur != null) { off += 1; if (off >= cur.length) { cur = cur.next; off = 0 } }
    return { nested, attr }
  }
  for (const op of d.children) {
    if (delta.$retainOp.check(op)) {
      if (op.attribution === undefined) {
        full.retain(op.retain); skip(op.retain) // untouched ⇒ gap
      } else {
        let rem = op.retain
        while (rem > 0) {
          const [take, runAttr] = readRun(rem)
          full.retain(take, undefined, applyFull(runAttr, op.attribution))
          rem -= take
        }
      }
    } else if (delta.$textOp.check(op)) {
      full.retain(op.insert.length, undefined, dataAttr(op.attribution)) // new content: attribution already full
    } else if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (delta.$deltaAny.check(el)) full.modify(buildFull(el, null), undefined, dataAttr(op.attribution))
        else full.retain(1, undefined, dataAttr(op.attribution))
      }
    } else if (delta.$deleteOp.check(op)) {
      skip(op.delete) // positions removed: nothing in `full`
    } else { // $modifyOp
      const { nested, attr } = readModify()
      full.modify(buildFull(op.value, nested), undefined, applyFull(attr, op.attribution))
    }
  }
  for (const aop of d.attrs) {
    // `setAttr`/`deleteAttr` *replace* the attr op, so their attribution is already complete (pass it
    // through unchanged). Only `modifyAttr` is an instruction that *merges* attribution — that is the one
    // whose increment we expand against the overlay's accumulated attr attribution.
    if (delta.$modifyAttrOp.check(aop)) {
      const oa = overlay == null ? undefined : /** @type {any} */ (overlay).attrs[aop.key]
      const childOverlay = (oa != null && delta.$modifyAttrOp.check(oa) && delta.$deltaAny.check(oa.value)) ? oa.value : null
      full.modifyAttr(aop.key, delta.$deltaAny.check(aop.value) ? buildFull(aop.value, childOverlay) : aop.value, applyFull(oa == null ? undefined : oa.attribution, aop.attribution))
    } else if (delta.$setAttrOp.check(aop)) {
      full.setAttr(aop.key, aop.value, aop.attribution, aop.prevValue)
    } else if (delta.$deleteAttrOp.check(aop)) {
      full.deleteAttr(aop.key, aop.attribution, aop.prevValue)
    }
  }
  full.done(false)
  return full
}

/**
 * Stateful transformer holding the accumulated attribution overlay.
 *
 * @extends {Transformer<any,any>}
 */
export class FullAttributionsTransformer extends Transformer {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   */
  constructor ($in, $out) {
    super($in, $out)
    /**
     * Content-free overlay: the full accumulated attribution at every document position (instruction
     * form). Mutated in place each change by `rebase` + `apply`.
     *
     * @type {delta.DeltaBuilderAny}
     */
    this.overlay = delta.create()
  }

  /**
   * Forward: expand each attribution-bearing op to the complete accumulated attribution. Mutates and
   * returns the input change.
   *
   * @param {delta.DeltaBuilderAny} d
   * @return {import('./core.js').TransformResultAny}
   */
  applyA (d) {
    const full = buildFull(d, this.overlay)
    // STATE (in place): align/grow the overlay to post-change coords, then accumulate the increments.
    this.overlay.rebase(d, true)
    this.overlay.apply(full, { move: false })
    // OUTPUT (in place): enrich the input — `apply` splits content-free retains; no content is copied.
    d.apply(full, { move: true })
    return createTransformResult(null, d)
  }

  /**
   * Reverse: passthrough; only realign the overlay so positions track view inserts/deletes. The view
   * never attributes, so there is nothing to expand.
   *
   * @param {delta.DeltaBuilderAny} d
   * @return {import('./core.js').TransformResultAny}
   */
  applyB (d) {
    this.overlay.rebase(d, true)
    return createTransformResult(d, null)
  }
}

/**
 * Template for {@link FullAttributionsTransformer}. The transform touches only the `attribution`
 * dimension (metadata, not part of the delta schema), so the output schema equals the input schema.
 *
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, IN>}
 */
export class FullAttributions extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
   */
  constructor ($d) {
    super($d, $d)
  }

  get name () { return 'lib0:fullAttributions' }

  /**
   * @return {Transformer<IN, IN>}
   */
  init () {
    return new FullAttributionsTransformer(this.$in, this.$out)
  }
}

/**
 * Normalize a delta's `attribution` dimension so every attribution change carries the **complete**
 * accumulated attribution for that position (not just the increment) — see the
 * {@link module:delta/transformer/full-attributions module doc}. Stateful: it keeps a content-free
 * overlay of the accumulated attribution and updates it in place per change. `applyA` mutates and returns
 * its input change. Returns a reusable {@link FullAttributions} template (`.init()` for a standalone
 * transformer); typically piped before
 * {@link import('./attribution-to-format.js').attributionToFormat}.
 *
 * @template {delta.DeltaConf} IN
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @return {FullAttributions<IN>}
 */
export const fullAttributions = ($d) => new FullAttributions($d)
