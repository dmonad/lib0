import * as delta from '../delta.js'
import * as s from '../../schema.js'
import * as math from '../../math.js'
import * as error from '../../error.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * # `conform` — proof of concept
 *
 * **Warning:** the API of this transformer is fully prototyped, but the implementation is a proof of
 * concept with a real performance impact: every change, in both directions, walks the layout (`cmap`, a
 * linked list) from its start to the edit position, so the per-edit cost grows linearly with the number
 * of layout runs before the edit (~200µs per keystroke at ~6000 runs). A more performant implementation
 * is planned once Yjs v14 matures; until then treat this one as the reference for the semantics, not as
 * the final design.
 */

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
 * Whether `node` — new B-side content (an inserted child or a `setAttr` value) — conforms at a position
 * matched by `allowed`: it validates against the schema AND, for a delta node, is routable by
 * {@link needsTransform} (matched by name, by the wildcard, or passed by `$deltaAny`/`$any`). The second
 * half matters for anonymous nodes: `$Delta.check` skips the name test when `name == null`, yet a
 * re-render (`applyA`) would DROP such a node from a name-matched schema — forwarding it to A would
 * desync the sides. Pure (allocates nothing), so the validation pre-pass can call it freely.
 *
 * @param {any} node
 * @param {Allowed} allowed
 * @return {boolean}
 */
const conforms = (node, allowed) => allowed.$scalar.check(node) && (!delta.$deltaAny.check(node) || (node.name != null && allowed.byName.has(node.name)) || allowed.wild != null || allowed.passAny)

/**
 * Whether `allowed` admits at least one delta value at this position — a `$deltaAny`/`$any` member, a
 * wildcard `$Delta`, or any name-matched `$Delta`. A `modify` / `modifyAttr` op edits a delta child or
 * delta-valued attribute, so it can only conform where this holds; against a scalar/text-only matcher it
 * is necessarily invalid. Used by {@link validateB} to reject such modifies.
 *
 * @param {Allowed} allowed
 * @return {boolean}
 */
const admitsDelta = allowed => allowed.passAny || allowed.wild != null || allowed.byName.size > 0

/**
 * The nested conform a `modifyAttr` of attribute `key` routes through, or `null` when there is nothing
 * nested to route through: a `$deltaAny`/`$any` attr (`passAny` — the change is forwarded verbatim) or a
 * scalar attr (nothing to modify). When no `setAttr` was seen first, the instance is built lazily from the
 * wildcard or the first by-name sub-schema and cached; it starts with an empty layout, i.e. the attr's
 * current content is unseen and passes through (see {@link Cursor}).
 *
 * @param {ConformTransformer} self
 * @param {string|number} key
 * @param {Allowed} allowed
 * @return {ConformTransformer?}
 */
const attrTransformerOf = (self, key, allowed) => {
  let t = self.transformAttrs.get(key)
  if (t === undefined) {
    const $m = allowed.passAny ? null : (allowed.wild ?? (allowed.byName.size > 0 ? /** @type {delta.$Delta<any>} */ (allowed.byName.values().next().value) : null))
    if ($m === null) return null
    t = nest($m)
    self.transformAttrs.set(key, t)
  }
  return t
}

/**
 * A forward cursor over a conform's layout (its {@link ConformTransformer#cmap}) — the list node `src`
 * and the offset `off` inside it — with the in-place splice helpers `applyA` / `applyB` share, so both
 * directions edit the layout with the same code. One cursor is created per change and walked once, in
 * step with the change's ops. Invariant: `src === null || 0 <= off < src.length`, so a split at the
 * cursor ({@link splitCursor}) always has a legal offset.
 *
 * `src === null` is the end of the layout. Positions past it were never seen by the conform (it was not
 * fed the initial render, or it is a lazily built nested attr conform) and pass through in both
 * directions; walking over them appends a pass-through run so the layout stays aligned with A.
 */
class Cursor {
  /**
   * @param {delta.DeltaBuilderAny} cmap
   */
  constructor (cmap) {
    this.cmap = cmap
    /** @type {delta.ChildrenOpAny?} */
    this.src = cmap.children.start
    this.off = 0
  }
}

/**
 * Advance `n` positions inside the cursor's run `src` (`n <= src.length - off`), hopping to the next run
 * at its end.
 *
 * @param {Cursor} c
 * @param {delta.ChildrenOpAny} src
 * @param {number} n
 */
