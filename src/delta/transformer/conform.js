import * as delta from '../delta.js'
import * as s from '../../schema.js'
import * as math from '../../math.js'
import * as error from '../../error.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * The literal node-names a `$Delta`'s `$name` schema accepts, or `null` when the name is loose
 * (`$any`/`$string`) — such a schema acts as a wildcard that matches any node name.
 *
 * @param {import('../../schema.js').Schema<any>} $name
 * @return {Array<string>?}
 */
const literalNames = $name => s.$$literal.check($name) ? /** @type {Array<string>} */ ($name.shape) : null

/**
 * The expanded matcher for a children / attr-value schema.
 *
 * @typedef {{ byName: Map<string, delta.$Delta<any>>, wild: delta.$Delta<any>?, passAny: boolean, $scalar: import('../../schema.js').Schema<any> }} Allowed
 */

/**
 * Expand a children / attr-value schema into the matcher conform uses. `byName`/`wild` give the `$Delta`
 * a node conforms to, **matched by NAME** (so a node carrying not-yet-stripped attrs still matches — a
 * full `.check` would be the wrong test, it would reject content conform is meant to strip). `passAny` is
 * set when the schema accepts ANY content (a `$deltaAny` / `$any` member), so such content passes through
 * verbatim with no nested transformer. `$scalar` checks a non-delta (JSON) value.
 *
 * @param {import('../../schema.js').Schema<any>} $s
 * @return {Allowed}
 */
const allowedOf = $s => {
  /** @type {Map<string, delta.$Delta<any>>} */
  const byName = new Map()
  /** @type {delta.$Delta<any>?} */
  let wild = null
  let passAny = false
  for (const m of (s.$$union.check($s) ? $s.shape : [$s])) {
    if (m === delta.$deltaAny || s.$$any.check(m)) {
      passAny = true
    } else if (delta.$$delta.check(m)) {
      const $m = /** @type {delta.$Delta<any>} */ (m)
      const names = literalNames($m.shape.$name)
      if (names === null) wild ??= $m
      else for (const n of names) byName.set(n, $m)
    }
  }
  return { byName, wild, passAny, $scalar: $s }
}

/** @type {Allowed} an empty matcher (allows nothing) — the placeholder for a pass-through config */
const NONE = { byName: new Map(), wild: null, passAny: false, $scalar: s.$never }
/** @type {Map<string|number, Allowed>} a shared empty attr matcher map (never mutated) */
const NO_ATTRS = new Map()

/**
 * The read-only, schema-derived configuration of a conform transformer. Computed once per schema (see
 * {@link configOf}) and shared by every transformer instance built from that schema — many instances are
 * created for the children of one schema, so this avoids re-expanding the schema each time.
 *
 * @typedef {{ passthrough: boolean, hasText: boolean, childAllowed: Allowed, attrsLoose: boolean, attrAllowed: Map<string|number, Allowed> }} Config
 */

/** @type {WeakMap<import('../../schema.js').Schema<any>, Config>} */
const configCache = new WeakMap()

/**
 * The cached {@link Config} for `$schema`, computing (and memoizing) it on first use. `$deltaAny` yields
 * a pass-through config (the conform is the identity).
 *
 * @param {import('../../schema.js').Schema<any>} $schema
 * @return {Config}
 */
const configOf = $schema => {
  let c = configCache.get($schema)
  if (c === undefined) {
    if ($schema === delta.$deltaAny) {
      c = { passthrough: true, hasText: false, childAllowed: NONE, attrsLoose: false, attrAllowed: NO_ATTRS }
    } else {
      const shape = /** @type {any} */ ($schema).shape
      const attrsLoose = !s.$$object.check(shape.$attrs)
      /** @type {Map<string|number, Allowed>} */
      const attrAllowed = new Map()
      if (!attrsLoose) {
        const attrShape = /** @type {any} */ (shape.$attrs).shape
        for (const key in attrShape) attrAllowed.set(key, allowedOf(attrShape[key]))
      }
      c = { passthrough: false, hasText: shape.hasText, childAllowed: allowedOf(shape.$children), attrsLoose, attrAllowed }
    }
    configCache.set($schema, c)
  }
  return c
}

