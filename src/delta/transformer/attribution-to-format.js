import * as delta from '../delta.js'
import * as s from '../../schema.js'
import * as object from '../../object.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * # `attributionToFormat`
 *
 * Render a delta's **`attribution`** dimension (provenance — who inserted/deleted/formatted) into a
 * reserved `y-attributed-*` slice of the **`format`** dimension, so a rich-text editor can display
 * provenance as decorations. The reverse direction strips the decorations back out.
 *
 * Forward (`applyA`, data → view), per content op:
 * - `attribution` whose keys start with `insert`/`delete`/`format` ⇒ `format['y-attributed-insert' |
 *   'y-attributed-delete' | 'y-attributed-format']`, computed by the matching `conf` handler.
 *
 * A node's attribute ops carry attribution but have **no format slot**, and a node has no format of
 * its own — its format lives on the *parent* op that holds it. So a node-attr's attribution is lifted
 * to that parent (`insert`/`modify`) op as `format['y-attributed-attrs'] = { <attrKey>: <value> }`,
 * observed at the boundary before recursing into the child ("the parent formats the child").
 *
 * Reverse (`applyB`, view → data) is a pure strip: every `y-attributed-*` format key is removed and
 * everything else passes through. *The view never attributes.*
 *
 * The transform is **structure-preserving** (1:1 positions) and **stateless** — it walks each change
 * op-by-op and recurses through the whole nested delta in one pass (no per-child transformer
 * instances). See {@link attributionToFormat}.
 *
 * @module delta/transformer/attribution-to-format
 */

// Reserved, fixed format-key namespace. Every key produced here starts with `Y_PREFIX`, which is also
// how `applyB` recognises (and strips) them.
const Y_PREFIX = 'y-attributed-'
const Y_ATTRS = 'y-attributed-attrs'

/** Content-attribution dimension → its namespaced format key. */
const CONTENT_KEYS = { insert: 'y-attributed-insert', delete: 'y-attributed-delete', format: 'y-attributed-format' }
const CONTENT_DIMS = /** @type {Array<'insert'|'delete'|'format'>} */ (object.keys(CONTENT_KEYS))

/**
 * Maps an attribution object to the format value placed under its namespaced key (or `null` to clear
 * that key, `{}`/`undefined` to leave it unchanged).
 *
 * @typedef {(attribution: import('../delta.js').Attribution) => any} Handler
 */

/**
 * Per-dimension handlers. Each fires when the op's attribution has a key with that dimension's prefix
 * (`insert`/`insertAt` → `insert`, etc.); the whole attribution object is passed in. A missing handler
 * means "do not render that dimension".
 *
 * @typedef {{ insert?: Handler, delete?: Handler, format?: Handler, attrs?: Handler }} Conf
 */

/**
 * A handler result that means "no change" (skip): `undefined` or an empty plain object `{}`. A bare
 * scalar (string/number) or a non-empty object is a real value; `null` is handled separately (clear).
 *
 * @param {any} r
 * @return {boolean}
 */
const isSkip = (r) => r === undefined || (s.$objectAny.check(r) && object.isEmpty(r))

/**
 * Build the `y-attributed-*` content-format increment from a content op's `attribution`. `isData`
 * distinguishes a settled data op (`insert`/`text`: `attribution` is an object or `null`=none) from an
 * instruction op (`retain`/`modify`: `undefined`=skip, `null`=clear-all).
 *
 * @param {Conf} conf
 * @param {import('../delta.js').Attribution|null|undefined} attribution
 * @param {boolean} isData
 * @return {{[k:string]:any}|undefined}
 */
const contentFmt = (conf, attribution, isData) => {
  if (attribution === undefined) return undefined
  /** @type {{[k:string]:any}} */
  const f = {}
  if (attribution === null) {
    if (isData) return undefined // data "none" — nothing to render
    for (const dim of CONTENT_DIMS) if (conf[dim] != null) f[CONTENT_KEYS[dim]] = null // instruction clear-all
    return object.isEmpty(f) ? undefined : f
  }
  const ks = object.keys(attribution)
  for (const dim of CONTENT_DIMS) {
    const handler = conf[dim]
    if (handler != null && ks.some(k => k.startsWith(dim))) {
      const r = handler(attribution)
      // `null` ⇒ clear the key, but only as an *instruction* — a data op stores resolved formats with
      // no `{k:null}` leaves, so on a data op a `null` result is "nothing to render" (skip).
      if (r === null) { if (!isData) f[CONTENT_KEYS[dim]] = null } else if (!isSkip(r)) f[CONTENT_KEYS[dim]] = r
    }
  }
  return object.isEmpty(f) ? undefined : f
}