const advance = (c, src, n) => {
  c.off += n
  if (c.off >= src.length) { c.src = src.next; c.off = 0 }
}

/**
 * Move the cursor onto an op boundary (splitting the run it sits inside) so a fresh op can be inserted there.
 *
 * @param {Cursor} c
 */
const splitCursor = c => { if (c.off > 0 && c.src !== null) { c.src = delta._splitChildAt(c.cmap, c.src, c.off); c.off = 0 } }

/**
 * Splice one uniform run into the layout at the cursor: grow the current run when it is the same kind
 * (no split), else split + insert a fresh op + coalesce. Same-kind insertion grows the run in place, so
 * the layout stays coalesced — typing into a pass-through run is O(1) and never fragments. The cursor
 * ends up after the new positions. `$kind`/`make` describe a uniform retain/delete run.
 *
 * @param {Cursor} c
 * @param {import('../../schema.js').Schema<any>} $kind
 * @param {number} n
 * @param {() => delta.RetainOp | delta.DeleteOp<any>} make
 */
const addUniform = (c, $kind, n, make) => {
  if (c.src !== null && $kind.check(c.src)) { delta._growRun(c.cmap, /** @type {delta.RetainOp | delta.DeleteOp<any>} */ (c.src), n); c.off += n } else { splitCursor(c); delta._mergeChildWithPrev(c.cmap, delta._insertChild(c.cmap, c.src, make())) }
}

/**
 * `n` pass-through positions.
 *
 * @param {Cursor} c
 * @param {number} n
 */
const addRetain = (c, n) => addUniform(c, delta.$retainOp, n, () => new delta.RetainOp(n, null, null))

/**
 * `n` dropped positions (A-only: they have no B width).
 *
 * @param {Cursor} c
 * @param {number} n
 */
const addDrop = (c, n) => addUniform(c, delta.$deleteOp, n, () => new delta.DeleteOp(n))

/**
 * One child routed through nested conform `t`.
 *
 * @param {Cursor} c
 * @param {ConformTransformer} t
 */
const addTransformed = (c, t) => {
  if (c.src !== null && delta.$insertOp.check(c.src)) { delta._spliceInsert(c.cmap, c.src, c.off, [t]); c.off += 1 } else { splitCursor(c); delta._mergeChildWithPrev(c.cmap, delta._insertChild(c.cmap, c.src, new delta.InsertOp([t], null, null))) }
}

/**
 * Remove `take` positions at the cursor from the layout (`take <= src.length - off`, `src` the cursor's
 * run), leaving the cursor on the position after them. Does not coalesce — see {@link mergeAtCursor}.
 *
 * @param {Cursor} c
 * @param {delta.ChildrenOpAny} src
 * @param {number} take
 */
const removeAt = (c, src, take) => {
  if (c.off === 0 && take === src.length) { c.src = src.next; delta._removeChild(c.cmap, src) } else { delta._shrinkChild(c.cmap, src, c.off, take); if (c.off >= src.length) { c.src = src.next; c.off = 0 } }
}

/**
 * After a removal, coalesce the run at the cursor into its predecessor when they are the same kind,
 * keeping the cursor on the survivor (inside it, at the old boundary).
 *
 * @param {Cursor} c
 */
const mergeAtCursor = c => {
  const src = c.src
  if (src !== null) {
    const prev = src.prev
    const prevLen = prev != null ? prev.length : 0
    if (delta._mergeChildWithPrev(c.cmap, src)) { c.src = prev; c.off += prevLen }
  }
}

/**
 * Step the cursor over the hidden runs at its position — A content that was dropped on B (B-width 0) —
 * emitting a plain `retain` over them on the A-side change `out`: a B op never touches hidden content, it
 * only reaches past it. Called at the head of every B op (eager, like `inline`'s `skipEmpty`), so a B
 * insert lands AFTER the hidden content at its position. `src.length - off` because a merge
 * ({@link mergeAtCursor}) can leave the cursor inside a hidden run.
 *
 * @param {Cursor} c
 * @param {delta.DeltaBuilderAny} out
 */
const skipHidden = (c, out) => {
  while (c.src !== null && delta.$deleteOp.check(c.src)) { out.retain(c.src.length - c.off); c.src = c.src.next; c.off = 0 }
}