/**
 * A fresh nested conform bound to a sub-schema (a kept child or delta-valued attribute), reusing the
 * memoized {@link Config} for that schema.
 *
 * @param {delta.$Delta<any>} $schema
 * @return {ConformTransformer}
 */
const nest = $schema => new ConformTransformer(delta.$deltaAny, $schema, configOf($schema))

/**
 * Decide what conform does with one piece of new content (a child node or an attribute value):
 * - `null`  — drop it (it matches nothing the schema allows),
 * - `true`  — pass it through verbatim (a JSON scalar, which can't be modified anyway, or a node matched
 *   by a `$deltaAny`/`$any` schema, whose every future edit is valid),
 * - a `ConformTransformer` — keep it but recursively conform it (a delta node matched to a *narrower*
 *   `$Delta`, whose future edits must still be stripped).
 *
 * @param {any} node
 * @param {Allowed} allowed
 * @return {ConformTransformer | true | null}
 */
const needsTransform = (node, allowed) => {
  if (delta.$deltaAny.check(node)) {
    const $m = (node.name != null ? allowed.byName.get(node.name) : undefined) ?? allowed.wild
    return $m != null ? nest($m) : (allowed.passAny ? true : null)
  }
  return allowed.$scalar.check(node) ? true : null
}

/**
 * Whether `allowed` admits at least one delta value at this position — a `$deltaAny`/`$any` member, a
 * wildcard `$Delta`, or any name-matched `$Delta`. A `modify` / `modifyAttr` op edits a delta child or
 * delta-valued attribute, so it can only conform where this holds; against a scalar/text-only matcher it
 * is necessarily invalid. Used by {@link ConformTransformer#applyB} to reject such modifies.
 *
 * @param {Allowed} allowed
 * @return {boolean}
 */
const admitsDelta = allowed => allowed.passAny || allowed.wild != null || allowed.byName.size > 0

/**
 * Makes the projected (side-B) delta conform to `$schema`, **recursively**: drops attributes, attribute
 * values, child nodes, and text the schema does not recognize, and descends into kept delta-valued
 * attributes and kept child nodes with a nested `conform` (a fresh instance per kept child/attr, kept in
 * step with the content — modelled on `children` + `inline`). A child is kept iff its node-name matches
 * one of the schema's child `$Delta`s; a non-delta child iff it validates against `$children`; text iff
 * the schema allows text. Everything else is dropped, so the output is guaranteed to satisfy `$schema`.
 *
 * Content that needs no per-position handling (text, scalars, and nodes matched by a `$deltaAny`/`$any`
 * schema) is coalesced into pass-through runs, so a `$deltaAny` schema is a true zero-overhead identity
 * and an incremental edit costs O(change), not O(document).
 *
 * `applyA` (A → B) does the full recursive filtering. `applyB` (B → A) is a lightweight reverse: it
 * validates each B-side op against `$schema` — throwing on any op that would break conformance — and
 * otherwise passes the change through to A verbatim (a conformant B-edit is already valid on A). Full
 * drop-aware B→A position remapping is deferred (see {@link ConformTransformer#applyB}).
 * Marks are best-effort — marks on kept children/attrs ride through the position map; marks anchored to
 * dropped content are dropped.
 *
 * @template {delta.DeltaConf} SchemaConf
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, SchemaConf>}
 */
export class Conform extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d input delta schema
   * @param {import('../../schema.js').Schema<delta.Delta<SchemaConf>>} $schema the schema the output must match
   */
  constructor ($d, $schema) {
    if (/** @type {any} */ ($schema) !== delta.$deltaAny) s.assert($schema, delta.$$delta)
    super($d, /** @type {any} */ ($schema))
    this.$schema = $schema
    // expand the schema ONCE here (memoized); every transformer this template builds reuses it
    this.config = configOf($schema)
  }

  get name () { return 'lib0:conform' }

  /**
   * @return {Transformer<IN, SchemaConf>}
   */
  init () {
    return /** @type {any} */ (new ConformTransformer(this.$in, this.$out, this.config))
  }
}