/**
 * Build the `y-attributed-attrs` format value from a child node's attribute-op attributions — the
 * lift that lets the *parent* op carry a node's attr provenance (attr ops have no format slot). For a
 * `modifyAttr` op a `null` attribution is an instruction *clear* (⇒ `{ <key>: null }`); for a settled
 * `setAttr`/`deleteAttr` op `null` is "none" (skipped).
 *
 * @param {Conf} conf
 * @param {import('../delta.js').DeltaAny} node
 * @return {{[k:string]:any}|undefined}
 */
const attrsFmt = (conf, node) => {
  const handler = conf.attrs
  if (handler == null) return undefined
  /** @type {{[k:string]:any}} */
  const map = {}
  for (const op of node.attrs) {
    const isInstr = delta.$modifyAttrOp.check(op) // modifyAttr carries an attribution *instruction*; setAttr/deleteAttr resolved data
    const a = op.attribution
    if (a === undefined) continue // instruction skip
    if (a === null) {
      if (isInstr) map[op.key] = null // instruction clear (data "none" ⇒ skip)
      continue
    }
    const r = handler(a)
    if (r === null) { if (isInstr) map[op.key] = null } else if (!isSkip(r)) map[op.key] = r
  }
  return object.isEmpty(map) ? undefined : { [Y_ATTRS]: map }
}

/**
 * Merge `y-attributed-*` increments onto a content op's existing `format`, preserving real formats
 * (`bold`, …) and the op's tri-state. With no increment, `base` is returned verbatim (so a `null`
 * clear-all or a `{k:null}` removal survives). With increments, a `null`/`undefined` base contributes
 * nothing and only the namespaced keys are emitted.
 *
 * @param {{[k:string]:any}|null|undefined} base op.format (skip `undefined` / clear-all `null` / object)
 * @param {...({[k:string]:any}|undefined)} adds namespaced format increments
 * @return {{[k:string]:any}|null|undefined}
 */
const combineFmt = (base, ...adds) => {
  const extra = object.assign({}, ...adds)
  if (object.isEmpty(extra)) return base
  return base == null ? extra : object.assign({}, base, extra)
}

/**
 * Remove every reserved `y-attributed-*` key from a `format`. Returns the input unchanged when it has
 * none (preserving `undefined`/`null`/object verbatim), or `undefined` when stripping empties it.
 *
 * @param {{[k:string]:any}|null|undefined} format
 * @return {{[k:string]:any}|null|undefined}
 */
const stripY = (format) => {
  if (format == null) return format
  /** @type {{[k:string]:any}} */
  const r = {}
  let stripped = false
  for (const k in format) {
    if (k.startsWith(Y_PREFIX)) stripped = true
    else r[k] = format[k]
  }
  return stripped ? (object.isEmpty(r) ? undefined : r) : format
}

/**
 * Re-emit a node's own attribute ops without attribution. The view never attributes — a node's
 * attr-attribution is rendered on the *parent* op (see {@link attrsFmt}) — so it must not also ride on
 * the attr op. Rebuilt via the builder rather than mutating cloned ops.
 *
 * @param {import('../delta.js').DeltaBuilderAny} out
 */
const stripAttrAttributions = (out) => {
  /** @type {Array<any>} */
  const ops = []
  for (const op of out.attrs) ops.push(op)
  for (const op of ops) {
    if (delta.$modifyAttrOp.check(op)) {
      if (op.attribution !== undefined) out.modifyAttr(op.key, op.value)
    } else if (delta.$setAttrOp.check(op)) {
      if (op.attribution != null) out.setAttr(op.key, op.value, undefined, op.prevValue)
    } else if (op.attribution != null) { // DeleteAttrOp
      out.deleteAttr(op.key, undefined, op.prevValue)
    }
  }
}

/**
 * The whole transform, both directions, in one stateless recursive pass over the nested delta.
 *
 * @param {Conf} conf
 * @param {import('../delta.js').DeltaAny} d
 * @param {boolean} fwd `true` maps A→B (attribution→format), `false` maps B→A (strip).
 * @return {import('./core.js').TransformResultAny}
 */