/**
 * Map an A-side content offset `k` to its B-side offset through the layout (O(#runs)): hidden runs
 * contribute no B width (an offset inside one collapses to its start on B); past the end is pass-through.
 *
 * @param {delta.DeltaBuilderAny} cmap
 * @param {number} k
 * @return {number}
 */
const offsetToB = (cmap, k) => {
  let a = 0
  let b = 0
  for (const cop of cmap.children) {
    if (a >= k) break
    const take = math.min(cop.length, k - a)
    if (!delta.$deleteOp.check(cop)) b += take
    a += take
  }
  return b + (k - a)
}

/**
 * Map a B-side content offset `k` to its A-side offset through the layout (O(#runs)): every hidden run up
 * to — and at — the reached point is stepped over, matching where a B op at `k` lands (see
 * {@link skipHidden}); past the end is pass-through.
 *
 * @param {delta.DeltaBuilderAny} cmap
 * @param {number} k
 * @return {number}
 */
const offsetToA = (cmap, k) => {
  let a = 0
  let b = 0
  for (const cop of cmap.children) {
    if (delta.$deleteOp.check(cop)) { a += cop.length; continue }
    if (b >= k) break
    const take = math.min(cop.length, k - b)
    a += take
    b += take
  }
  return a + (k - b)
}

/**
 * Validate a B-side change against the schema of conform `t` **without touching any state** — the
 * throw-before-mutate contract of {@link ConformTransformer#applyB}: a rejected change leaves the
 * transformer (and its nested conforms) exactly as it was, so the caller can drop the change and keep
 * using it. Throws on an unknown attribute key, a `setAttr` value / inserted child that does not
 * {@link conforms conform}, text where the schema forbids it, a `modify` / `modifyAttr` where the schema
 * has no delta, and — recursively, walking `t.cmap` read-only to the nested conform a `modify` lands on
 * — the same inside a modified child / attribute. `retain` / `delete` are structural and always conform.
 *
 * @param {ConformTransformer} t
 * @param {delta.DeltaAny} dB
 */