/**
 * Stateful, recursive transformer produced by {@link Conform}. See {@link Conform} for semantics.
 *
 * The A→B layout lives in {@link ConformTransformer#cmap} (the *child* map), a delta reused as a
 * coalesced positional map (like `children`'s `childTs`): a `retain(n)` run = pass-through positions, an
 * `insert([t])` = a child routed through nested conform `t`, a `delete(n)` run = dropped positions
 * (width 0 on B). It is rebuilt only on a structural change, carrying the nested transformers by
 * reference so their state survives; a change with only retains/modifies is routed in place.
 *
 * @extends {Transformer<any,any>}
 */
export class ConformTransformer extends Transformer {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   * @param {Config} config the schema-derived read-only config (computed once, see {@link configOf})
   */
  constructor ($in, $out, config) {
    super($in, $out)
    this.config = config
    /** @type {delta.DeltaBuilderAny} the coalesced child layout map */
    this.cmap = delta.create()
    /** @type {Map<string|number, ConformTransformer>} nested conforms for delta-valued attributes */
    this.transformAttrs = new Map()
  }

  /**
   * Map an A-side change to a conformant B-side change. Unrecognized attributes/values/children/text are
   * dropped; recognized delta children and delta-valued attributes are recursively conformed.
   *
   * @param {delta.DeltaBuilderAny} dA
   * @return {import('./core.js').TransformResultAny}
   */
  applyA (dA) {
    const cfg = this.config
    if (cfg.passthrough) return createTransformResult(null, dA) // identity fast-path, no walk, no copy
    const out = /** @type {any} */ (delta.create(/** @type {any} */ (dA.name)))
    /** @type {Set<string|number>} */
    const keptAttrKeys = new Set()
    // --- attributes ---
    for (const op of dA.attrs) {
      const key = op.key
      if (cfg.attrsLoose) {
        // loose schema attrs ($any): keep every attribute verbatim (`out` is `any`, so the dynamic-key
        // write is fine; this mirrors how `slice`/`cloneShallow` copy attr ops)
        out.attrs[key] = op.clone()
        keptAttrKeys.add(key)
        continue
      }
      const allowed = cfg.attrAllowed.get(key)
      if (allowed === undefined) continue // unknown attribute -> drop
      if (delta.$setAttrOp.check(op)) {
        const r = needsTransform(op.value, allowed)
        if (r === null) continue
        if (r === true) { out.setAttr(key, op.value, op.attribution); this.transformAttrs.delete(key) } else { this.transformAttrs.set(key, r); out.setAttr(key, r.applyA(op.value).b, op.attribution) }
        keptAttrKeys.add(key)
      } else if (delta.$modifyAttrOp.check(op)) {
        let t = this.transformAttrs.get(key)
        if (t === undefined) {
          // no setAttr was seen first: a $deltaAny attr forwards verbatim; a narrowed delta attr builds
          // its nested conform lazily; a scalar attr has nothing to modify (drop)
          if (allowed.passAny) { out.modifyAttr(key, op.value); keptAttrKeys.add(key); continue }
          const $m = allowed.wild ?? (allowed.byName.size > 0 ? /** @type {delta.$Delta<any>} */ (allowed.byName.values().next().value) : null)
          if ($m != null) { t = nest($m); this.transformAttrs.set(key, t) }
        }
        if (t != null) { out.modifyAttr(key, t.applyA(op.value).b); keptAttrKeys.add(key) }
      } else { // deleteAttr (the only remaining attr-op kind)
        const dop = /** @type {delta.DeleteAttrOp<any>} */ (op)
        out.deleteAttr(key, dop.attribution)
        this.transformAttrs.delete(key)
        keptAttrKeys.add(key)
      }
    }
    // --- children: one cursor `(src, off)` walks `this.cmap`, editing it in place ---
    // `cmap` is the coalesced A→B child layout: retain = pass-through, insert([t]) = a child routed
    // through nested conform `t`, delete = dropped (B-width 0). retain/modify advance the cursor without
    // touching the map; insert/text/delete edit it in place via delta's @internal child mutators (which
    // keep `cmap.childCnt` in sync). Same-kind insertion grows the run in place (no split), so the map
    // stays coalesced — typing into a pass-through run is O(1) and never fragments. The untouched tail
    // past the cursor is simply left in place (no copy), so a structural edit costs O(change).
    const cmap = this.cmap
    let src = cmap.children.start
    let off = 0
    // move the cursor onto an op boundary so a fresh op can be inserted there
    const splitCursor = () => { if (off > 0 && src != null) { src = delta._splitChildAt(cmap, src, off); off = 0 } }
    // splice one run into the map at the cursor: grow the current op when it is the same kind (no split),
    // else split + insert a fresh op + coalesce. `$kind`/`make` describe a uniform retain/delete run.
    /**
     * @param {import('../../schema.js').Schema<any>} $kind
     * @param {number} n
     * @param {() => delta.RetainOp | delta.DeleteOp<any>} make
     */
    const addUniform = ($kind, n, make) => {
      if (src != null && $kind.check(src)) { delta._growRun(cmap, /** @type {delta.RetainOp | delta.DeleteOp<any>} */ (src), n); off += n } else { splitCursor(); delta._mergeChildWithPrev(cmap, delta._insertChild(cmap, src, make())) }
    }
    /** @param {number} n */
    const addRetain = n => addUniform(delta.$retainOp, n, () => new delta.RetainOp(n, null, null)) // n pass-through positions
    /** @param {number} n */
    const addDrop = n => addUniform(delta.$deleteOp, n, () => new delta.DeleteOp(n)) // n dropped positions
    /** @param {ConformTransformer} t */
    const addTransformed = t => { // one child routed through nested conform `t`
      if (src != null && delta.$insertOp.check(src)) { delta._spliceInsert(cmap, src, off, [t]); off += 1 } else { splitCursor(); delta._mergeChildWithPrev(cmap, delta._insertChild(cmap, src, new delta.InsertOp([t], null, null))) }
    }
    for (const op of dA.children) {
      if (delta.$retainOp.check(op)) {
        let rem = op.retain
        while (rem > 0 && src != null) {
          const take = math.min(src.length - off, rem)
          if (!delta.$deleteOp.check(src)) out.retain(take, op.format, op.attribution) // pass & transform: width = take
          off += take; rem -= take
          if (off >= src.length) { src = src.next; off = 0 }
        }
      } else if (delta.$modifyOp.check(op)) {
        if (src != null) {
          if (delta.$insertOp.check(src)) out.modify(/** @type {ConformTransformer} */ (src.insert[off]).applyA(delta.clone(op.value)).b, op.format, op.attribution)
          else if (delta.$retainOp.check(src)) out.modify(delta.clone(op.value), op.format, op.attribution) // pass-through child
          // dropped child (delete in map): emit nothing
          off += 1; if (off >= src.length) { src = src.next; off = 0 }
        }
      } else if (delta.$textOp.check(op)) {
        if (cfg.hasText) { out.insert(op.insert, op.format, op.attribution); addRetain(op.insert.length) } else addDrop(op.insert.length)
      } else if (delta.$insertOp.check(op)) {
        for (const el of op.insert) {
          const r = needsTransform(el, cfg.childAllowed)
          if (r === null) addDrop(1) // dropped: no name match, no scalar match
          else if (r === true) { out.insert([el], op.format, op.attribution); addRetain(1) } else { out.insert([r.applyA(el).b], op.format, op.attribution); addTransformed(r) }
        }
      } else { // delete: remove the deleted A-positions from the map
        let rem = /** @type {delta.DeleteOp<any>} */ (op).delete
        while (rem > 0 && src != null) {
          const take = math.min(src.length - off, rem)
          if (!delta.$deleteOp.check(src)) out.delete(take) // pass & transform had B-width; dropped had 0
          if (off === 0 && take === src.length) { const next = src.next; delta._removeChild(cmap, src); src = next } else { delta._shrinkChild(cmap, src, off, take); if (off >= src.length) { src = src.next; off = 0 } }
          rem -= take
        }
        // the deletion may have joined two same-kind runs: merge, keeping the cursor on the survivor
        if (src != null) {
          const prev = src.prev
          const prevLen = prev != null ? prev.length : 0
          if (delta._mergeChildWithPrev(cmap, src)) { src = prev; off += prevLen }
        }
      }
    }
    // --- marks (best-effort): map a content offset through the coalesced layout (O(#runs)) ---
    if (dA.marks !== null || dA.deleteMarks !== null) {
      delta.mergeRootMarks(out, dA, k => {
        if (typeof k !== 'number') return keptAttrKeys.has(k) ? k : null // attr mark rides iff kept
        let a = 0; let b = 0
        for (const cop of this.cmap.children) {
          if (a >= k) break
          const take = math.min(cop.length, k - a)
          if (!delta.$deleteOp.check(cop)) b += take // pass & transform keep width; drop contributes 0
          a += take
        }
        return b
      })
    }
    out.done(false)
    return createTransformResult(null, out)
  }