const transform = (conf, d, fwd) => {
  const out = /** @type {any} */ (delta.cloneShallow(d))
  if (fwd) {
    stripAttrAttributions(out)
    for (const op of d.children) {
      if (delta.$textOp.check(op)) {
        out.insert(op.insert, combineFmt(op.format, contentFmt(conf, op.attribution, true)))
      } else if (delta.$retainOp.check(op)) {
        out.retain(op.retain, combineFmt(op.format, contentFmt(conf, op.attribution, false)))
      } else if (delta.$insertOp.check(op)) {
        // one element at a time: the builder re-coalesces equal formats and splits differing ones, so
        // children needing distinct `y-attributed-attrs` land in their own insert ops automatically
        for (const el of op.insert) {
          if (delta.$deltaAny.check(el)) {
            out.insert([transform(conf, el, true).b], combineFmt(op.format, contentFmt(conf, op.attribution, true), attrsFmt(conf, el)))
          } else {
            out.insert([el], combineFmt(op.format, contentFmt(conf, op.attribution, true)))
          }
        }
      } else if (delta.$deleteOp.check(op)) {
        out.delete(op.delete)
      } else { // $modifyOp
        out.modify(transform(conf, op.value, true).b, combineFmt(op.format, contentFmt(conf, op.attribution, false), attrsFmt(conf, op.value)))
      }
    }
  } else {
    for (const op of d.children) {
      if (delta.$textOp.check(op)) {
        out.insert(op.insert, stripY(op.format))
      } else if (delta.$retainOp.check(op)) {
        out.retain(op.retain, stripY(op.format))
      } else if (delta.$insertOp.check(op)) {
        for (const el of op.insert) {
          out.insert([delta.$deltaAny.check(el) ? transform(conf, el, false).a : el], stripY(op.format))
        }
      } else if (delta.$deleteOp.check(op)) {
        out.delete(op.delete)
      } else { // $modifyOp
        out.modify(transform(conf, op.value, false).a, stripY(op.format))
      }
    }
  }
  out.done(false)
  return fwd ? createTransformResult(null, out) : createTransformResult(out, null)
}

/**
 * Stateless transformer (holds only its `conf`); a single shared instance per template suffices.
 *
 * @extends {Transformer<any,any>}
 */
export class AttributionToFormatTransformer extends Transformer {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   * @param {Conf} conf
   */
  constructor ($in, $out, conf) {
    super($in, $out)
    this.conf = conf
  }

  /**
   * @param {delta.DeltaBuilderAny} d
   * @return {import('./core.js').TransformResultAny}
   */
  applyA (d) {
    return transform(this.conf, d, true)
  }

  /**
   * @param {delta.DeltaBuilderAny} d
   * @return {import('./core.js').TransformResultAny}
   */
  applyB (d) {
    return transform(this.conf, d, false)
  }
}

/**
 * Compute the output schema: widen the input `$formats` to admit the four `y-attributed-*` keys (only
 * text-op formats are schema-checked, delta.js `$Delta#check`). Falls back to `$deltaAny` when `$in`
 * is loose. A local rebuild (not `withAttrs`/`withName`, which hardcode `recursiveChildren:false`) so
 * recursive node trees survive.
 *
 * @param {import('../../schema.js').Schema<delta.DeltaAny>} $in
 * @return {import('../../schema.js').Schema<delta.DeltaAny>}
 */
const computeOut = ($in) => {
  if (!delta.$$delta.check($in)) return delta.$deltaAny
  const $formats = $in.shape.$formats
  const $wide = s.$$object.check($formats)
    ? s.$object(object.assign({}, $formats.shape, { 'y-attributed-insert': s.$any.optional, 'y-attributed-delete': s.$any.optional, 'y-attributed-format': s.$any.optional, [Y_ATTRS]: s.$any.optional }))
    : $formats // `s.$any` (the default) already admits the namespaced keys
  return new delta.$Delta($in.shape.$name, $in.shape.$attrs, $in.shape.$children, $in.shape.hasText, $in.shape.recursiveChildren, $wide)
}

/**
 * Template for {@link AttributionToFormatTransformer}.
 *
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, any>}
 */
export class AttributionToFormat extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
   * @param {Conf} conf
   */
  constructor ($d, conf) {
    super($d, /** @type {any} */ (computeOut($d)))
    /**
     * @type {Conf}
     */
    this.conf = conf
  }

  get name () { return 'lib0:attributionToFormat' }

  /**
   * @return {Transformer<IN, any>}
   */
  init () {
    return new AttributionToFormatTransformer(this.$in, this.$out, this.conf)
  }
}

/**
 * Render a delta's `attribution` dimension into a reserved `y-attributed-*` format namespace (forward)
 * and strip it back out (reverse) — see the {@link module:delta/transformer/attribution-to-format
 * module doc}. `conf` supplies per-dimension handlers (`insert`/`delete`/`format` for content ops,
 * `attrs` for node-attribute provenance); each maps the op's attribution to the value placed under the
 * namespaced format key (`null` clears it, `{}`/`undefined` leaves it unchanged).
 *
 * The transformer assumes every attribution-bearing op carries the **complete** attribution: the
 * format dimension merges flat/wholesale, so it cannot replicate `attribution.format`'s deep merge,
 * and an incremental update would overwrite a whole `y-attributed-attrs` map or `y-attributed-format`
 * object. Returns a reusable {@link AttributionToFormat} template (`.init()` for a standalone
 * transformer).
 *
 * @template {delta.DeltaConf} IN
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @param {Conf} conf
 * @return {AttributionToFormat<IN>}
 */
export const attributionToFormat = ($d, conf) => new AttributionToFormat($d, conf)