const validateB = (t, dB) => {
  const cfg = t.config // never a pass-through config: applyB returns before validating, and a nested conform is always bound to a concrete $Delta
  if (!cfg.attrsLoose) { // loose attrs ($any) accept any key/value — nothing to validate
    for (const op of dB.attrs) {
      const allowed = cfg.attrAllowed.get(op.key)
      if (allowed === undefined) throw error.create('[lib0/delta] conform: unknown attribute "' + op.key + '"')
      if (delta.$setAttrOp.check(op)) {
        if (!conforms(op.value, allowed)) throw error.create('[lib0/delta] conform: attribute "' + op.key + '" value does not conform to the schema')
      } else if (delta.$modifyAttrOp.check(op)) {
        if (!admitsDelta(allowed)) throw error.create('[lib0/delta] conform: attribute "' + op.key + '" is a scalar and cannot be modified')
        const nt = attrTransformerOf(t, op.key, allowed)
        if (nt !== null) validateB(nt, op.value)
      }
      // deleteAttr: removing an attribute always conforms
    }
  }
  // retain / delete / modify consume B positions; only a modify needs the run it lands on (to validate
  // against that child's nested conform), so the read-only cursor over the layout is advanced lazily —
  // a change without modifies (typing) never walks the layout here
  let src = t.cmap.children.start
  let off = 0
  let pending = 0 // B positions consumed since the cursor was last advanced
  for (const op of dB.children) {
    if (delta.$textOp.check(op)) {
      if (!cfg.hasText) throw error.create('[lib0/delta] conform: text is not allowed by the schema')
    } else if (delta.$insertOp.check(op)) {
      for (const el of op.insert) if (!conforms(el, cfg.childAllowed)) throw error.create('[lib0/delta] conform: inserted content does not conform to the schema')
    } else {
      if (delta.$modifyOp.check(op)) {
        if (!admitsDelta(cfg.childAllowed)) throw error.create('[lib0/delta] conform: the schema has no delta child to modify')
        while (src !== null) { // advance by `pending`, stepping over hidden runs (no B width), onto the run the modify lands on
          if (delta.$deleteOp.check(src)) { src = src.next; off = 0; continue }
          if (pending === 0) break
          const take = math.min(src.length - off, pending)
          off += take
          pending -= take
          if (off >= src.length) { src = src.next; off = 0 }
        }
        if (src !== null && delta.$insertOp.check(src)) validateB(src.insert[off], op.value)
      }
      pending += op.length
    }
  }
}

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
 * `applyA` (A → B) does the full recursive filtering. `applyB` (B → A) maps a change authored on the
 * conformed view back onto A through the same layout: B positions are remapped across the content A has
 * but B does not (see {@link ConformTransformer#applyB} for the rules), and the change is first validated
 * against `$schema` — any op that would break conformance throws, before any state is touched.
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
 * The A↔B layout lives in {@link ConformTransformer#cmap} (the *child* map), a delta reused as a
 * coalesced positional map (like `children`'s `childTs`): a `retain(n)` run = pass-through positions, an
 * `insert([t])` = a child routed through nested conform `t`, a `delete(n)` run = dropped positions
 * (width 0 on B). Both directions walk it with a {@link Cursor} and edit it in place, carrying the nested
 * transformers by reference so their state survives; a change with only retains/modifies is routed
 * without touching the map.
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
    // --- attributes ---
    for (const op of dA.attrs) {
      const key = op.key
      if (cfg.attrsLoose) {
        // loose schema attrs ($any): keep every attribute verbatim (`out` is `any`, so the dynamic-key
        // write is fine; this mirrors how `slice`/`cloneShallow` copy attr ops)
        out.attrs[key] = op.clone()
        continue
      }
      const allowed = cfg.attrAllowed.get(key)
      if (allowed === undefined) continue // unknown attribute -> drop
      if (delta.$setAttrOp.check(op)) {
        const r = needsTransform(op.value, allowed)
        if (r === null) continue
        if (r === true) { out.setAttr(key, op.value, op.attribution); this.transformAttrs.delete(key) } else { this.transformAttrs.set(key, r); out.setAttr(key, r.applyA(op.value).b, op.attribution) }
      } else if (delta.$modifyAttrOp.check(op)) {
        const t = attrTransformerOf(this, key, allowed)
        // no nested conform: a $deltaAny attr forwards verbatim; a scalar attr has nothing to modify (drop)
        if (t !== null) out.modifyAttr(key, t.applyA(op.value).b, op.attribution)
        else if (allowed.passAny) out.modifyAttr(key, op.value, op.attribution)
      } else { // deleteAttr (the only remaining attr-op kind)
        const dop = /** @type {delta.DeleteAttrOp<any>} */ (op)
        out.deleteAttr(key, dop.attribution)
        this.transformAttrs.delete(key)
      }
    }
    // --- children: one cursor walks `this.cmap`, editing it in place ---
    // retain/modify advance the cursor without touching the map; insert/text/delete edit it in place via
    // delta's @internal child mutators (which keep `cmap.childCnt` in sync). The untouched tail past the
    // cursor is simply left in place (no copy), so a structural edit costs O(change).
    const c = new Cursor(this.cmap)
    for (const op of dA.children) {
      if (delta.$retainOp.check(op)) {
        let rem = op.retain
        while (rem > 0 && c.src !== null) {
          const src = c.src
          const take = math.min(src.length - c.off, rem)
          if (!delta.$deleteOp.check(src)) out.retain(take, op.format, op.attribution) // pass & transform: width = take
          advance(c, src, take)
          rem -= take
        }
        if (rem > 0) { out.retain(rem, op.format, op.attribution); addRetain(c, rem) } // past the layout: unseen content passes through
      } else if (delta.$modifyOp.check(op)) {
        const src = c.src
        if (src === null) { out.modify(delta.clone(op.value), op.format, op.attribution); addRetain(c, 1) } else { // past the layout: unseen child passes through
          if (delta.$insertOp.check(src)) out.modify(/** @type {ConformTransformer} */ (src.insert[c.off]).applyA(delta.clone(op.value)).b, op.format, op.attribution)
          else if (delta.$retainOp.check(src)) out.modify(delta.clone(op.value), op.format, op.attribution) // pass-through child
          // dropped child (delete in map): emit nothing
          advance(c, src, 1)
        }
      } else if (delta.$textOp.check(op)) {
        if (cfg.hasText) { out.insert(op.insert, op.format, op.attribution); addRetain(c, op.insert.length) } else addDrop(c, op.insert.length)
      } else if (delta.$insertOp.check(op)) {
        for (const el of op.insert) {
          const r = needsTransform(el, cfg.childAllowed)
          if (r === null) addDrop(c, 1) // dropped: no name match, no scalar match
          else if (r === true) { out.insert([el], op.format, op.attribution); addRetain(c, 1) } else { out.insert([r.applyA(el).b], op.format, op.attribution); addTransformed(c, r) }
        }
      } else { // delete: remove the deleted A-positions from the map
        let rem = /** @type {delta.DeleteOp<any>} */ (op).delete
        while (rem > 0 && c.src !== null) {
          const src = c.src
          const take = math.min(src.length - c.off, rem)
          if (!delta.$deleteOp.check(src)) out.delete(take) // pass & transform had B-width; dropped had 0
          removeAt(c, src, take)
          rem -= take
        }
        if (rem > 0) out.delete(rem) // past the layout: unseen content passes through
        mergeAtCursor(c) // the deletion may have joined two same-kind runs
      }
    }
    // --- marks (best-effort): an attr mark rides iff the schema knows the attr; a content mark maps through the layout ---
    if (dA.marks !== null || dA.deleteMarks !== null) {
      delta.mergeRootMarks(out, dA, k => typeof k !== 'number' ? (cfg.attrsLoose || cfg.attrAllowed.has(k) ? k : null) : offsetToB(this.cmap, k))
    }
    out.done(false)
    return createTransformResult(null, out)
  }

  /**
   * Map a B-side change back to A. The conformed view B is A minus the content the schema rejects, so a
   * change authored on B is valid on A once its positions are remapped across the hidden content —
   * which is what the layout ({@link ConformTransformer#cmap}) records. The result is `{ a: out, b: null }`
   * (mirroring `applyA`'s `{ a: null, b: out }`). Rules, matching `inline`'s handling of zero-width content:
   * - hidden A content (dropped on B) is stepped over eagerly at the head of every B op with a plain
   *   `retain` on A: a B insert lands *after* the hidden content at its position, a B `retain`'s
   *   format/attribution never touches it, and a B `delete` spanning it keeps it (the view only deletes
   *   what it can see);
   * - a `modify` of a kept child / `modifyAttr` of a kept delta attribute routes through that child's
   *   nested conform (recursively remapped); a pass-through child forwards verbatim;
   * - B-inserted content is recorded in the layout (a node matched to a narrower `$Delta` gets a nested
   *   conform, warmed on the node), so later edits on either side route correctly;
   * - positions past the end of the layout (content the conform never saw) pass through.
   *
   * The change is validated first (see {@link validateB}) and **throws** before any state is touched on
   * any op that would break conformance: text where the schema forbids text, an `insert` / `setAttr`
   * whose content fails the schema (or an anonymous node where the schema names its children), an
   * unknown attribute key, a `modify` / `modifyAttr` targeting a position the schema gives no delta —
   * recursively inside modified children / attributes.
   *
   * @param {delta.DeltaBuilderAny} dB
   * @return {import('./core.js').TransformResultAny}
   */
  applyB (dB) {
    const cfg = this.config
    if (cfg.passthrough) return createTransformResult(dB, null) // identity: every op conforms
    validateB(this, dB)
    const out = /** @type {any} */ (delta.create(/** @type {any} */ (dB.name)))
    // --- attributes: forwarded verbatim (B's attrs are A's attrs); the nested conforms are kept in step ---
    for (const op of dB.attrs) {
      const key = op.key
      if (cfg.attrsLoose) { out.attrs[key] = op.clone(); continue } // loose schema attrs ($any): verbatim
      if (delta.$setAttrOp.check(op)) {
        // reason: validateB rejected every value needsTransform maps to null
        const r = /** @type {ConformTransformer | true} */ (needsTransform(op.value, /** @type {Allowed} */ (cfg.attrAllowed.get(key))))
        // a narrowed delta value gets a fresh nested conform, warmed on the value so its layout describes
        // it (the output is discarded — the value conforms, so it is the value itself; `applyA` reads its
        // input without mutating it, so a frozen value is fine here)
        if (r === true) this.transformAttrs.delete(key); else { r.applyA(op.value); this.transformAttrs.set(key, r) }
        out.setAttr(key, op.value, op.attribution)
      } else if (delta.$modifyAttrOp.check(op)) {
        // reason: validateB rejected unknown keys
        const t = attrTransformerOf(this, key, /** @type {Allowed} */ (cfg.attrAllowed.get(key)))
        out.modifyAttr(key, t !== null ? t.applyB(op.value).a : op.value, op.attribution) // no nested conform ($deltaAny attr): verbatim
      } else { // deleteAttr
        out.deleteAttr(key, /** @type {delta.DeleteAttrOp<any>} */ (op).attribution)
        this.transformAttrs.delete(key)
      }
    }
    // --- children: one cursor walks `this.cmap`; hidden runs are stepped over at the head of every op ---
    const c = new Cursor(this.cmap)
    for (const op of dB.children) {
      skipHidden(c, out)
      if (delta.$retainOp.check(op)) {
        let rem = op.retain
        while (rem > 0 && c.src !== null) {
          const src = c.src
          const take = math.min(src.length - c.off, rem)
          out.retain(take, op.format, op.attribution)
          advance(c, src, take)
          rem -= take
          skipHidden(c, out)
        }
        if (rem > 0) { out.retain(rem, op.format, op.attribution); addRetain(c, rem) } // past the layout: unseen content passes through
      } else if (delta.$deleteOp.check(op)) {
        let rem = op.delete
        while (rem > 0 && c.src !== null) {
          const src = c.src
          const take = math.min(src.length - c.off, rem)
          out.delete(take)
          removeAt(c, src, take)
          rem -= take
          mergeAtCursor(c) // a hidden run kept inside the range can now sit between two removed runs: re-coalesce after each removal
          skipHidden(c, out)
        }
        if (rem > 0) out.delete(rem) // past the layout: unseen content passes through
      } else if (delta.$modifyOp.check(op)) {
        const src = c.src
        if (src === null) { out.modify(delta.clone(op.value), op.format, op.attribution); addRetain(c, 1) } else { // past the layout: unseen child passes through
          // a transformed child routes through its nested conform; a pass-through child forwards verbatim
          out.modify(delta.$insertOp.check(src) ? /** @type {ConformTransformer} */ (src.insert[c.off]).applyB(delta.clone(op.value)).a : delta.clone(op.value), op.format, op.attribution)
          advance(c, src, 1)
        }
      } else if (delta.$textOp.check(op)) {
        out.insert(op.insert, op.format, op.attribution)
        addRetain(c, op.insert.length)
      } else { // insert: every element conforms (validated); record each in the layout, then forward verbatim
        for (const el of /** @type {delta.InsertOp<any>} */ (op).insert) {
          // reason: validateB rejected every child needsTransform maps to null
          const r = /** @type {ConformTransformer | true} */ (needsTransform(el, cfg.childAllowed))
          if (r === true) addRetain(c, 1); else { r.applyA(el); addTransformed(c, r) } // warm the nested conform on the node (see setAttr above)
        }
        out.insert(/** @type {delta.InsertOp<any>} */ (op).insert, op.format, op.attribution)
      }
    }
    // --- marks (best-effort): an attr mark rides verbatim (B's attrs are A's attrs); a content mark maps through the layout ---
    if (dB.marks !== null || dB.deleteMarks !== null) {
      delta.mergeRootMarks(out, dB, k => typeof k !== 'number' ? k : offsetToA(this.cmap, k))
    }
    out.done(false)
    return createTransformResult(out, null)
  }
}

/**
 * Make the projected (side-B) delta conform to `$schema`, recursively dropping every attribute, value,
 * child node, and text run the schema does not recognize and descending into kept delta children /
 * delta-valued attributes. Content the schema accepts passes through with near-zero overhead;
 * `conform($d, delta.$deltaAny)` is the identity. Returns a reusable {@link Conform} template (a
 * `project` hole, or `.init()` for a standalone transformer). `applyB` (B → A) maps a change authored on
 * the conformed view back onto A, remapping its positions across the content the schema hid; it validates
 * the change against `$schema` first and throws on any non-conformant op, before touching any state.
 *
 * @template {delta.DeltaConf} IN
 * @template {delta.DeltaConf} SchemaConf
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @param {import('../../schema.js').Schema<delta.Delta<SchemaConf>>} $schema
 * @return {Conform<SchemaConf, IN>}
 */
export const conform = ($d, $schema) => new Conform($d, $schema)