  /**
   * Map a B-side change back to A. The conformed view B already satisfies `$schema`, so a change
   * authored on it is also valid on A and passes straight through — the result is `{ a: dB, b: null }`
   * (mirroring `applyA`'s `{ a: null, b: out }`). Before donating it, every op is validated against the
   * schema and any op that would break conformance **throws**: text where the schema forbids text, an
   * `insert` / `setAttr` whose content fails the schema, an unknown attribute key, or a `modify` /
   * `modifyAttr` targeting a position the schema gives no delta.
   *
   * Two things are intentionally out of scope in v1: the nested change of a `modify` is not
   * deep-validated (only that a delta is permissible there), and B→A coordinates are passed through
   * verbatim — exact when nothing was dropped (B is structurally identical to A); a full drop-aware
   * position remapping through `cmap` is deferred.
   *
   * @param {delta.DeltaBuilderAny} dB
   * @return {import('./core.js').TransformResultAny}
   */
  applyB (dB) {
    const cfg = this.config
    if (cfg.passthrough) return createTransformResult(dB, null) // identity: every op conforms
    if (!cfg.attrsLoose) { // loose attrs ($any) accept any key/value — nothing to validate
      for (const op of dB.attrs) {
        const allowed = cfg.attrAllowed.get(op.key)
        if (allowed === undefined) throw error.create('[lib0/delta] conform: unknown attribute "' + op.key + '"')
        if (delta.$setAttrOp.check(op)) {
          if (!allowed.$scalar.check(op.value)) throw error.create('[lib0/delta] conform: attribute "' + op.key + '" value does not conform to the schema')
        } else if (delta.$modifyAttrOp.check(op)) {
          if (!admitsDelta(allowed)) throw error.create('[lib0/delta] conform: attribute "' + op.key + '" is a scalar and cannot be modified')
        }
        // deleteAttr: removing an attribute always conforms
      }
    }
    for (const op of dB.children) {
      if (delta.$textOp.check(op)) {
        if (!cfg.hasText) throw error.create('[lib0/delta] conform: text is not allowed by the schema')
      } else if (delta.$insertOp.check(op)) {
        for (const el of op.insert) if (!cfg.childAllowed.$scalar.check(el)) throw error.create('[lib0/delta] conform: inserted content does not conform to the schema')
      } else if (delta.$modifyOp.check(op)) {
        if (!admitsDelta(cfg.childAllowed)) throw error.create('[lib0/delta] conform: the schema has no delta child to modify')
      }
      // retain / delete: structural, no content -> always conform
    }
    return createTransformResult(dB, null) // every op conforms -> donate the change to A verbatim
  }
}

/**
 * Make the projected (side-B) delta conform to `$schema`, recursively dropping every attribute, value,
 * child node, and text run the schema does not recognize and descending into kept delta children /
 * delta-valued attributes. Content the schema accepts passes through with near-zero overhead;
 * `conform($d, delta.$deltaAny)` is the identity. Returns a reusable {@link Conform} template (a
 * `project` hole, or `.init()` for a standalone transformer). `applyB` (B → A) validates a B-side
 * change against `$schema` and passes it through, throwing on any non-conformant op.
 *
 * @template {delta.DeltaConf} IN
 * @template {delta.DeltaConf} SchemaConf
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @param {import('../../schema.js').Schema<delta.Delta<SchemaConf>>} $schema
 * @return {Conform<SchemaConf, IN>}
 */
export const conform = ($d, $schema) => new Conform($d, $schema)
