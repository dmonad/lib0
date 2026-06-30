/**
 * @beta this API is about to change
 *
 * ## Consumer API
 *
 * This module exports a large surface, but a consumer only needs a handful of it:
 * - **build / apply / inspect:** {@link create} (the constructor) and the {@link DeltaBuilder} methods
 *   it returns (`insert`/`delete`/`retain`/`modify`/`setAttr`/`addMark`/…, `apply`, `rebase`, `done`);
 *   {@link clone}, {@link slice}, {@link diff}, and `toJSON`/`equals`/`isEmpty` on the result.
 * - **schemas:** {@link $delta} (define a typed delta schema) and {@link $deltaAny} (the catch-all).
 * - **types:** `Delta`, `DeltaBuilder`, `DeltaAny`, `DeltaConf` for annotations.
 *
 * Everything else is `@internal` plumbing: the `*Op` classes and `$*Op` schema sentinels exist for the
 * transformer layer's V8-stable dispatch (do not construct them); the `*RootMark*` helpers,
 * {@link cloneShallow}, {@link random}, the merge helpers, and the remaining `$*` schemas are for
 * cross-module / custom-transformer use, not application code. The other `DeltaConf*` typedefs are the
 * inference machinery behind the fluent builder's typed chain — never named directly.
 *
 * ## Mutability
 *
 * Deltas are mutable by default. But references are often shared, by marking a Delta as "done". You
 * may only modify deltas by applying other deltas to them. Casting a Delta to a DeltaBuilder
 * manually, will likely modify "shared" state.
 */

import * as list from '../list.js'
import * as object from '../object.js'
import * as equalityTrait from '../trait/equality.js'
import * as fingerprintTrait from '../trait/fingerprint.js'
import * as arr from '../array.js'
import * as fun from '../function.js'
import * as s from '../schema.js'
import * as error from '../error.js'
import * as math from '../math.js'
import * as rabin from '../hash/rabin.js'
import * as encoding from '../encoding.js'
import * as buffer from '../buffer.js'
import * as patience from '../diff/patience.js'
import * as prng from '../prng.js'
import * as rand from '../random.js'

/**
 * Provenance metadata on a content/attr op: *who/what* inserted, deleted, or formatted it. The canonical
 * shape below is a convention — apply/diff/equality treat attribution as an **opaque** object (never branching
 * on these field names), so custom keys flow through — with ONE exception: the nested `format` key merges per
 * inner key (one level), so applying `{format:{italic:[…]}}` *adds* italic while keeping a pre-existing
 * `{format:{bold:[…]}}`, and `{format:{bold:null}}` removes just that inner key (an emptied `format` is
 * dropped). Every other key is flat/wholesale. The `format`/`formatAt` part exists only on
 * children (content ops), never on node attribute ops. As an *update value* on `retain`/`modify`/`*Attr`,
 * attribution uses the same unified tri-state as {@link FormattingAttributes} (`undefined` skip / `null`
 * clear / `{k:v}` set / `{k:null}` remove) — see the delta `readme.md` "Formats & Attributions". The blanket
 * `null`-clear channel caveat on {@link FormattingAttributes} applies here too; note `rebase` does not
 * reconcile attribution at all (concurrent attribution edits don't converge), so prefer deterministic
 * attribution assignment outside of concurrent editing.
 *
 * @typedef {{
 *   insert?: string[]
 *   insertAt?: number
 *   delete?: string[]
 *   deleteAt?: number
 *   format?: Record<string,string[]>
 *   formatAt?: number
 * }} Attribution
 */

/**
 * @type {s.Schema<Attribution>}
 */
export const $attribution = /* @__PURE__ */(() => s.$object({
  insert: s.$array(s.$string).optional,
  insertAt: s.$number.optional,
  delete: s.$array(s.$string).optional,
  deleteAt: s.$number.optional,
  format: s.$record(s.$string, s.$array(s.$string)).optional,
  formatAt: s.$number.optional
}))()

/**
 * Rich-text formatting attributes (`{ bold: true, … }`). As an *update value* on `retain`/`modify` it is a
 * unified tri-state (identical to {@link Attribution}): `undefined`/omitted = skip, `null` = clear all,
 * `{k:v}` = set, `{k:null}` = remove key — see the delta `readme.md` "Formats & Attributions".
 *
 * ⚠️ **Blanket `null` clear is a local-only utility — never send it over a channel.** A `null` clear carries
 * no key information, so it cannot be reconciled key-by-key under `rebase`: a clear *always wins* a concurrent
 * edit (priority-independent — that is what makes it converge), which silently DROPS the other side's set. For
 * collaborative / transmitted data, clear keys individually with `{k:null}` removals instead — those reconcile
 * by priority and converge without data loss (this is what {@link diff} emits and what the rebase fuzz uses).
 *
 * @typedef {{ [key: string]: any }} FormattingAttributes
 */

/**
 * @typedef {{ id: string, key: number|string, assoc: 1|-1, attrs?: object }} MarkJSON
 */

/**
 * @typedef {{
 *   type: 'delta',
 *   name?: string,
 *   attrs?: { [Key in string|number]: DeltaAttrOpJSON },
 *   children?: Array<DeltaListOpJSON>,
 *   marks?: Array<MarkJSON>,
 *   deleteMarks?: Array<string>
 * }} DeltaJSON
 */

/**
 * @typedef {{ type: 'insert', insert: string|Array<any>, format?: { [key: string]: any }, attribution?: Attribution } | { delete: number } | { type: 'retain', retain: number, format?: { [key:string]: any }|null, attribution?: Attribution|null } | { type: 'modify', value: object, format?: { [key:string]: any }|null, attribution?: Attribution|null }} DeltaListOpJSON
 */

/**
 * @typedef {{ type: 'insert', value: any, prevValue?: any, attribution?: Attribution } | { type: 'delete', prevValue?: any, attribution?: Attribution } | { type: 'modify', value: DeltaJSON, attribution?: Attribution|null }} DeltaAttrOpJSON
 */

/**
 * @typedef {TextOp|InsertOp<any>|DeleteOp|RetainOp|ModifyOp<any>} ChildrenOpAny
 */

/**
 * @typedef {SetAttrOp<any>|DeleteAttrOp<any>|ModifyAttrOp} AttrOpAny
 */

/**
 * @typedef {ChildrenOpAny|AttrOpAny} _OpAny
 */

/**
 * @type {s.Schema<DeltaAttrOpJSON>}
 */
export const $deltaMapChangeJson = /* @__PURE__ */(() => s.$union(
  s.$object({ type: s.$literal('insert'), value: s.$any, prevValue: s.$any.optional, attribution: $attribution.optional }),
  s.$object({ type: s.$literal('modify'), value: s.$any, attribution: $attribution.optional }),
  s.$object({ type: s.$literal('delete'), prevValue: s.$any.optional, attribution: $attribution.optional })
))()

/**
 * @template {{[key:string]: any} | null | undefined} Attrs
 * @param {Attrs} attrs
 * @return {Attrs}
 */
const _cloneAttrs = attrs => attrs == null ? attrs : { ...attrs }
/**
 * Shallow per-key tri-state merge of `update` into `base` (the usual `format`-dimension semantics, also reused
 * as the inner step of {@link mergeAttr}). Per key: `undefined` skips, `null` removes, anything else sets.
 * `resolve` true (data semantics) applies a `null` removal by deleting the key; false (instruction semantics)
 * keeps the `null` verbatim so it still removes when the instruction is later applied. When `resolve` is true
 * the `base` is canonicalised too — a `{k:null}` already present in `base` (e.g. from a `useAttribution`
 * context) has nothing to clear on settled data, so it is dropped rather than copied through.
 *
 * @param {{[k:string]:any}|null|undefined} base
 * @param {{[k:string]:any}} update
 * @param {boolean} resolve
 * @return {{[k:string]:any}}
 */
const mergeShallow = (base, update, resolve) => {
  const r = /** @type {{[k:string]:any}} */ ({})
  // copy base; when resolving, drop any `{k:null}` removal already in base (settled data carries no `null` leaf)
  if (s.$objectAny.check(base)) for (const k in base) { if (!resolve || base[k] !== null) r[k] = base[k] }
  for (const k in update) {
    const v = update[k]
    if (v === undefined) continue // skip this key
    else if (v !== null) r[k] = v // set this key
    else if (resolve) delete r[k] // data: apply the removal
    else r[k] = null // instruction: keep the `null` removal verbatim for later
  }
  return r
}
/**
 * Merge for the `attribution` dimension: the usual shallow tri-state ({@link mergeShallow}) **except** the
 * `format` key — attribution's one structured sub-field — is itself merged per inner key (one level only, same
 * tri-state). This realises "first merge the formats, then merge the whole attribution". The nesting applies to
 * the `format` key alone; every other attribution key (`insert`/`delete` arrays, the `*At` numbers, …) stays a
 * leaf. An emptied `format` is dropped (a settled attribution never stores `format: {}`). When `resolve` is
 * true the `base` is canonicalised too (see {@link mergeShallow}): a `{k:null}` leaf in `base`, and a
 * `{innerK:null}` inside `base.format`, have nothing to clear on settled data, so they are dropped — an
 * emptied `base.format` is removed. This collapses a `useAttribution({format:{bold:null}})`-style context on
 * a data op instead of storing the removal.
 *
 * @param {{[k:string]:any}|null|undefined} base
 * @param {{[k:string]:any}} update
 * @param {boolean} resolve see {@link mergeShallow}
 * @return {{[k:string]:any}}
 */
const mergeAttr = (base, update, resolve) => {
  // copy base; when resolving, canonicalise it — drop a `{k:null}` leaf and resolve `base.format`'s own
  // inner removals (dropping an emptied `format`). On an instruction merge (`!resolve`) base is copied verbatim.
  const r = /** @type {{[k:string]:any}} */ ({})
  if (s.$objectAny.check(base)) {
    for (const k in base) {
      const bv = base[k]
      if (resolve && bv === null) continue // drop a base leaf removal
      if (resolve && k === 'format' && s.$objectAny.check(bv)) {
        const f = mergeShallow(bv, {}, true) // resolve base.format's own `{innerK:null}` removals
        if (!object.isEmpty(f)) r[k] = f // drop an emptied format
      } else r[k] = bv
    }
  }
  for (const k in update) {
    const v = update[k]
    if (v === undefined) continue // skip this key
    else if (k === 'format' && s.$objectAny.check(v)) { // the one nested key: merge per inner key (one level)
      const sub = mergeShallow(r[k], v, resolve)
      if (object.isEmpty(sub)) delete r[k] // emptied format ⇒ drop the key
      else r[k] = sub
    } else if (v !== null) r[k] = v // set leaf
    else if (resolve) delete r[k] // data: apply the removal
    else r[k] = null // instruction: keep the `null` removal verbatim for later
  }
  return r
}
/**
 * Resolve a retain's tri-state `format`/`attribution` instruction against an EMPTY base — used by a
 * `final` (materializing) apply for a retain that extends beyond existing content: a `{k:null}` removal or
 * a `null` clear has nothing to act on, so it collapses to `undefined` (skip); a set survives. `deep`
 * selects the attribution merge (its nested `format` key merges one level, {@link mergeAttr}) vs. the
 * shallow `format` merge ({@link mergeShallow}).
 *
 * @param {{[k:string]:any}|null|undefined} arg
 * @param {boolean} deep
 * @return {{[k:string]:any}|undefined}
 */
const resolveBeyond = (arg, deep) => {
  if (arg == null) return undefined // undefined = skip; null = clear-all with nothing to clear = no-op
  const m = deep ? mergeAttr(undefined, arg, true) : mergeShallow(undefined, arg, true)
  return object.isEmpty(m) ? undefined : m
}
/**
 * Combine a builder's `used*` context (set via {@link DeltaBuilder#useAttributes}/`useAttribution`) with
 * a per-call format/attribution argument under the unified tri-state: `undefined` inherits the context
 * (or stays `undefined` — "skip" — when there is none); `null` clears (ignoring the context); an object
 * merges over the context. `resolve` true (data op) applies any `{k:null}` removal against the context so the
 * stored value is canonical (no `null` leaves); false (instruction op) keeps removals verbatim for later.
 *
 * @param {{[k:string]:any}|null} used
 * @param {{[k:string]:any}|null|undefined} arg
 * @param {boolean} deep `true` for the `attribution` dimension (its `format` key merges per inner key via
 *   {@link mergeAttr}); `false` for `format` (shallow, {@link mergeShallow}).
 * @param {boolean} resolve see above ({@link mergeShallow})
 * @return {{[k:string]:any}|null|undefined}
 */
const combineUsed = (used, arg, deep, resolve) =>
  arg === undefined
    ? (used === null ? undefined : used)
    : arg === null
      ? null
      : (deep ? mergeAttr(used, arg, resolve) : mergeShallow(used, arg, resolve))
/**
 * Combine + normalize for an **instruction** op (`retain`/`modify`/`modifyAttr`): keep the tri-state —
 * `undefined` (skip), `null` (clear), or a non-empty object; an empty merge result `{}` is a no-op → `undefined`.
 *
 * @param {{[k:string]:any}|null} used
 * @param {{[k:string]:any}|null|undefined} arg
 * @param {boolean} deep see {@link combineUsed}
 * @return {{[k:string]:any}|null|undefined}
 */
const combineInstr = (used, arg, deep) => { const r = combineUsed(used, arg, deep, false); return r !== null && object.isEmpty(r) ? undefined : r }
/**
 * Combine + normalize for a **data** op (`insert`/`text`/`setAttr`/`deleteAttr`): the stored value is a
 * canonical object or `null` ("none") — `{k:null}` removals are resolved against the context, and
 * `undefined`/`null`/`{}` all collapse to `null`.
 *
 * @param {{[k:string]:any}|null} used
 * @param {{[k:string]:any}|null|undefined} arg
 * @param {boolean} deep see {@link combineUsed}
 * @return {{[k:string]:any}|null}
 */
const combineData = (used, arg, deep) => { const r = combineUsed(used, arg, deep, true); return object.isEmpty(r) ? null : /** @type {{[k:string]:any}} */ (r) }
/**
 * @template {any} MaybeDelta
 * @param {MaybeDelta} maybeDelta
 * @return {MaybeDelta}
 */
const _markMaybeDeltaAsDone = maybeDelta => $deltaAny.check(maybeDelta) ? /** @type {MaybeDelta} */ (maybeDelta.done()) : maybeDelta

/**
 * Invariants shared by all op classes below (TextOp, InsertOp, DeleteOp,
 * RetainOp, ModifyOp, SetAttrOp, DeleteAttrOp, ModifyAttrOp):
 *
 * - **Only code inside `delta.js` may mutate op fields.** External consumers
 *   treat ops as immutable; structural fields are JSDoc-annotated `@readonly`
 *   to reinforce this. Mutation is permitted only while the owning Delta is
 *   not `done` — every builder entry point routes through `modDeltaCheck`
 *   to enforce this at runtime.
 * - **Any mutation of a fingerprinted field MUST null `_fingerprint`.** The
 *   fingerprint is a lazy cache; if it has already been computed and the
 *   underlying data changes without invalidating it, every subsequent
 *   fingerprint read (and any `diff` / equality check that relies on it) is
 *   wrong. Fields covered: insert, delete, retain, format, attribution,
 *   value, key.
 *
 * @internal not part of the consumer API — a content op; build deltas via {@link create}/{@link DeltaBuilder}.
 */
export class TextOp extends list.ListNode {
  /**
   * @param {string} insert
   * @param {FormattingAttributes|null} format
   * @param {Attribution?} attribution
   */
  constructor (insert, format, attribution) {
    super()
    // Whenever this is modified, make sure to clear _fingerprint
    /**
     * @readonly
     * @type {string}
     */
    this.insert = insert
    /**
     * @readonly
     * @type {FormattingAttributes|null}
     */
    this.format = format
    this.attribution = attribution
    /**
     * @type {string?}
     */
    this._fingerprint = null
  }

  /**
   * @param {string} newVal
   */
  _updateInsert (newVal) {
    // @ts-ignore
    this.insert = newVal
    this._fingerprint = null
  }

  /**
   * @return {'insert'}
   */
  get type () {
    return 'insert'
  }

  get length () {
    return this.insert.length
  }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 0) // textOp type: 0
      encoding.writeVarString(encoder, this.insert)
      encoding.writeAny(encoder, this.format)
      encoding.writeAny(encoder, this.attribution)
    })))
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} offset
   * @param {number} len
   */
  _splice (offset, len) {
    this._fingerprint = null
    // @ts-ignore
    this.insert = this.insert.slice(0, offset) + this.insert.slice(offset + len)
    return this
  }

  /**
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    const { insert, format, attribution } = this
    return object.assign(/** @type {{type: 'insert', insert: string}} */ ({ type: 'insert', insert }), format != null ? { format } : ({}), attribution != null ? { attribution } : ({}))
  }

  /**
   * @param {TextOp} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $textOp.check(other) &&
      fun.equalityDeep(this.insert, other.insert) &&
      (
        (object.isEmpty(this.format) && object.isEmpty(other.format)) || fun.equalityDeep(this.format, other.format)
      ) &&
      fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @param {number} [start]
   * @param {number} [end]
   * @param {boolean} [_markAsDone] accepted for a uniform children-op `clone` signature; ignored (text
   * holds no nested deltas to freeze).
   * @return {TextOp}
   */
  clone (start = 0, end = this.length, _markAsDone = true) {
    return new TextOp(this.insert.slice(start, end), _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * @template {any} ArrayContent
 * @internal not part of the consumer API — a content op; build deltas via {@link create}/{@link DeltaBuilder}.
 */
export class InsertOp extends list.ListNode {
  /**
   * @param {Array<ArrayContent>} insert
   * @param {FormattingAttributes|null} format
   * @param {Attribution?} attribution
   */
  constructor (insert, format, attribution) {
    super()
    /**
     * @readonly
     * @type {Array<ArrayContent>}
     */
    this.insert = insert
    /**
     * @readonly
     * @type {FormattingAttributes?}
     */
    this.format = format
    /**
     * @readonly
     * @type {Attribution?}
     */
    this.attribution = attribution
    /**
     * @type {string?}
     */
    this._fingerprint = null
  }

  /* c8 ignore start */
  /**
   * @param {ArrayContent} _newVal
   */
  _updateInsert (_newVal) {
    // Mirror of TextOp._updateInsert; not currently called on InsertOp because
    // adjacent inserts are merged in-place via `end.insert.push(...)`. Kept for
    // parity with TextOp's API.
    error.unexpectedCase() // throw if called
  }
  /* c8 ignore stop */

  /**
   * @return {'insert'}
   */
  get type () {
    return 'insert'
  }

  get length () {
    return this.insert.length
  }

  /**
   * @param {number} i
   * @return {Extract<ArrayContent,DeltaAny>}
   */
  _modValue (i) {
    /**
     * @type {any}
     */
    let d = this.insert[i]
    this._fingerprint = null
    $deltaAny.expect(d)
    if (d.isDone) {
      // @ts-ignore
      this.insert[i] = (d = clone(d))
      return d
    }
    return d
  }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 1) // insertOp type: 1
      encoding.writeVarUint(encoder, this.insert.length)
      this.insert.forEach(ins => {
        encoding.writeVarString(encoder, fingerprintTrait.fingerprint(/** @type {any} */ (ins)))
      })
      encoding.writeAny(encoder, this.format)
      encoding.writeAny(encoder, this.attribution)
    })))
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} offset
   * @param {number} len
   */
  _splice (offset, len) {
    this._fingerprint = null
    this.insert.splice(offset, len)
    return this
  }

  /**
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    const { insert, format, attribution } = this
    return object.assign({ type: /** @type {'insert'} */ ('insert'), insert: insert.map(ins => $deltaAny.check(ins) ? ins.toJSON() : ins) }, format ? { format } : ({}), attribution != null ? { attribution } : ({}))
  }

  /**
   * @param {InsertOp<ArrayContent>} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $insertOp.check(other) &&
      fun.equalityDeep(this.insert, other.insert) &&
      (
        (object.isEmpty(this.format) && object.isEmpty(other.format)) || fun.equalityDeep(this.format, other.format)
      ) &&
      fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @param {number} [start]
   * @param {number} [end]
   * @param {boolean} [markAsDone] freeze the cloned child deltas (the default — a shared clone must be
   * immutable). Pass `false` only when the caller is the SOLE owner of the cloned range (a *move*, e.g.
   * `splitHere` which `_splice`s the range out of the source), so the content can stay mutable and is
   * not re-cloned on the next modify (see {@link modValue}).
   * @return {InsertOp<ArrayContent>}
   */
  clone (start = 0, end = this.length, markAsDone = true) {
    const insert = this.insert.slice(start, end)
    return new InsertOp(markAsDone ? insert.map(_markMaybeDeltaAsDone) : insert, _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * @template {DeltaConf} [Conf={}]
 * @internal not part of the consumer API — a content op; build deltas via {@link create}/{@link DeltaBuilder}.
 */
export class DeleteOp extends list.ListNode {
  /**
   * @param {number} len
   * @param {DeltaBuilder<any>?} prevValue
   */
  constructor (len, prevValue) {
    super()
    this.delete = len
    this.prevValue = /** @type {Delta<Conf>?} */ (prevValue)
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @return {'delete'}
   */
  get type () {
    return 'delete'
  }

  get length () {
    return this.delete
  }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 2) // deleteOp type: 2
      encoding.writeVarUint(encoder, this.delete)
    })))
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} offset
   * @param {number} len
   */
  _splice (offset, len) {
    if (this.prevValue) {
      /** @type {DeltaBuilder<any>} */ (this.prevValue).apply(create().retain(offset).delete(len))
    }
    this._fingerprint = null
    this.delete -= len
    return this
  }

  /**
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    return { delete: this.delete }
  }

  /**
   * @param {DeleteOp} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $deleteOp.check(other) && this.delete === other.delete
  }

  /**
   * @param {number} [start]
   * @param {number} [end]
   * @param {boolean} [_markAsDone] accepted for a uniform children-op `clone` signature; ignored (a
   * cloned delete carries no prevValue).
   * @return {DeleteOp}
   */
  clone (start = 0, end = this.delete, _markAsDone = true) {
    return new DeleteOp(end - start, null)
  }
}

/**
 * @internal not part of the consumer API — a content op; build deltas via {@link create}/{@link DeltaBuilder}.
 */
export class RetainOp extends list.ListNode {
  /**
   * @param {number} retain
   * @param {FormattingAttributes|null|undefined} format tri-state: `undefined` skip / `null` clear / object merge
   * @param {Attribution|null|undefined} attribution tri-state: `undefined` skip / `null` clear / object merge
   */
  constructor (retain, format, attribution) {
    super()
    /**
     * @readonly
     * @type {number}
     */
    this.retain = retain
    /**
     * @readonly
     * @type {FormattingAttributes|null|undefined}
     */
    this.format = format
    /**
     * @readonly
     * @type {Attribution|null|undefined}
     */
    this.attribution = attribution
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @return {'retain'}
   */
  get type () {
    return 'retain'
  }

  get length () {
    return this.retain
  }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 3) // retainOp type: 3
      encoding.writeVarUint(encoder, this.retain)
      encoding.writeAny(encoder, this.format)
      encoding.writeAny(encoder, this.attribution)
    })))
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} _offset
   * @param {number} len
   */
  _splice (_offset, len) {
    // @ts-ignore
    this.retain -= len
    this._fingerprint = null
    return this
  }

  /**
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    const { retain, format, attribution } = this
    // retain is an instruction op: emit `null` (clear) distinctly from `undefined` (skip / omitted)
    return object.assign({ type: /** @type {'retain'} */ ('retain'), retain }, format !== undefined ? { format } : {}, attribution !== undefined ? { attribution } : {})
  }

  /**
   * @param {RetainOp} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $retainOp.check(other) &&
      this.retain === other.retain &&
      (
        (object.isEmpty(this.format) && object.isEmpty(other.format)) || fun.equalityDeep(this.format, other.format)
      ) &&
      fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @param {number} [start]
   * @param {number} [end]
   * @param {boolean} [_markAsDone] accepted for a uniform children-op `clone` signature; ignored (retain
   * holds no nested deltas).
   * @return {RetainOp}
   */
  clone (start = 0, end = this.retain, _markAsDone = true) {
    return new RetainOp(end - start, _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * Delta that can be applied on a YType Embed
 *
 * @template {Delta} [DTypes=DeltaAny]
 * @internal not part of the consumer API — a content op; build deltas via {@link create}/{@link DeltaBuilder}.
 */
export class ModifyOp extends list.ListNode {
  /**
   * @param {DTypes} delta
   * @param {FormattingAttributes|null|undefined} format tri-state: `undefined` skip / `null` clear / object merge
   * @param {Attribution|null|undefined} attribution tri-state: `undefined` skip / `null` clear / object merge
   */
  constructor (delta, format, attribution) {
    super()
    /**
     * @readonly
     * @type {DTypes}
     */
    this.value = delta
    /**
     * @readonly
     * @type {FormattingAttributes|null|undefined}
     */
    this.format = format
    /**
     * @readonly
     * @type {Attribution|null|undefined}
     */
    this.attribution = attribution
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @return {'modify'}
   */
  get type () {
    return 'modify'
  }

  get length () {
    return 1
  }

  /**
   * @type {DeltaBuilderAny}
   */
  get _modValue () {
    return modValue(this)
  }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 4) // modifyOp type: 4
      encoding.writeVarString(encoder, this.value.fingerprint)
      encoding.writeAny(encoder, this.format)
      encoding.writeAny(encoder, this.attribution)
    })))
  }

  /* c8 ignore start */
  // ModifyOp has length 1, so callers never pass offset>0 or len>0 — splitHere
  // is a no-op for length-1 ops. Kept for the structural _splice contract.
  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} _offset
   * @param {number} _len
   */
  _splice (_offset, _len) {
    return this
  }
  /* c8 ignore stop */

  /**
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    const { value, attribution, format } = this
    // modify is an instruction op: emit `null` (clear) distinctly from `undefined` (skip / omitted)
    return object.assign(
      { type: /** @type {'modify'} */ ('modify'), value: value.toJSON() },
      format !== undefined ? { format } : {},
      attribution !== undefined ? { attribution } : {}
    )
  }

  /**
   * @param {ModifyOp<any>} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $modifyOp.check(other) &&
      this.value[equalityTrait.EqualityTraitSymbol](other.value) &&
      (
        (object.isEmpty(this.format) && object.isEmpty(other.format)) || fun.equalityDeep(this.format, other.format)
      ) &&
      fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @param {number} [_start] ignored (a modify is atomic); accepted for a uniform children-op signature.
   * @param {number} [_end] ignored.
   * @param {boolean} [markAsDone] freeze the cloned value (default); `false` shares it mutable — see
   * {@link InsertOp#clone}. The op itself is still a fresh node; only its `value` is consumed.
   * @return {ModifyOp<DTypes>}
   */
  clone (_start = 0, _end = 1, markAsDone = true) {
    return new ModifyOp(/** @type {DTypes} */ (markAsDone ? this.value.done() : this.value), _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * @template {any} [V=any]
 * @template {string|number} [K=any]
 * @internal not part of the consumer API — an attribute op; build deltas via {@link create}/{@link DeltaBuilder}.
 */
export class SetAttrOp {
  /**
   * @param {K} key
   * @param {V} value
   * @param {V|undefined} prevValue
   * @param {Attribution?} attribution
   */
  constructor (key, value, prevValue, attribution) {
    /**
     * @readonly
     * @type {K}
     */
    this.key = key
    /**
     * @readonly
     * @type {V}
     */
    this.value = value
    /**
     * @readonly
     * @type {V|undefined}
     */
    this.prevValue = prevValue
    /**
     * @readonly
     * @type {Attribution?}
     */
    this.attribution = attribution
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @return {'insert'}
   */
  get type () { return 'insert' }

  /**
   * @type {DeltaBuilderAny}
   */
  get _modValue () {
    return modValue(this)
  }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 5) // map insert type: 5
      encoding.writeAny(encoder, this.key)
      if ($deltaAny.check(this.value)) {
        encoding.writeUint8(encoder, 0)
        encoding.writeVarString(encoder, this.value.fingerprint)
      } else {
        encoding.writeUint8(encoder, 1)
        encoding.writeAny(encoder, /** @type {any} */ (this.value))
      }
      encoding.writeAny(encoder, this.attribution)
    })))
  }

  toJSON () {
    const v = this.value
    const attribution = this.attribution
    return object.assign(
      {
        type: this.type,
        value: $deltaAny.check(v) ? v.toJSON() : v
      },
      attribution != null ? { attribution } : {}
    )
  }

  /**
   * @param {SetAttrOp<V>} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $setAttrOp.check(other) && this.key === other.key && fun.equalityDeep(this.value, other.value) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * Full (frozen) clone. A `move` apply reuses the source op instead of cloning, so there is no
   * shared-mutable variant — see {@link DeltaBuilder#apply}.
   *
   * @return {SetAttrOp<V,K>}
   */
  clone () {
    return new SetAttrOp(this.key, _markMaybeDeltaAsDone(this.value), _markMaybeDeltaAsDone(this.prevValue), _cloneAttrs(this.attribution))
  }
}

/**
 * @template [V=any]
 * @template {string|number} [K=string|number]
 * @internal not part of the consumer API — an attribute op; build deltas via {@link create}/{@link DeltaBuilder}.
 */
export class DeleteAttrOp {
  /**
   * @param {K} key
   * @param {V|undefined} prevValue
   * @param {Attribution?} attribution
   */
  constructor (key, prevValue, attribution) {
    /**
     * @type {K}
     */
    this.key = key
    /**
     * @type {V|undefined}
     */
    this.prevValue = prevValue
    this.attribution = attribution
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @type {'delete'}
   */
  get type () { return 'delete' }

  get value () { return undefined }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 6) // map delete type: 6
      encoding.writeAny(encoder, this.key)
      encoding.writeAny(encoder, this.attribution)
    })))
  }

  /**
   * @return {DeltaAttrOpJSON}
   */
  toJSON () {
    const {
      type, attribution
    } = this
    return object.assign(
      { type },
      attribution != null ? { attribution } : {}
    )
  }

  /**
   * @param {DeleteAttrOp<V>} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $deleteAttrOp.check(other) && this.key === other.key && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * Full (frozen) clone; a `move` apply reuses the source op instead — see {@link DeltaBuilder#apply}.
   *
   * @return {DeleteAttrOp<V,K>}
   */
  clone () {
    return new DeleteAttrOp(this.key, _markMaybeDeltaAsDone(this.prevValue), _cloneAttrs(this.attribution))
  }
}

/**
 * @template {DeltaAny} [Modifier=DeltaAny]
 * @template {string|number} [K=string]
 * @internal not part of the consumer API — an attribute op; build deltas via {@link create}/{@link DeltaBuilder}.
 */
export class ModifyAttrOp {
  /**
   * @param {K} key
   * @param {Modifier} delta
   * @param {Attribution|null|undefined} attribution tri-state: `undefined` skip / `null` clear / object merge
   */
  constructor (key, delta, attribution) {
    /**
     * @readonly
     * @type {K}
     */
    this.key = key
    /**
     * @readonly
     * @type {Modifier}
     */
    this.value = delta
    /**
     * @readonly
     * @type {Attribution|null|undefined}
     */
    this.attribution = attribution
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @type {'modify'}
   */
  get type () { return 'modify' }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 7) // map modify type: 7
      encoding.writeAny(encoder, this.key)
      encoding.writeVarString(encoder, this.value.fingerprint)
      encoding.writeAny(encoder, this.attribution)
    })))
  }

  /**
   * @return {DeltaBuilder}
   */
  get _modValue () {
    return modValue(this)
  }

  /**
   * @return {DeltaAttrOpJSON}
   */
  toJSON () {
    const attribution = this.attribution
    return object.assign(
      {
        type: this.type,
        value: this.value.toJSON()
      },
      // modifyAttr applies its attribution as an instruction: emit `null` (clear) distinctly from skip
      attribution !== undefined ? { attribution } : {}
    )
  }

  /**
   * @param {ModifyAttrOp<Modifier>} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $modifyAttrOp.check(other) && this.key === other.key && this.value[equalityTrait.EqualityTraitSymbol](other.value) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * Full (frozen) clone; a `move` apply reuses the source op instead — see {@link DeltaBuilder#apply}.
   *
   * @return {ModifyAttrOp<Modifier,K>}
   */
  clone () {
    return new ModifyAttrOp(this.key, /** @type {Modifier} */ (this.value.done()), _cloneAttrs(this.attribution))
  }
}

export const $insertOp = /** @type {s.Schema<InsertOp<any>>} */ (InsertOp.prototype.$type = /** @type {s.Schema<InsertOp<any>>} */ (s.$type('d:insertOp', InsertOp)))
export const $modifyOp = ModifyOp.prototype.$type = s.$type('d:modifyOp', ModifyOp)
export const $textOp = TextOp.prototype.$type = s.$type('d:textOp', TextOp)
export const $deleteOp = /** @type {s.Schema<DeleteOp<any>>} */ (DeleteOp.prototype.$type = s.$type('d:deleteOp', DeleteOp))
export const $retainOp = RetainOp.prototype.$type = s.$type('d:retainOp', RetainOp)
export const $anyOp = s.$union($insertOp, $deleteOp, $textOp, $modifyOp)

export const $setAttrOp = /** @type {s.Schema<SetAttrOp<any>>} */ (SetAttrOp.prototype.$type =/** @type {s.Schema<SetAttrOp<any>>} */ (s.$type('d:setAttrOp', SetAttrOp)))
export const $modifyAttrOp = /** @type {s.Schema<ModifyAttrOp<any>>} */ (ModifyAttrOp.prototype.$type = /** @type {s.Schema<ModifyAttrOp<any>>} */ (s.$type('d:modifyAttrOp', ModifyAttrOp)))
export const $deleteAttrOp = /** @type {s.Schema<DeleteAttrOp<any>>} */ (DeleteAttrOp.prototype.$type = /** @type {s.Schema<DeleteAttrOp<any>>} */ (s.$type('d:deleteAttrOp', DeleteAttrOp)))
export const $anyAttrOp = s.$union($setAttrOp, $deleteAttrOp, $modifyAttrOp)

/**
 * @template {fingerprintTrait.Fingerprintable} Content
 * @param {s.Schema<Content>} $content
 * @return {s.Schema<SetAttrOp<Content>>}
 */
export const $setAttrOpWith = $content => s.$custom(o => $setAttrOp.check(o) && $content.check(o.value))

/**
 * @template {fingerprintTrait.Fingerprintable} Content
 * @param {s.Schema<Content>} $content
 * @return {s.Schema<InsertOp<Content>>}
 */
export const $insertOpWith = $content => s.$custom(o => $insertOp.check(o) && o.insert.every(ins => $content.check(ins)))

/**
 * @template {DeltaAny} Modify
 * @param {s.Schema<Modify>} $content
 * @return {s.Schema<ModifyOp<Modify>>}
 */
export const $modifyOpWith = $content => s.$custom(o => $modifyOp.check(o) && $content.check(o.value))

/**
 * @template {DeltaAny} Modify
 * @param {s.Schema<Modify>} $content
 * @return {s.Schema<ModifyAttrOp<Modify>>}
 */
export const $modifyAttrOpWith = $content => s.$custom(o => $modifyAttrOp.check(o) && $content.check(/** @type {ModifyAttrOp<Modify>} */ (o).value))

/**
 * @template {{[Key in string|number]: any}} Attrs
 * @template {string|number} Key
 * @template {any} Val
 * @typedef {{ [K in (Key | keyof Attrs)]: (unknown extends Attrs[K] ? never : Attrs[K]) | (Key extends K ? Val : never) } & {}} AddToAttrs
 */

/**
 * @template {{[Key in string|number|symbol]: any}} Attrs
 * @template {{[Key in string|number|symbol]: any}} NewAttrs
 * @typedef {{ [K in (keyof NewAttrs | keyof Attrs)]: (unknown extends Attrs[K] ? never : Attrs[K]) | (unknown extends NewAttrs[K] ? never : NewAttrs[K]) }} MergeAttrs
 */

/**
 * A cursor/selection anchor stored inside a delta tree (see {@link import('./position.js').marksToPositions}).
 *
 * - `key` — the *terminal* step of the position: a content offset (number) or an attribute key
 *   (string) within the node that holds the mark.
 * - `id` — a unique, user-defined identifier.
 * - `assoc` — the gravity at a boundary (left `-1` / right `1`).
 * - `attrs` — optional user-supplied data carried with the mark **by reference**: the same
 *   object is shared across the mark, its `copy`/`clone`s, `toJSON`, and every `MarkPos` from
 *   `marksToPositions`, so the caller must treat it as immutable (do not mutate it after attaching).
 *
 * A `Mark` is **immutable** — never mutate one in place; to "move" a mark, replace it with a fresh
 * `Mark` via {@link Mark#copy} (the {@link Marks} set keys by id, so re-adding the same id replaces
 * it). Immutability lets a `Mark` be shared freely across a delta and its clones. The class is not
 * exported — construct via {@link createMark} and validate via {@link $mark}.
 */
class Mark {
  /**
   * @param {number|string} key
   * @param {string} [id] unique id; defaults to a fresh GUID
   * @param {1|-1} [assoc] gravity at a boundary; defaults to right (`1`)
   * @param {object?} [attrs] optional user data, stored by reference; treat as immutable
   */
  constructor (key, id = rand.uuidv4(), assoc = 1, attrs = null) {
    /**
     * @readonly
     * @type {number|string}
     */
    this.key = key
    /**
     * @readonly
     * @type {string}
     */
    this.id = id
    /**
     * @readonly
     * @type {1|-1}
     */
    this.assoc = assoc
    /**
     * @readonly
     * @type {object?}
     */
    this.attrs = attrs
  }

  /**
   * A copy of this mark, optionally at a different `key` (used to "move" an otherwise-immutable mark).
   *
   * @param {number|string} [key]
   * @return {Mark}
   */
  copy (key = this.key) {
    return new Mark(key, this.id, this.assoc, this.attrs)
  }

  /**
   * @return {MarkJSON}
   */
  toJSON () {
    return this.attrs === null
      ? { id: this.id, key: this.key, assoc: this.assoc }
      : { id: this.id, key: this.key, assoc: this.assoc, attrs: this.attrs }
  }

  /**
   * @param {Mark} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $mark.check(other) && this.id === other.id && this.key === other.key && this.assoc === other.assoc && fun.equalityDeep(this.attrs, other.attrs)
  }
}

export const $mark = /** @type {s.Schema<Mark>} */ (Mark.prototype.$type = s.$type('d:mark', Mark))

/**
 * Create a {@link Mark} (use this instead of `new Mark(...)`). `id` defaults to a fresh GUID, `assoc`
 * to right gravity (`1`), `attrs` to `null`. A `Mark` is stored on a delta node's own
 * {@link Marks} set (see {@link DeltaBuilder#addMark}).
 *
 * @param {number|string} key
 * @param {string} [id]
 * @param {1|-1} [assoc]
 * @param {object?} [attrs]
 * @return {Mark}
 */
export const createMark = (key, id, assoc, attrs) => new Mark(key, id, assoc, attrs)

/**
 * @typedef {Delta<any>} DeltaAny
 */

/**
 * @typedef {DeltaBuilder<any>} DeltaBuilderAny
 */

/**
 * @typedef {object} DeltaConf
 * @property {string} [DeltaConf.name]
 * @property {fingerprintTrait.Fingerprintable} [DeltaConf.children=never]
 * @property {boolean} [DeltaConf.text=never]
 * @property {{[K:string|number]:fingerprintTrait.Fingerprintable}} [DeltaConf.attrs={}]
 * @property {boolean} [DeltaConf.recursiveChildren=false]
 * @property {boolean} [DeltaConf.recursiveAttrs=false]
 */

/**
 * Coerce a computed conf to provably satisfy the `DeltaConf` constraint. Declaration emit re-checks
 * type arguments eagerly, so a deeply-computed conf (mapped/recursive) passed to `Delta<…>` /
 * `Transformer<…>` must be wrapped here: the conditional exposes `DeltaConf` as its upper bound,
 * letting the constraint resolve without forcing TS to expand the (self-referential) body.
 *
 * @template T
 * @typedef {T extends infer DC extends DeltaConf ? DC : never} AsDeltaConf
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {Conf extends {name:infer Name} ? (unknown extends Name ? any : (Exclude<Name,undefined>)) : any} DeltaConfGetName
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {(Conf extends {children:infer Children} ? (unknown extends Children ? any : Children) : never) | (Conf extends {recursiveChildren:true} ? Delta<Conf> : never)} DeltaConfGetChildren
 */

/**
 * @template {DeltaConf} Conf
 * @template {boolean} FixedConf
 * @typedef {FixedConf extends true ? DeltaConfGetChildren<Conf> : any } DeltaConfGetAllowedChildren
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {0 extends (1 & Conf) ? string : (Conf extends {text:true} ? string : never)} DeltaConfGetText
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {import('../ts.js').TypeIsAny<Conf, {[K:string|number]:any}, (Conf extends {attrs:infer Attrs} ? (Attrs extends undefined ? {} : Attrs) : {})>} DeltaConfGetAttrs
 */

/**
 * @template {DeltaConf} Conf
 * @template {boolean} FixedConf
 * @typedef {FixedConf extends true ? DeltaConfGetAttrs<Conf> : {[K:string|number]:any}} DeltaConfGetAllowedAttrs
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {Conf extends {recursiveChildren:true} ? true : false} DeltaConfGetRecursiveChildren
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {Conf extends {recursiveAttrs:true} ? true : false} DeltaConfigGetRecursiveAttrs
 */

/**
 * Transform Delta(Builder) to a normal delta.
 *
 * @template V
 * @typedef {V extends never ? never : (import('../ts.js').TypeIsAny<V,any,V extends Delta<infer Conf> ? Delta<Conf> : V>)} _SanifyDelta
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {import('../ts.js').Prettify<{[K in keyof Conf]: K extends 'attrs' ? import('../ts.js').Prettify<{ [KA in keyof Conf[K]]: _SanifyDelta<Conf[K][KA]> },1> : (K extends 'children' ? _SanifyDelta<Conf[K]> : Conf[K]) }, 1>} PrettifyDeltaConf
 */

/**
 * @template {DeltaConf} D1
 * @template D2
 * @typedef {(import('../ts.js').TypeIsAny<D1, any, PrettifyDeltaConf<{[K in (keyof D1|keyof D2)]: K extends keyof D2 ? D2[K] : (K extends keyof D1 ? D1[K] : never)}>> & {}) extends infer DC extends DeltaConf ? DC : never} DeltaConfOverwrite
 */

/**
 * @template {string} Name
 * @template {{[K in string|number]:any}} Attrs
 * @template Children
 * @template {boolean} Text
 */
class DeltaData {
  /**
   * @param {string?} name
   * @param {s.Schema<Delta<any>>?} $schema
   */
  constructor (name, $schema) {
    this.name = /** @type {Name} */ (name)
    this.$schema = $schema
    /**
     * @type {{ [K in keyof Attrs]?: K extends string|number ? (SetAttrOp<Attrs[K],K>|DeleteAttrOp<Attrs[K],K>|(Attrs[K] extends never ? never : (Attrs[K] extends Delta ? ModifyAttrOp<Extract<Attrs[K],Delta>,K> : never))) : never }
     *       & { [Symbol.iterator]: () => Iterator<{ [K in keyof Attrs]: K extends string|number ? (SetAttrOp<Attrs[K],K>|DeleteAttrOp<Attrs[K],K>|(Attrs[K] extends never ? never : (Delta extends Attrs[K] ? ModifyAttrOp<Extract<Attrs[K],Delta>,K> : never))) : never }[keyof Attrs]> }
     * }
     */
    this.attrs = /** @type {any} */ ({
      * [Symbol.iterator] () {
        for (const k in this) {
          yield this[k]
        }
      }
    })

    /**
     * @type {list.List<
     *   | (Text extends true ? (RetainOp|TextOp|DeleteOp<any>) : never)
     *   | (RetainOp|InsertOp<Children>|DeleteOp<any>|(Delta extends Children ? ModifyOp<Extract<Children,Delta>> : never))
     * >}
     */
    this.children = /** @type {any} */ (list.create())
    /**
     * All child-ops sizes combined. Note that delete-ops also have a length
     */
    this.childCnt = 0
    /**
     * @type {any}
     */
    this.origin = null
    /**
     * @type {string|null}
     */
    this._fingerprint = null
    this.isDone = false
    /**
     * Is the final document and does not contain delete, modify, or retain ops.
     */
    this.isFinal = false
    /**
     * Leaf {@link Mark marks} whose cursor sits in THIS node (in a settled delta), or the marks to ADD
     * to the target node (in a change delta). Local/ephemeral cursor state — NOT part of the document
     * fingerprint or equality. `null` when there are none. See {@link Marks}.
     *
     * @type {Marks?}
     */
    this.marks = null
    /**
     * Mark ids to DELETE (tombstones). Only present in a (non-settled) change delta — like a
     * `DeleteAttrOp`, a deletion is dropped from a final delta (a materialized document carries none, at
     * any depth). `null` when there are none. Marks follow *last-writer-wins*, treating each op as an
     * absolute per-id assignment (present vs absent): adding a mark cancels a pending delete of the same
     * id ({@link addMarkTo}) and a delete cancels a present add ({@link deleteMarkTo}), so a node never
     * holds both an add and a delete for one id. {@link deleteMarkTo} is the sole writer of this set
     * (and `addMarkTo`'s mirror); see {@link applyMarkOps}.
     *
     * @type {Set<string>?}
     */
    this.deleteMarks = null
    /**
     * Conservative "this subtree might hold a {@link Mark}" flag (own {@link DeltaData#marks} or any
     * descendant's). Set `true` when a mark is introduced and OR-propagated up to every ancestor; it is
     * **never** decremented (removal leaves it conservatively `true`). {@link
     * import('./position.js').marksToPositions} is the sole resetter: it prunes subtrees where this is
     * `false` (a guaranteed-empty subtree) and lazily clears a stale `true` to `false` when a descended
     * subtree turns out to hold none. `false` therefore *guarantees* no marks; `true` only *maybe*.
     */
    this.maybeHasMarks = false
  }
}

/**
 * @template {DeltaConf} [Conf={}]
 * @extends {DeltaData<
 *   DeltaConfGetName<Conf>,
 *   DeltaConfGetAttrs<Conf>,
 *   DeltaConfGetChildren<Conf>,
 *   Conf extends {text:true} ? true : false
 * >}
 */
export class Delta extends DeltaData {
  /**
   * @type {string}
   */
  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(rabin.fingerprint(rabin.StandardIrreducible32, encoding.encode(encoder => {
      encoding.writeUint32(encoder, 0xf2ae5680) // "magic number" that ensures that different types of content don't yield the same fingerprint
      encoding.writeAny(encoder, this.name)
      /**
       * @type {Array<number|string>}
       */
      const keys = []
      for (const attr of this.attrs) {
        keys.push(attr.key)
      }
      keys.sort((a, b) => {
        const aIsString = s.$string.check(a)
        const bIsString = s.$string.check(b)
        // numbers first
        // in ascending order
        return (aIsString && bIsString)
          ? a.localeCompare(b)
          : (aIsString ? 1 : (bIsString ? -1 : (a - b)))
      })
      encoding.writeVarUint(encoder, keys.length)
      for (const key of keys) {
        encoding.writeVarString(encoder, /** @type {any} */ (this.attrs[/** @type {keyof Attrs} */ (key)]).fingerprint)
      }
      encoding.writeVarUint(encoder, this.children.len)
      for (const child of this.children) {
        encoding.writeVarString(encoder, child.fingerprint)
      }
    }))))
  }

  [fingerprintTrait.FingerprintTraitSymbol] () {
    return this.fingerprint
  }

  isEmpty () {
    return object.isEmpty(this.attrs) && list.isEmpty(this.children) && (this.marks === null || this.marks.size === 0) && (this.deleteMarks === null || this.deleteMarks.size === 0)
  }

  /**
   * @return {DeltaJSON}
   */
  toJSON () {
    const name = this.name
    /**
     * @type {any}
     */
    const attrs = {}
    /**
     * @type {any}
     */
    const children = []
    for (const attr of this.attrs) {
      attrs[attr.key] = attr.toJSON()
    }
    this.children.forEach(val => {
      children.push(val.toJSON())
    })
    return object.assign(
      { type: /** @type {'delta'} */ ('delta') },
      (name != null ? { name } : {}),
      (object.isEmpty(attrs) ? {} : { attrs }),
      (children.length > 0 ? { children } : {}),
      (this.marks !== null && this.marks.size > 0 ? { marks: [...this.marks].sort(compareMarksById).map(m => m.toJSON()) } : {}),
      (this.deleteMarks !== null && this.deleteMarks.size > 0 ? { deleteMarks: [...this.deleteMarks].sort() } : {})
    )
  }

  /**
   * @param {Delta<any>} other
   * @return {boolean}
   */
  equals (other) {
    return this[equalityTrait.EqualityTraitSymbol](other)
  }

  /**
   * @param {any} other
   * @return {boolean}
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    // @todo it is only necessary to compare finrerprints OR do a deep equality check (remove
    // childCnt as well)
    // marks are local/ephemeral cursor state and intentionally NOT part of document identity
    return this.name === other.name && fun.equalityDeep(this.attrs, other.attrs) && fun.equalityDeep(this.children, other.children) && this.childCnt === other.childCnt
  }

  // toString () {
  //   /**
  //    * @type {Array<[string|number,string]>}
  //    */
  //   const attrs = []
  //   for (const attr of this.attrs) {
  //     attrs.push([attr.key, $deleteAttrOp.check(attr) ? 'delete' : attr.type + ' ' + (attr.value?.toString() ?? attr.value)])
  //   }
  //   attrs.sort((a, b) => a[0].toString() < b[0].toString() ? -1 : 1)
  //   const attrsString = attrs.map(attr => `${attr[0]} = ${attr[1]}`).join(', ')
  //   if (this.childCnt === 0) return `<${this.name ?? ''} ${attrsString}/>`
  //   this.children.toArray() drnt
  //   return '<>'
  // }
  //
  /**
   * Mark this delta as done and perform some cleanup (e.g. remove appended retains without
   * formats&attributions). In the future, there might be additional merge operations that can be
   * performed to result in smaller deltas. Set `markAsDone=false` to only perform the cleanup.
   *
   * @return {Delta<Conf>}
   */
  done (markAsDone = true) {
    if (!this.isDone) {
      this.isDone = markAsDone
      const cs = this.children
      for (let end = cs.end; end !== null && $retainOp.check(end) && end.format === undefined && end.attribution === undefined; end = cs.end) {
        this.childCnt -= end.length
        list.popEnd(cs)
      }
    }
    return this
  }
}

/**
 * @template {DeltaConf} Conf
 * @param {Delta<Conf>} d
 * @param {number} start
 * @param {number} end
 * @param {ChildrenOpAny?} currNode - start slicing at this node (instead of d.children.start)
 * @return {DeltaBuilder<Conf>}
 */
export const slice = (d, start = 0, end = d.childCnt, currNode = d.children.start) => {
  const cpy = /** @type {DeltaAny} */ (new DeltaBuilder(d.name, d.$schema))
  cpy.origin = d.origin
  const sliceStart = start // `start` is mutated by the walk below; keep the original for clamping marks
  // copy attrs
  for (const op of d.attrs) {
    // @ts-ignore
    cpy.attrs[op.key] = /** @type {any} */ (op.clone())
  }
  // copy children
  const slicedLen = end - start
  let remainingLen = slicedLen
  let currNodeOffset = 0
  while (start > 0 && currNode != null) {
    if (currNode.length <= start) {
      start -= currNode.length
      currNode = currNode.next
    } else {
      currNodeOffset = start
      start = 0
    }
  }
  if (currNodeOffset > 0 && currNode) {
    const ncpy = currNode.clone(currNodeOffset, currNodeOffset + math.min(remainingLen, currNode.length - currNodeOffset))
    list.pushEnd(cpy.children, ncpy)
    remainingLen -= ncpy.length
    currNode = currNode.next
  }
  while (currNode != null && currNode.length <= remainingLen) {
    list.pushEnd(cpy.children, currNode.clone())
    remainingLen -= currNode.length
    currNode = currNode.next
  }
  if (currNode != null && remainingLen > 0) {
    list.pushEnd(cpy.children, currNode.clone(0, remainingLen))
    remainingLen -= math.min(currNode.length, remainingLen)
  }
  cpy.childCnt = slicedLen - remainingLen
  // copy marks (only if the subtree maybe has any). A full clone (the `clone` path) copies this node's
  // own marks verbatim — a change delta's number-keyed root marks point into the TARGET's coordinate
  // and may sit beyond the change's own (often empty) content, so they must not be clamped. A genuine
  // partial slice instead clamps number-keyed marks to the sliced range (rebasing `key -= start`).
  // String/attr marks ride with the copied attrs; child marks ride on the cloned children. The
  // `maybeHasMarks` flag is copied (conservative); a change-only deleteMarks list is copied wholesale.
  if (d.maybeHasMarks) {
    if (d.marks !== null) {
      const fullCopy = sliceStart === 0 && end >= d.childCnt
      const cpyMarks = new Marks()
      for (const m of d.marks) {
        if (fullCopy || typeof m.key !== 'number') {
          cpyMarks.add(m)
        } else if (m.key >= sliceStart && m.key <= end) {
          cpyMarks.add(m.copy(m.key - sliceStart))
        }
      }
      if (cpyMarks.size > 0) cpy.marks = cpyMarks
    }
    cpy.maybeHasMarks = true
  }
  // a bulk copy of an already-disjoint source onto a fresh `cpy` (not a conflict-resolving write, so it
  // bypasses the deleteMarkTo/addMarkTo primitives): `d`'s marks/deleteMarks are disjoint by id, and
  // clamping only ever drops marks, so `cpy` stays disjoint
  if (d.deleteMarks !== null) cpy.deleteMarks = new Set(d.deleteMarks)
  // @ts-ignore
  return cpy
}

/**
 * @template {DeltaAny} D
 * @param {D} d
 * @return {D extends Delta<infer Conf> ? DeltaBuilder<Conf> : never}
 */
export const clone = d => /** @type {any} */ (slice(d, 0, d.childCnt))

/**
 * A *shallow* clone of `d`: a fresh {@link DeltaBuilder} carrying `d`'s name, attribute ops, and own
 * (root) marks — but **no children**. Content-transforming
 * {@link import('./transformer/core.js').Transformer transformers} (e.g. `children`, `value`) rebuild
 * the child list themselves yet must keep this node's own marks; the marks of nested children ride
 * along on the children the caller rebuilds. The `maybeHasMarks` flag is copied from `d` (conservative)
 * and the builder OR-propagates the flag as the caller appends children. Because mark-carrying lives
 * here in the shared primitive, a transformer that builds its output via {@link cloneShallow} cannot
 * silently drop the node's marks.
 *
 * @template {DeltaAny} D
 * @param {D} d
 * @return {D extends Delta<infer Conf> ? DeltaBuilder<Conf> : never}
 * @internal transformer plumbing — drops children; consumers use {@link clone}.
 */
export const cloneShallow = d => {
  const cpy = /** @type {DeltaAny} */ (new DeltaBuilder(d.name, d.$schema))
  cpy.origin = d.origin
  for (const op of d.attrs) {
    // @ts-ignore (dynamic attr key — the same limitation slice suppresses when copying attrs)
    cpy.attrs[op.key] = /** @type {any} */ (op.clone())
  }
  // root marks / deleteMarks (a delete-mark-only change has no marks but must still ride); `cpy` is
  // fresh, so merging onto it is a plain copy
  if (d.marks !== null || d.deleteMarks !== null) mergeRootMarks(cpy, d)
  // carry the conservative flag (covers attr-value marks even when this node has no root marks of its
  // own); the builder OR-propagates it further as the caller appends the rebuilt children
  cpy.maybeHasMarks = d.maybeHasMarks
  // @ts-ignore
  return cpy
}

/**
 * Make an op's modify `value` mutable for in-place editing: clear the op's cached fingerprint and, when
 * the value is a `done` delta, replace it with a mutable clone. Shared by the `_modValue` getters of
 * {@link ModifyOp}, {@link ModifyAttrOp}, and {@link SetAttrOp}; the `$deltaAny` guard lets a scalar
 * `SetAttrOp` value pass through untouched.
 *
 * @param {{ value: any, _fingerprint: string|null }} op
 * @return {any}
 */
const modValue = op => {
  op._fingerprint = null
  const v = op.value
  if ($deltaAny.check(v) && v.isDone) op.value = clone(v)
  return op.value
}

/*
 * --- @internal low-level mutation API for a delta's children list ---
 *
 * These are the ONLY sanctioned way to structurally edit `d.children` in place. Each keeps the cached
 * invariant `d.childCnt === Σ op.length` correct and resets the op's `_fingerprint`. Never mutate
 * `op.retain` / `op.delete` / `op.insert`, call `list.*`, or touch `d.childCnt` directly from outside
 * delta.js — go through these so the count (which `EqualityTraitSymbol` compares) never drifts.
 *
 * Cursor pattern (used by {@link DeltaBuilder#apply}, {@link DeltaBuilder#rebase}, and
 * `transformer/conform.js`): walk the target with `(op, offset)`; {@link _splitChildAt} before inserting
 * in the middle of an op so the cursor sits on a boundary; {@link _mergeChildWithPrev} after edits to
 * coalesce adjacent same-kind runs. `_growRun` / `_spliceInsert` extend an existing run *without* a split,
 * which keeps same-kind insertion (e.g. typing into a pass-through run) non-fragmenting.
 */

/**
 * Coalesce `op` into its previous sibling when they are the same kind with equal format/attribution,
 * removing `op`. `d.childCnt` is unchanged (the length moves to the previous op). Returns `true` when it
 * merged — so a caller holding a cursor on `op` can move it onto the surviving previous op.
 *
 * @param {DeltaBuilderAny} d
 * @param {InsertOp<any>|RetainOp|DeleteOp<any>|TextOp|ModifyOp<any>} op
 * @return {boolean}
 */
export const _mergeChildWithPrev = (d, op) => {
  const prevOp = op.prev
  if (
    prevOp?.constructor !== op.constructor ||
    $modifyOp.check(op) ||
    (
      !$deleteOp.check(op) && (
        !fun.equalityDeep(op.format, /** @type {InsertOp<any>} */ (prevOp).format) ||
        !fun.equalityDeep(op.attribution, /** @type {InsertOp<any>} */ (prevOp).attribution)
      )
    )
  ) {
    // constructor mismatch or format/attribution mismatch
    return false
  }
  // can be merged
  if ($insertOp.check(op)) {
    /** @type {InsertOp<any>} */ (prevOp).insert.push(...op.insert)
  } else if ($retainOp.check(op)) {
    // @ts-ignore
    /** @type {RetainOp} */ (prevOp).retain += op.retain
  } else if ($deleteOp.check(op)) {
    /** @type {DeleteOp<any>} */ (prevOp).delete += op.delete
  } else if ($textOp.check(op)) {
    /** @type {TextOp} */ (prevOp)._updateInsert(/** @type {TextOp} */ (prevOp).insert + op.insert)
  /* c8 ignore start */
  } else {
    // unreachable: the constructor check at the top of the function already
    // limits `op` to one of the four kinds tested above
    error.unexpectedCase()
  }
  /* c8 ignore stop */
  list.remove(d.children, op)
  return true
}

/**
 * Split `op` at `offset`, leaving `op` = `[0, offset)` and a fresh right node `[offset, op.length)`
 * inserted immediately after it; returns the right node. `d.childCnt` is unchanged (net-zero). The clone
 * uses `markAsDone=false` because the right node is `_splice`d out of `op` here, so it is the sole owner.
 * Caller guarantees `0 < offset < op.length`.
 *
 * @param {DeltaBuilderAny} d
 * @param {ChildrenOpAny} op
 * @param {number} offset
 * @return {ChildrenOpAny}
 */
export const _splitChildAt = (d, op, offset) => {
  const right = /** @type {ChildrenOpAny} */ (op.clone(offset, op.length, false))
  op._splice(offset, op.length - offset)
  list.insertBetween(d.children, op, op.next || null, right)
  return right
}

/**
 * Insert `op` into `d.children` immediately before `ref` (or push at the end when `ref == null`);
 * `d.childCnt += op.length`. Does not coalesce — call {@link _mergeChildWithPrev} afterwards if needed.
 *
 * @param {DeltaBuilderAny} d
 * @param {ChildrenOpAny?} ref
 * @param {ChildrenOpAny} op
 * @return {ChildrenOpAny}
 */
export const _insertChild = (d, ref, op) => {
  list.insertBetween(d.children, ref == null ? d.children.end : ref.prev, ref, op)
  d.childCnt += op.length
  return op
}

/**
 * Remove child `op` entirely; `d.childCnt -= op.length`.
 *
 * @param {DeltaBuilderAny} d
 * @param {ChildrenOpAny} op
 */
export const _removeChild = (d, op) => {
  d.childCnt -= op.length
  list.remove(d.children, op)
}

/**
 * Drop `len` positions from `op` starting at `offset` (`op._splice`); `d.childCnt -= len`. Does not remove
 * an emptied op — the caller decides (call {@link _removeChild} when `op.length === 0`), because removal is
 * usually entangled with the caller's own cursor advance. Retain/Delete ignore `offset` (uniform runs);
 * Insert drops `insert[offset, offset+len)`.
 *
 * @param {DeltaBuilderAny} d
 * @param {ChildrenOpAny} op
 * @param {number} offset
 * @param {number} len
 */
export const _shrinkChild = (d, op, offset, len) => {
  op._splice(offset, len)
  d.childCnt -= len
}

/**
 * Grow a Retain or Delete run `op` by `n` positions in place (the invariant-safe form of `op.retain += n`);
 * `d.childCnt += n`. Use to extend an existing same-kind run without a split.
 *
 * @param {DeltaBuilderAny} d
 * @param {RetainOp|DeleteOp<any>} op
 * @param {number} n
 */
export const _growRun = (d, op, n) => {
  // reason: RetainOp.retain / DeleteOp.delete are @readonly for consumers; the @internal mutators grow them in place, just as _splice shrinks them
  // @ts-ignore
  if ($retainOp.check(op)) op.retain += n; else op.delete += n
  op._fingerprint = null
  d.childCnt += n
}

/**
 * Splice `elems` into an Insert run `op` at `offset` in place; `d.childCnt += elems.length`.
 *
 * @param {DeltaBuilderAny} d
 * @param {InsertOp<any>} op
 * @param {number} offset
 * @param {Array<any>} elems
 */
export const _spliceInsert = (d, op, offset, elems) => {
  op.insert.splice(offset, 0, ...elems)
  op._fingerprint = null
  d.childCnt += elems.length
}

/**
 * Ensures that the delta can be edited. clears _fingerprint cache.
 *
 * @param {DeltaBuilderAny} d
 */
const modDeltaCheck = d => {
  if (d.isDone) {
    /**
     * You tried to modify a delta after it has been marked as "done".
     */
    throw error.create("Readonly Delta can't be modified")
  }
  d._fingerprint = null
}

/**
 * @template {DeltaConf} [Conf={}]
 * @template {boolean} [FixedConf=false]
 * @extends {Delta<Conf>}
 */
export class DeltaBuilder extends Delta {
  /**
   * @param {string?} name
   * @param {s.Schema<Delta<Conf>>?} $schema
   */
  constructor (name, $schema) {
    super(name, $schema)
    // @todo rename to usedFormats !!
    /**
     * @type {FormattingAttributes?}
     */
    this.usedAttributes = null
    /**
     * @type {Attribution?}
     */
    this.usedAttribution = null
  }

  /**
   * @param {Attribution?} attribution
   */
  useAttribution (attribution) {
    modDeltaCheck(this)
    this.usedAttribution = attribution
    return this
  }

  /**
   * @param {FormattingAttributes?} attributes
   * @return {this}
   */
  useAttributes (attributes) {
    modDeltaCheck(this)
    this.usedAttributes = attributes
    return this
  }

  /**
   * @param {string} name
   * @param {any} value
   */
  updateUsedAttributes (name, value) {
    modDeltaCheck(this)
    if (value == null) {
      this.usedAttributes = object.assign({}, this.usedAttributes)
      delete this.usedAttributes?.[name]
      if (object.isEmpty(this.usedAttributes)) {
        this.usedAttributes = null
      }
    } else if (!fun.equalityDeep(this.usedAttributes?.[name], value)) {
      this.usedAttributes = object.assign({}, this.usedAttributes)
      this.usedAttributes[name] = value
    }
    return this
  }

  /**
   * @template {keyof Attribution} NAME
   * @param {NAME} name
   * @param {Attribution[NAME]?} value
   */
  updateUsedAttribution (name, value) {
    modDeltaCheck(this)
    if (value == null) {
      this.usedAttribution = object.assign({}, this.usedAttribution)
      delete this.usedAttribution?.[name]
      if (object.isEmpty(this.usedAttribution)) {
        this.usedAttribution = null
      }
    } else if (!fun.equalityDeep(this.usedAttribution?.[name], value)) {
      this.usedAttribution = object.assign({}, this.usedAttribution)
      this.usedAttribution[name] = value
    }
    return this
  }

  /**
   * @template {(FixedConf extends true ? never : (Array<any>|string)) | (DeltaConfGetChildren<Conf> extends infer Children ? (Children extends never ? never : Array<Children>) : never) | DeltaConfGetText<Conf>} NewContent
   * @param {NewContent} insert
   * @param {FormattingAttributes?} [formatting]
   * @param {Attribution?} [attribution]
   * @return {DeltaBuilder<FixedConf extends true ? Conf : DeltaConfOverwrite<Conf,
   * (Exclude<NewContent,string> extends never ? {} : {
   *   children: Exclude<NewContent,string>[number]|DeltaConfGetChildren<Conf>
   * }) & (Extract<NewContent,string> extends never ? {} : { text: true })>, FixedConf>}
   */
  insert (insert, formatting, attribution) {
    modDeltaCheck(this)
    const mergedAttributes = combineData(this.usedAttributes, formatting, false)
    const mergedAttribution = combineData(this.usedAttribution, attribution, true)
    /**
     * @param {TextOp | InsertOp<any>} lastOp
     */
    const checkMergedEquals = lastOp => (mergedAttributes === lastOp.format || fun.equalityDeep(mergedAttributes, lastOp.format)) && (mergedAttribution === lastOp.attribution || fun.equalityDeep(mergedAttribution, lastOp.attribution))
    const end = this.children.end
    if (s.$string.check(insert)) {
      if ($textOp.check(end) && checkMergedEquals(end)) {
        end._updateInsert(end.insert + insert)
      } else if (insert.length > 0) {
        list.pushEnd(this.children, new TextOp(insert, mergedAttributes, mergedAttribution))
      }
      this.childCnt += insert.length
    } else if (arr.isArray(insert)) {
      if ($insertOp.check(end) && checkMergedEquals(end)) {
        // @ts-ignore
        end.insert.push(...insert)
        end._fingerprint = null
      } else if (insert.length > 0) {
        list.pushEnd(this.children, new InsertOp(insert.slice() /* ensures that we don't reuse an existing array */, mergedAttributes, mergedAttribution))
      }
      this.childCnt += insert.length
      // inserting pre-marked content brings its subtree marks along (as apply's insert path does)
      this.maybeHasMarks ||= elemsMaybeHaveMarks(insert)
    }
    return /** @type {any} */ (this)
  }

  /**
   * @template {Extract<DeltaConfGetAllowedChildren<Conf, FixedConf>,Delta|DeltaData<any,any,any,any>|DeltaBuilder>} NewContent
   * @param {NewContent} modify
   * @param {FormattingAttributes?} [formatting] tri-state: omit/`undefined` skip, `null` clear, `{k:v}`/`{k:null}` set/remove
   * @param {Attribution?} [attribution] tri-state: omit/`undefined` skip, `null` clear, `{k:v}`/`{k:null}` set/remove
   * @return {DeltaBuilder<DeltaConfOverwrite<Conf, {children: DeltaConfGetChildren<Conf>|NewContent}>, FixedConf>}
   */
  modify (modify, formatting, attribution) {
    modDeltaCheck(this)
    const mergedAttributes = combineInstr(this.usedAttributes, formatting, false)
    const mergedAttribution = combineInstr(this.usedAttribution, attribution, true)
    list.pushEnd(this.children, new ModifyOp(modify, mergedAttributes, mergedAttribution))
    this.childCnt += 1
    // the modify target carries marks in its subtree (own root marks + nested) - flag conservatively
    this.maybeHasMarks ||= modify.maybeHasMarks
    return /** @type {any} */ (this)
  }

  /**
   * Add a cursor/selection {@link Mark} at `pos` — a {@link import('./position.js').Pos}: a `path` of
   * content-index / attribute-key steps plus an `assoc` and optional immutable `attrs` (user data
   * carried with the mark). Returns `this` for chaining (like every other builder method). Pass an
   * explicit `id` to reference the mark later — re-adding the same `id` replaces it (e.g. to move a
   * cursor or update its `attrs`) and {@link DeltaBuilder#removeMark} deletes it; an anonymous one-shot
   * mark gets a fresh GUID otherwise.
   *
   * @param {import('./position.js').Pos} pos
   * @param {string} [id]
   * @return {this}
   */
  addMark (pos, id = rand.uuidv4()) {
    // apply with the default `final = this.isFinal` (do NOT force `{ final: true }`): a fresh change
    // builder is non-final so a sibling `removeMark` stays transmittable; a final doc collects nothing
    this.apply(/** @type {Delta<Conf>} */ (markChange(pos, id, false)))
    return this
  }

  /**
   * Remove the mark with `id`, located via `pos` (the position it was added at). On a settled document
   * that holds the mark this removes it in place; on a fresh/markless builder it records a transmittable
   * `deleteMarks` change (symmetric to {@link DeltaBuilder#addMark}), so
   * `delta.create().removeMark(pos, id)` yields the delete-mark change to apply / rebase / transmit.
   *
   * @param {import('./position.js').Pos} pos
   * @param {string} id
   * @return {this}
   */
  removeMark (pos, id) {
    // apply with the default `final = this.isFinal` (do NOT force `{ final: true }`): on a non-final
    // change builder this records a transmittable `deleteMarks`; on a final doc it only removes in place
    this.apply(/** @type {Delta<Conf>} */ (markChange(pos, id, true)))
    return this
  }

  /**
   * @param {number} len
   * @param {FormattingAttributes?} [format]
   * @param {Attribution?} [attribution]
   */
  retain (len, format, attribution) {
    modDeltaCheck(this) // this clears _fingerprint
    const mergedFormats = combineInstr(this.usedAttributes, format, false)
    const mergedAttribution = combineInstr(this.usedAttribution, attribution, true)
    const lastOp = /** @type {RetainOp|InsertOp<any>} */ (this.children.end)
    if ($retainOp.check(lastOp) && fun.equalityDeep(mergedFormats, lastOp.format) && fun.equalityDeep(mergedAttribution, lastOp.attribution)) {
      // @ts-ignore
      lastOp.retain += len
      lastOp._fingerprint = null
    } else if (len > 0) {
      list.pushEnd(this.children, new RetainOp(len, mergedFormats, mergedAttribution))
    }
    this.childCnt += len
    return this
  }

  /**
   * @param {number} len
   * @param {DeltaBuilder<any>|null} prevValue
   */
  delete (len, prevValue = null) {
    modDeltaCheck(this)
    const lastOp = /** @type {DeleteOp<any>|InsertOp<any>} */ (this.children.end)
    if ($deleteOp.check(lastOp) && typeof lastOp.prevValue === typeof prevValue) {
      lastOp.delete += len
      lastOp._fingerprint = null
      if (prevValue != null) {
        /** @type {DeltaBuilder<any>} */ (lastOp.prevValue).append(prevValue)
      }
    } else if (len > 0) {
      list.pushEnd(this.children, new DeleteOp(len, prevValue))
    }
    this.childCnt += len
    return this
  }

  /**
   * @template {Extract<keyof DeltaConfGetAllowedAttrs<Conf, FixedConf>,string|number>} Key
   * @template {DeltaConfGetAllowedAttrs<Conf, FixedConf>[Key]} Val
   * @param {Key} key
   * @param {Val} val
   * @param {Attribution?} [attribution] provenance for this attr (data: object or `null`/none)
   * @param {Val|undefined} [prevValue]
   * @return {DeltaBuilder<DeltaConfOverwrite<Conf,{attrs:AddToAttrs<DeltaConfGetAttrs<Conf>,Key,Val>}>, FixedConf>}
   */
  setAttr (key, val, attribution, prevValue) {
    modDeltaCheck(this)
    // @ts-ignore
    this.attrs[key] /** @type {any} */ =
      (new SetAttrOp(/** @type {any} */ (key), val, prevValue, combineData(this.usedAttribution, attribution, true)))
    // a delta-valued attribute carries marks in its subtree - flag conservatively (never decremented)
    if ($deltaAny.check(val)) this.maybeHasMarks ||= val.maybeHasMarks
    return /** @type {any} */ (this)
  }

  /**
   * @template {DeltaConfGetAllowedAttrs<Conf, FixedConf>} NewAttrs
   * @param {NewAttrs} attrs
   * @param {Attribution?} [attribution] provenance applied to each set attr (data: object or `null`/none)
   * @return {DeltaBuilder<DeltaConfOverwrite<
   *   Conf,
   *   { attrs: MergeAttrs<DeltaConfGetAttrs<Conf>,NewAttrs> }
   *   >, FixedConf>
   * }
   */
  setAttrs (attrs, attribution) {
    modDeltaCheck(this)
    for (const k in attrs) {
      this.setAttr(/** @type {any} */ (k), /** @type {any} */ (attrs)[/** @type {any} */ (k)], attribution)
    }
    return /** @type {any} */ (this)
  }

  /**
   * @template {Extract<keyof DeltaConfGetAllowedAttrs<Conf, FixedConf>,string|number>} Key
   * @param {Key} key
   * @param {Attribution?} [attribution] provenance for the deletion (data: object or `null`/none)
   * @param {any} [prevValue]
   * @return {DeltaBuilder<DeltaConfOverwrite<Conf, {
   *   attrs: AddToAttrs<DeltaConfGetAttrs<Conf>,Key,never>
   * }>, FixedConf>}
   */
  deleteAttr (key, attribution, prevValue) {
    modDeltaCheck(this)
    // dropping a delta-valued attribute drops its subtree's marks; the conservative `maybeHasMarks` flag
    // is left as-is (never decremented - marksToPositions self-corrects it)
    // @ts-ignore
    this.attrs[key] /** @type {any} */ =
      (new DeleteAttrOp(/** @type {any} */ (key), prevValue, combineData(this.usedAttribution, attribution, true)))
    return /** @type {any} */ (this)
  }

  /**
   * @template {DeltaConfGetAllowedAttrs<Conf, FixedConf> extends infer As ? { [K in keyof As]: Extract<As[K],DeltaAny> extends never ? never : K }[keyof As] : never} Key
   * @template {Extract<DeltaConfGetAllowedAttrs<Conf, FixedConf>[Key],DeltaAny>} D
   * @param {Key} key
   * @param {D} modify
   * @param {Attribution?} [attribution] tri-state instruction merged onto the target attr op: omit/`undefined` skip, `null` clear, `{k:v}`/`{k:null}` set/remove
   * @return {DeltaBuilder<DeltaConfOverwrite<Conf,{attrs:AddToAttrs<DeltaConfGetAttrs<Conf>,Key,D>}>, FixedConf>}
   */
  modifyAttr (key, modify, attribution) {
    modDeltaCheck(this)
    const mergedAttribution = combineInstr(this.usedAttribution, attribution, true)
    this.attrs[key] = /** @type {any} */ (new ModifyAttrOp(key, modify, mergedAttribution))
    // the modify value carries marks in its subtree - flag conservatively (never decremented)
    this.maybeHasMarks ||= /** @type {DeltaAny} */ (modify).maybeHasMarks
    return /** @type {any} */ (this)
  }

  /**
   * Apply other delta on this op. The result is the merged op of both of them.
   *
   * a.apply(b.apply(c))
   *
   * is equivalent to
   *
   * a.apply(b).apply(c)
   *
   * If `final = true`, we consider this delta the final state and drop deleteAttrOps from
   * attributes. (E.g. if `otherOp` deletes an attribute, this op will simply not have the
   * attribute). Any kind of `delete` op might be considered a bug. A final delta is not idempotent.
   *
   * @param {Delta<Conf>?} other
   * @param {{ final?: boolean, move?: boolean }} [opts] `move`: the caller donates `other` (it is not
   * read again), so its content is consumed (shared mutable) rather than frozen-cloned — see {@link
   * InsertOp#clone}. UNSAFE if the caller keeps using `other`.
   * @return {DeltaBuilder<Conf>}
   */
  apply (other, { final = this.isFinal, move = false } = {}) {
    if (other == null) return this
    modDeltaCheck(this)
    this.$schema?.expect(other)
    // `move`: the caller donates `other` (it must not be read again), so content is consumed (shared
    // mutable) instead of frozen-cloned — no `done()` and no re-clone on a later modify. UNSAFE if the
    // caller keeps using `other`. `!move` is the default everywhere (today's behavior).
    const keep = !move
    // apply attrs
    for (const op of other.attrs) {
      // @ts-ignore
      const c = /** @type {SetAttrOp<any,any>|DeleteAttrOp<any>|ModifyAttrOp<any,any>} */ (this.attrs[op.key])
      if ($modifyAttrOp.check(op)) {
        if ($deltaAny.check(c?.value)) {
          const tgt = c._modValue
          tgt.apply(op.value, { final, move })
          this.maybeHasMarks ||= tgt.maybeHasMarks // flag the attr subtree's marks up
          // modifyAttr carries a tri-state attribution update for the target attr op (merge/clear/skip)
          if (applyDim(c, 'attribution', op.attribution)) {
            /** @type {any} */ (c)._fingerprint = null
          }
        } else {
          // then this is a simple modify (the attribute did not previously hold a delta)
          // @ts-ignore
          this.attrs[op.key] = move ? op : op.clone()
          this.maybeHasMarks ||= op.value.maybeHasMarks // flag any marks the new modify value carries
        }
      } else if ($setAttrOp.check(op)) {
        const prev = c?.value
        // @ts-ignore
        op.prevValue = prev
        // a delta-valued attribute carries marks in its subtree - flag conservatively (never decremented)
        if ($deltaAny.check(op.value)) this.maybeHasMarks ||= op.value.maybeHasMarks
        // @ts-ignore
        this.attrs[op.key] = move ? op : op.clone()
      } else if ($deleteAttrOp.check(op)) {
        const prev = c?.value
        op.prevValue = prev
        // removing a delta-valued attribute drops its subtree's marks; the conservative `maybeHasMarks`
        // flag is left as-is (never decremented - marksToPositions self-corrects it)
        if (final) {
          // @ts-ignore
          delete this.attrs[op.key]
        } else {
          // @ts-ignore
          this.attrs[op.key] = move ? op : op.clone()
        }
      }
    }
    // apply children
    /**
     * @type {ChildrenOpAny?}
     */
    let opsI = this.children.start
    if ($deleteOp.check(opsI)) {
      opsI = opNextUndeleted(opsI)
    }
    let offset = 0
    /**
     * At the end, we will try to merge this op, and op.next op with their respective previous op.
     *
     * Hence, anytime an op is cloned, deleted, or inserted (anytime list.* api is used) we must add
     * an op to maybeMergeable.
     *
     * @type {Array<InsertOp<any>|RetainOp|DeleteOp<any>|TextOp|ModifyOp<any>>}
     */
    const maybeMergeable = []
    /**
     * Schedule an op to be merged later
     * @param {ChildrenOpAny?} op
     * @return {ChildrenOpAny}
     */
    const scheduleForMerge = op => {
      op && maybeMergeable.push(op)
      return /** @type {any} */ (op)
    }

    /**
     * Split opsI at the current offset - ensuring that we can insert safely at the current position
     */
    const splitHere = () => {
      if (offset > 0 && opsI != null) {
        opsI = scheduleForMerge(_splitChildAt(this, opsI, offset))
        offset = 0
      }
    }
    /**
     * @param {ChildrenOpAny} op
     */
    const insertClonedOp = op => {
      splitHere()
      // `move` re-parents the source op directly (it is donated); else clone with `keep`. Freshly
      // built `new DeleteOp(...)` callers are unaliased, so moving them is likewise safe.
      _insertChild(this, opsI, scheduleForMerge(move ? op : op.clone(0, op.length, keep)))
      // inserting pre-marked content (e.g. a node that already carries a cursor) brings its marks along
      if ($insertOp.check(op)) this.maybeHasMarks ||= elemsMaybeHaveMarks(op.insert)
    }
    // manual iteration (not `for..of`): a `move` apply re-parents the source op into `this.children`,
    // rewiring its `.next`; capture the successor first so the walk stays on `other`'s chain.
    for (let op = /** @type {ChildrenOpAny?} */ (other.children.start), nextOp = op; op != null; op = nextOp) {
      nextOp = op.next
      // defensive: the per-branch logic below resets opsI/offset whenever it
      // consumes an op exactly. This guard catches any path that forgets to.
      /* c8 ignore start */
      if (opsI?.length === offset) {
        opsI = opNextUndeleted(opsI)
        offset = 0
      }
      /* c8 ignore stop */
      if ($textOp.check(op) || $insertOp.check(op)) {
        insertClonedOp(op)
      } else if ($retainOp.check(op)) {
        let retainLen = op.length
        // split the current op when this retain carries a format and/or attribution instruction
        // (`!== undefined`) that differs from what the existing op holds — both unified tri-state. The
        // split must fire on any differing instruction (incl. a `{k:null}` removal or a `null` clear), not
        // just one that would change a *data* target: it marks the boundary between the already-advanced
        // (skipped) prefix and the region this op formats, so the update can't bleed into the prefix.
        if (offset > 0 && opsI != null && !$deleteOp.check(opsI) && (
          (op.format !== undefined && !fun.equalityDeep(/** @type {InsertOp<any>|RetainOp|ModifyOp} */ (opsI).format, op.format)) ||
          (op.attribution !== undefined && !fun.equalityDeep(/** @type {any} */ (opsI).attribution, op.attribution))
        )) {
          // need to split current op
          splitHere()
        }
        while (opsI != null && opsI.length - offset <= retainLen) {
          if (op.format !== undefined || op.attribution !== undefined) {
            updateOpFormat(opsI, op.format, op.attribution)
            scheduleForMerge(opsI)
          }
          retainLen -= opsI.length - offset
          opsI = opNextUndeleted(opsI)
          offset = 0
        }
        if (opsI != null) {
          if ((op.format !== undefined || op.attribution !== undefined) && retainLen > 0) {
            // accumulate onto the existing offset — the else-branch below uses
            // `offset += retainLen`, and we must agree with it when prior
            // iterations have advanced offset into opsI without splitting (e.g.
            // a format-less retain followed by a same-format retain).
            offset += retainLen
            splitHere()
            updateOpFormat(/** @type {ChildrenOpAny} */ (opsI.prev), op.format, op.attribution)
            scheduleForMerge(opsI.prev)
          } else {
            offset += retainLen
          }
        } else if (retainLen > 0) {
          // append the retain beyond existing content. On a NON-final/instruction apply keep it verbatim —
          // a `null` (clear) format/attribution here is a meaningful change op (e.g. a format/attribution
          // diff applied onto an as-yet-empty change delta). On a FINAL (materializing) apply the
          // removal/clear has nothing to act on, so resolve it away ({@link resolveBeyond}): a `{k:null}`
          // removal or `null` clear collapses to `undefined`, a set survives. We still append the (possibly
          // now-bare) retain so a following op stays positioned; done() trims it iff it is trailing.
          const fmt = final ? resolveBeyond(op.format, false) : op.format
          const attr = final ? resolveBeyond(op.attribution, true) : op.attribution
          _insertChild(this, null, scheduleForMerge(new RetainOp(retainLen, fmt, attr)))
        }
      } else if ($deleteOp.check(op)) {
        let remainingLen = op.delete
        while (remainingLen > 0) {
          if (opsI == null) {
            _insertChild(this, null, scheduleForMerge(new DeleteOp(remainingLen, null)))
            break
          } else if ($retainOp.check(opsI)) { // retain ⇒ splice retain, insert delete
            const delLen = math.min(opsI.length - offset, remainingLen)
            _shrinkChild(this, opsI, offset, delLen)
            if (opsI.length === 0) {
              _removeChild(this, opsI)
              opsI = opNextUndeleted(opsI)
              offset = 0
            }
            if (opsI?.length === offset) {
              opsI = opNextUndeleted(opsI)
              offset = 0
            }
            insertClonedOp(new DeleteOp(delLen, null))
            remainingLen -= delLen
          } else if ($modifyOp.check(opsI)) { // modify ⇒ delete the source position it stands for
            // a modify op addresses an underlying source position (retain + change), so deleting it
            // must emit a DeleteOp for that position - exactly like the retain case above. (The
            // insert/embed branch below instead just cancels the inserted content, because that
            // content is new and has no source position to delete.)
            _removeChild(this, opsI)
            opsI = opNextUndeleted(opsI)
            offset = 0
            insertClonedOp(new DeleteOp(1, null))
            remainingLen -= 1
          } else if (!$deleteOp.check(opsI)) { // insert / embed ⇒ replace
            // case1: delete o fully
            // case2: delete some part of beginning
            // case3: delete some part of end
            // case4: delete some part of center
            const delLen = math.min(opsI.length - offset, remainingLen)
            // deleting content drops any marks in the removed embeds; the conservative `maybeHasMarks`
            // flag is left as-is (never decremented - marksToPositions self-corrects it)
            if (opsI.length === delLen) {
              // case 1: delete opsI fully
              _removeChild(this, opsI)
              scheduleForMerge(opsI = opNextUndeleted(opsI))
              offset = 0
            } else if (offset === 0) {
              // case 2: delete from the beginning
              _shrinkChild(this, opsI, offset, delLen)
            } else if (offset + delLen === opsI.length) {
              // case 3: delete to the end
              _shrinkChild(this, opsI, offset, delLen)
              opsI = opNextUndeleted(opsI)
              offset = 0
            } else {
              // case 4: delete from the center
              _shrinkChild(this, opsI, offset, delLen)
            }
            remainingLen -= delLen
          /* c8 ignore start */
          } else {
            // unreachable: opsI was already typed as retain | non-delete-content | delete above
            error.unexpectedCase()
          }
          /* c8 ignore stop */
        }
      } else if ($modifyOp.check(op)) {
        if (opsI != null && (op.format !== undefined || op.attribution !== undefined) && (!$deleteOp.check(opsI) && !$retainOp.check(opsI))) { // retain handles splitting seperately, without copying attrs
          splitHere()
          if (opsI.length > 1) {
            offset = 1
            splitHere()
            opsI = /** @type {InsertOp<any>} */ (opsI.prev)
          }
          // at this point, opsI is guaranteed to be !deleteOp && !retainOp and of length 1
          updateOpFormat(opsI, op.format, op.attribution)
          scheduleForMerge(opsI)
        }
        if (opsI == null) {
          _insertChild(this, null, move ? op : op.clone(0, 1, keep))
          this.maybeHasMarks ||= /** @type {DeltaAny} */ (op.value).maybeHasMarks // a freshly-inserted modify brings its value's root marks
        } else if ($modifyOp.check(opsI)) {
          const tgt = opsI._modValue
          tgt.apply(/** @type {any} */ (op.value), { final, move })
          this.maybeHasMarks ||= tgt.maybeHasMarks // flag the child subtree's marks up (incl. the value's own root marks)
          opsI = opNextUndeleted(opsI)
        } else if ($insertOp.check(opsI)) {
          const tgt = opsI._modValue(offset)
          tgt.apply(op.value, { final, move })
          this.maybeHasMarks ||= tgt.maybeHasMarks // flag the child subtree's marks up (incl. the value's own root marks)
          if (opsI.length === ++offset) {
            opsI = opNextUndeleted(opsI)
            offset = 0
          }
        } else if ($retainOp.check(opsI)) {
          splitHere()
          const insertModOp = scheduleForMerge(move ? op : op.clone(0, 1, keep))
          this.maybeHasMarks ||= /** @type {DeltaAny} */ (op.value).maybeHasMarks // the inserted modify brings its value's root marks
          ;(opsI.format !== undefined || opsI.attribution !== undefined) && updateOpFormat(insertModOp, opsI.format, opsI.attribution)
          // the modify replaces one retain position with a length-1 modify (net childCnt: +1 here, -1 below)
          _insertChild(this, opsI, insertModOp)
          if (opsI.length === 1) {
            _removeChild(this, opsI)
            opsI = opNextUndeleted(opsI)
            offset = 0
          } else {
            _shrinkChild(this, opsI, 0, 1)
            scheduleForMerge(opsI)
          }
        /* c8 ignore start */
        } else {
          // remaining branches: opsI is deleteOp or something unknown
          // both branches are unreachable today: opNextUndeleted skips
          // delete ops, so opsI is never a delete during iteration; and the four
          // branches above exhaust the other op kinds. The deleteOp branch is
          // kept as a defensive no-op (drops a modify that lands in a deleted
          // region) rather than a throw.
          error.unexpectedCase()
        }
      } else {
        error.unexpectedCase()
      }
      /* c8 ignore stop */
    }
    // iterate backwards, to ensure that we merge all content
    for (let i = maybeMergeable.length - 1; i >= 0; i--) {
      const op = maybeMergeable[i]
      // check if this is still integrated
      if (op.prev != null ? op.prev.next === op : this.children.start === op) {
        op.prev && _mergeChildWithPrev(this, op)
        op.next && _mergeChildWithPrev(this, op.next)
      }
    }
    // marks: shift this node's own leaf marks by the change, then fold in root-level mark adds/deletes
    // (child subtree marks already flagged `maybeHasMarks` incrementally above)
    shiftMarksByChange(this, other)
    // pass `final` so a materializing apply (e.g. a deltaRDT's final state) applies deletes in place
    // but collects no pending `deleteMarks`; a non-final change delta still records them (transmittable)
    applyMarkOps(this, other.marks, other.deleteMarks, final)
    return this
  }

  /**
   * Rebase this op against a concurrent op. We can apply this op on a doc that already applied
   * `other` op.
   *
   * @param {DeltaAny} other
   * @param {boolean} priority
   */
  rebase (other, priority) {
    modDeltaCheck(this)
    /**
     * Rebase attributes
     *
     * - insert vs delete ⇒ insert takes precedence
     * - insert vs modify ⇒ insert takes precedence
     * - insert vs insert ⇒ priority decides
     * - delete vs modify ⇒ delete takes precedence
     * - delete vs delete ⇒ current delete op is removed because item has already been deleted
     * - modify vs modify ⇒ rebase using priority
     */
    for (const op of this.attrs) {
      if ($setAttrOp.check(op)) {
        if ($setAttrOp.check(other.attrs[op.key]) && !priority) {
          // @ts-ignore
          delete this.attrs[op.key]
        }
      } else if ($deleteAttrOp.check(op)) {
        // @ts-ignore
        const otherOp = other.attrs[/** @type {any} */ (op.key)]
        if ($setAttrOp.check(otherOp)) {
          // @ts-ignore
          delete this.attrs[otherOp.key]
        }
      } else if ($modifyAttrOp.check(op)) {
        const otherOp = other.attrs[/** @type {any} */ (op.key)]
        if (otherOp == null) {
          // nop
        } else if ($modifyAttrOp.check(otherOp)) {
          op._modValue.rebase(otherOp.value, priority)
        } else {
          // @ts-ignore
          delete this.attrs[otherOp.key]
        }
      /* c8 ignore start */
      } else {
        // unreachable: attr ops are exhaustively setAttr | deleteAttr | modifyAttr
        error.unexpectedCase()
      }
      /* c8 ignore stop */
    }
    /**
     * Rebase children.
     *
     * Precedence: insert with higher priority comes first. Op with less priority is transformed to
     * be inserted later.
     *
     * @todo always check if inser OR text
     */
    /**
     * @type {ChildrenOpAny?}
     */
    let currChild = this.children.start
    let currOffset = 0
    /**
     * @type {ChildrenOpAny?}
     */
    let otherChild = other.children.start
    let otherOffset = 0
    while (currChild != null && otherChild != null) {
      if ($insertOp.check(currChild) || $textOp.check(currChild)) {
        /**
         * Transforming *insert*. If other is..
         * - insert: transform based on priority
         * - retain/delete/modify: transform next op against other
         */
        if ($insertOp.check(otherChild) || $textOp.check(otherChild)) {
          if (!priority) {
            _insertChild(this, currChild, new RetainOp(otherChild.length, undefined, undefined))
            // curr is transformed against other, transform curr against next
            otherOffset = otherChild.length
          } else {
            // curr stays as is, transform next op
            currOffset = currChild.length
          }
        } else { // otherChild = delete | retain | modify - curr stays as is, transform next op
          currOffset = currChild.length
        }
      } else if ($modifyOp.check(currChild)) {
        /**
         * Transforming *modify*. If other is..
         * - insert: adjust position
         * - modify: rebase curr modify on other modify
         * - delete: remove modify
         * - retain: adjust offset
         */
        if ($insertOp.check(otherChild) || $textOp.check(otherChild)) {
          // @todo: with all list changes (retain insertions, removal), try to merge the surrounding
          // ops later
          _insertChild(this, currChild, new RetainOp(otherChild.length, undefined, undefined))
          // curr is transformed against other, transform curr against next
          otherOffset = otherChild.length
        } else {
          if ($modifyOp.check(otherChild)) {
            // _modValue (not .value) — ModifyOp.clone() marks its inner delta
            // as `done`, so a cloned ModifyOp can only be rebased after the
            // _modValue getter lazy-clones it back to mutable. This recursion also reconciles the
            // value's own root marks (via rebaseRootMarks), so a nested mark needs no special handling.
            currChild._modValue.rebase(otherChild.value, priority)
          } else if ($deleteOp.check(otherChild)) {
            _removeChild(this, currChild)
          }
          currOffset += 1
          otherOffset += 1
        }
      } else { // DeleteOp | RetainOp
        const maxCommonLen = math.min(currChild.length - currOffset, otherChild.length - otherOffset)
        /**
         * Transforming *retain* OR *delete*. If other is..
         * - retain / modify: adjust offsets
         * - delete: shorten curr op
         * - insert: split curr op and insert retain
         */
        if ($retainOp.check(otherChild) || $modifyOp.check(otherChild)) {
          // Format reconciliation over the [currOffset..currOffset+maxCommonLen] overlap. Split currChild
          // around the overlap so the prefix/suffix keep their original format and only the middle piece
          // changes. Three rules:
          //  1. A blanket `null` clear ALWAYS wins, priority-independent (this is what lets it converge — both
          //     rebase orderings agree the overlap ends up cleared, at the cost of dropping a concurrent set;
          //     hence `null` is a local-only utility, see the `FormattingAttributes` docs). currChild's own
          //     `null` clear is left untouched (it wins); if *other* clears, currChild concedes its whole format.
          //  2. Otherwise (both per-key objects) priority decides: priority=true is a no-op (currChild wins);
          //     for !priority currChild concedes any key otherChild also writes (a `{k:null}` removal is just
          //     such a key, so per-key removals reconcile here and converge without data loss — the recommended
          //     way to clear).
          //  3. otherChild `undefined` (skip) never changes currChild.
          if ($retainOp.check(currChild) && currChild.format !== null) {
            let changed = false
            /** @type {FormattingAttributes|null|undefined} */
            let newFormat
            if (otherChild.format === null) {
              // other clears all → clear wins → currChild concedes its entire format
              if (currChild.format !== undefined) { newFormat = undefined; changed = true }
            } else if (!priority && currChild.format != null && otherChild.format != null) {
              /** @type {FormattingAttributes} */
              const stripped = {}
              for (const k in currChild.format) {
                if (k in otherChild.format) changed = true
                else stripped[k] = currChild.format[k]
              }
              if (changed) newFormat = object.isEmpty(stripped) ? undefined : stripped
            }
            if (changed) {
              // split off the suffix [currOffset+maxCommonLen..length] if any
              if (currOffset + maxCommonLen < currChild.length) {
                _splitChildAt(this, currChild, currOffset + maxCommonLen)
              }
              // split off the prefix [0..currOffset] if any: currChild becomes the [currOffset..] suffix
              if (currOffset > 0) {
                currChild = _splitChildAt(this, currChild, currOffset)
                currOffset = 0
              }
              // currChild now spans exactly the overlap. A conceded format is `undefined` (skip / no format
              // change), NOT `null` (which would CLEAR the format on apply).
              /** @type {any} */ (currChild).format = newFormat
              currChild._fingerprint = null
            }
          }
          currOffset += maxCommonLen
          otherOffset += maxCommonLen
        } else if ($deleteOp.check(otherChild)) {
          // currChild is Retain | Delete here (outer branch); shrink it by the overlap
          _shrinkChild(this, currChild, currOffset, maxCommonLen)
          // advance other so subsequent currChild ops see what comes AFTER this
          // delete; without this we'd loop against the same delete forever and
          // never reach other's later inserts.
          otherOffset += maxCommonLen
        } else { // insert/text.check(otherChild)
          if (currOffset > 0) {
            // clone the LEFT (prefix) and shrink currChild from the front, so the original op survives as
            // the [currOffset..] suffix — keeping a DeleteOp's prevValue in sync (DeleteOp.clone drops it).
            _insertChild(this, currChild, currChild.clone(0, currOffset))
            _shrinkChild(this, currChild, 0, currOffset)
            currOffset = 0
          }
          _insertChild(this, currChild, new RetainOp(otherChild.length, undefined, undefined))
          otherOffset = otherChild.length
        }
      }
      if (currOffset >= currChild.length) {
        currChild = currChild.next
        currOffset = 0
      }
      if (otherOffset >= otherChild.length) {
        otherChild = otherChild.next
        otherOffset = 0
      }
    }
    // marks: reconcile this node's own root mark ops against the concurrent change (also shifting and,
    // where an anchor was deleted, converting an add to a delete). No count to maintain: `maybeHasMarks`
    // is conservative (rebase only drops/reconciles marks, never adds), so a stale `true` is harmless
    // and marksToPositions self-corrects it.
    if (this.marks !== null || this.deleteMarks !== null) {
      rebaseRootMarks(this, other, priority)
    }
    return this
  }

  /**
   * Same as doing `delta.rebase(other.inverse())`, without creating a temporary delta.
   *
   * @param {DeltaAny} other
   * @param {boolean} priority
   */
  rebaseOnInverse (other, priority) {
    modDeltaCheck(this)
    // @todo
    console.info('method rebaseOnInverse unimplemented')
    return this
  }

  /**
   * Append child ops from one op to the other.
   *
   *     delta.create().insert('a').append(delta.create().insert('b')) // => insert "ab"
   *
   * @template {DeltaConf} OtherDeltaConf
   * @param {Delta<OtherDeltaConf>} other
   * @return {DeltaBuilder<FixedConf extends true ? Conf : DeltaConfOverwrite<
   *   Conf,
   *   (DeltaConfGetChildren<OtherDeltaConf> extends never ? {} : { children: DeltaConfGetChildren<Conf> | DeltaConfGetChildren<OtherDeltaConf> })
   *   & (DeltaConfGetText<OtherDeltaConf> extends string ? { text: true } : never)
   * >, FixedConf>}
   */
  append (other) {
    const prevLast = this.children.end
    // @todo Investigate. Above is a typescript issue. It is necessary to cast OtherDelta to a Delta first before
    // inferring type, otherwise Children will contain Text.
    for (const child of other.children) {
      _insertChild(this, null, child.clone())
    }
    // appended children may carry marks in their subtrees - flag conservatively
    this.maybeHasMarks ||= other.maybeHasMarks
    prevLast?.next && _mergeChildWithPrev(this, prevLast.next)
    // @ts-ignore
    return this
  }
}

/**
 * Apply one tri-state dimension update (`format` or `attribution`) to `op[field]` and report whether it
 * changed. `undefined` = skip; `null` = clear all keys; an object merges per-key (`{k:v}` sets, `{k:null}`
 * removes key `k`). `format` and `attribution` are handled identically (the unified model).
 *
 * On an **instruction** op (`retain`/`modify`) the merge is kept verbatim — a `{k:null}` removal and a
 * `null` clear must survive so they still apply when this op is later consumed (an empty merge result `{}`
 * is a no-op → `undefined`/skip). On a **data** op (`insert`/`text`/attr op) the merge is resolved against
 * the stored value (empty → `null`/none). (Limitation: a `null` clear already present on an instruction op
 * does not compose with a subsequent set into a single op — only the set survives. The diff never produces
 * this; it would need arbitrary clear-then-set change composition.)
 *
 * @param {_OpAny} op
 * @param {'format'|'attribution'} field
 * @param {{[k:string]:any}|null|undefined} update
 * @return {boolean} whether `op[field]` was touched
 */
const applyDim = (op, field, update) => {
  if (update === undefined) return false
  if (update === null) {
    /** @type {any} */ (op)[field] = null // clear all
  } else if ($retainOp.check(op) || $modifyOp.check(op)) {
    // instruction op: keep the merge verbatim (preserves `{k:null}` removals to apply later). Attribution
    // additionally merges its nested `format` key one level (see {@link mergeAttr}); format stays shallow.
    const cur = /** @type {any} */ (op)[field]
    const merged = field === 'attribution' ? mergeAttr(cur, update, false) : object.assign({}, cur, update)
    ;/** @type {any} */ (op)[field] = object.isEmpty(merged) ? undefined : merged
  } else if (field === 'attribution') {
    // data op, attribution: resolve per key; the nested `format` key merges one level (see {@link mergeAttr})
    const merged = mergeAttr(/** @type {any} */ (op)[field], update, true)
    ;/** @type {any} */ (op)[field] = object.isEmpty(merged) ? null : merged
  } else {
    // data op (format): resolve per-key against the stored value (`{k:v}` sets, `{k:null}` removes, `{k:undefined}` skips)
    let f = /** @type {any} */ (op)[field]
    for (const k in update) {
      const v = update[k]
      if (v === undefined) continue // skip this key
      if (v === null) { // remove this key (no-op when the stored value is already `null`)
        if (f !== null) {
          const { [k]: _, ...rest } = f
          f = object.isEmpty(rest) ? null : rest
        }
      } else { // set this key
        f = object.assign({}, f, { [k]: v })
      }
    }
    /** @type {any} */ (op)[field] = f
  }
  return true
}

/**
 * Compute the tri-state update that turns stored value `aVal` into `bVal` (used by {@link diff} for both
 * `format` and `attribution`): `undefined` when unchanged (skip), `null` when fully cleared, else a
 * per-key object (`{k:v}` for changed/added keys, `{k:null}` for removed keys). With `deep` (attribution),
 * the nested `format` key is diffed one level deeper so it round-trips through {@link mergeAttr}'s per-inner-key
 * merge instead of a wholesale replace.
 *
 * @param {{[k:string]:any}|null|undefined} aVal
 * @param {{[k:string]:any}|null|undefined} bVal
 * @param {boolean} deep `true` for `attribution` (recurse its `format` key), `false` for `format` (shallow)
 * @return {{[k:string]:any}|null|undefined}
 */
const diffDim = (aVal, bVal, deep) => {
  if (fun.equalityDeep(aVal, bVal)) return undefined
  if (bVal === null || bVal === undefined || object.isEmpty(bVal)) return null // fully cleared
  /** @type {{[k:string]:any}} */
  const u = {}
  for (const k in bVal) {
    if (!fun.equalityDeep(bVal[k], aVal?.[k] ?? null)) {
      // attribution's nested `format` diffs one level deeper (mirrors mergeAttr); everything else is wholesale
      u[k] = deep && k === 'format' && s.$objectAny.check(bVal[k]) && s.$objectAny.check(aVal?.[k])
        ? diffDim(aVal[k], bVal[k], false)
        : bVal[k]
    }
  }
  for (const k in aVal) { if (!(k in bVal)) u[k] = null } // removed keys (`for..in` is a no-op when `aVal` is nullish)
  return u
}

/**
 * Apply a `format` and/or `attribution` update to an op (both unified tri-state — see {@link applyDim}).
 * `format`/`attribution` are fingerprinted, so any change nulls the op's `_fingerprint`.
 *
 * @param {ChildrenOpAny} op
 * @param {{[k:string]:any}|null|undefined} formatUpdate
 * @param {{[k:string]:any}|null|undefined} attributionUpdate
 */
const updateOpFormat = (op, formatUpdate, attributionUpdate) => {
  if ($deleteOp.check(op)) return
  const changedF = applyDim(op, 'format', formatUpdate)
  const changedA = applyDim(op, 'attribution', attributionUpdate)
  if (changedF || changedA) {
    /** @type {any} */ (op)._fingerprint = null
  }
}

/**
 * @param {ChildrenOpAny?} op
 */
const opNextUndeleted = op => {
  op = op?.next || null
  while (op != null && $deleteOp.check(op)) {
    op = op.next
  }
  return op
}

/**
 * Total order on marks by their (unique) id, used to sort a mark list deterministically (e.g. in
 * {@link Delta#toJSON}).
 *
 * @param {Mark} a
 * @param {Mark} b
 */
const compareMarksById = (a, b) => a.id < b.id ? -1 : 1

/**
 * Position-step order for a mark's `key`, mirroring the fingerprint key sort (see {@link Delta#fingerprint}):
 * numbers (child indices) first, ascending; then string (attribute) keys, lexicographically.
 *
 * @param {number|string} a
 * @param {number|string} b
 */
const cmpKey = (a, b) =>
  s.$number.check(a) ? (s.$number.check(b) ? a - b : -1) : s.$number.check(b) ? 1 : (a < b ? -1 : a > b ? 1 : 0)

/**
 * Total order over the marks of one node: by position-step {@link cmpKey}, tie-broken by the (unique)
 * id so the order is fully deterministic even when two cursors share a key. Used by {@link sortMarks}.
 *
 * @param {Mark} a
 * @param {Mark} b
 */
const cmpMarkKey = (a, b) => cmpKey(a.key, b.key) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Sort a {@link Marks} set in place into its canonical {@link cmpMarkKey} order and return it. Called
 * lazily whenever the set is iterated, so every reader (e.g.
 * {@link import('./position.js').marksToPositions}) sees one deterministic, position-ordered sequence
 * regardless of the order marks were added in. Order is not part of a delta's identity, so reordering
 * is safe even on a `done` delta.
 *
 * @param {Marks} marks
 */
const sortMarks = marks => { marks._marks.sort(cmpMarkKey); return marks }

/**
 * The set of leaf {@link Mark marks} on a single delta node, deduplicated by id (so adding the same id
 * again replaces it). An internal data-shape class (never a public/`new`-from-outside class): every
 * mutation goes through its methods, so a stored {@link Mark} is treated as immutable and is never
 * manipulated in place — to "move" a mark you replace it with a fresh `Mark`. {@link clone}/{@link
 * slice} copy the set so a `done` delta's marks are never mutated through a shared reference. Marks are
 * local/ephemeral cursor state
 * and not part of a delta's identity, so this set has no fingerprint/equality of its own.
 */
class Marks {
  constructor () {
    /**
     * @type {Array<Mark>}
     */
    this._marks = []
  }

  get size () { return this._marks.length }

  /**
   * Add or replace `mark` (by id). Returns `true` if it was added as a new mark, `false` if it
   * replaced an existing one with the same id.
   *
   * @param {Mark} mark
   * @return {boolean}
   */
  add (mark) {
    const i = this._marks.findIndex(m => m.id === mark.id)
    if (i < 0) {
      this._marks.push(mark)
      return true
    }
    this._marks[i] = mark
    return false
  }

  /**
   * Remove the mark with `id`. Returns `true` if a mark was present and removed, `false` if absent.
   *
   * @param {string} id
   * @return {boolean}
   */
  delete (id) {
    const i = this._marks.findIndex(m => m.id === id)
    if (i < 0) return false
    this._marks.splice(i, 1)
    return true
  }

  [Symbol.iterator] () { sortMarks(this); return this._marks[Symbol.iterator]() }
}

/**
 * Whether any delta element in `insert` maybe carries a mark in its subtree (short-circuits). Used to
 * OR-propagate the conservative {@link DeltaData#maybeHasMarks} flag when content is inserted.
 *
 * @param {Array<any>} insert
 * @return {boolean}
 */
const elemsMaybeHaveMarks = insert => insert.some(el => $deltaAny.check(el) && el.maybeHasMarks)

/**
 * Add (or replace) a {@link Mark} on `node`, flagging {@link DeltaData#maybeHasMarks}. Adding a mark
 * cancels any pending delete of the same id on `node` (so a node never holds both an add and a delete
 * for one id — the add wins), keeping the apply path consistent with rebase's add-vs-delete rule.
 *
 * @param {DeltaAny} node
 * @param {Mark} mark
 */
const addMarkTo = (node, mark) => {
  const marks = node.marks ?? new Marks()
  marks.add(mark)
  node.marks = marks
  node.maybeHasMarks = true
  if (node.deleteMarks !== null) {
    node.deleteMarks.delete(mark.id)
    if (node.deleteMarks.size === 0) node.deleteMarks = null
  }
}

/**
 * Mirror of {@link addMarkTo}: assert mark `id` is *absent* on `node` (last-writer-wins). Strips a
 * present add of `id` (a delete cancels a pending add — newest wins), then, only for a CHANGE delta
 * (`record`, i.e. a non-final apply), records the transmittable tombstone in `deleteMarks`. A
 * final/materializing apply passes `record === false`: the mark is removed in place but no tombstone is
 * collected (a final delta carries none — see {@link DeltaData#deleteMarks}). The `maybeHasMarks` flag is
 * intentionally left as-is (never decremented - {@link import('./position.js').marksToPositions}
 * self-corrects it). Together with `addMarkTo` these are the only two writers of `marks`/`deleteMarks`,
 * so a node can never hold both an add and a delete for one id.
 *
 * @param {DeltaAny} node
 * @param {string} id
 * @param {boolean} record whether to keep a transmittable `deleteMarks` tombstone (`= !final`)
 */
const deleteMarkTo = (node, id, record) => {
  if (node.marks !== null) {
    node.marks.delete(id)
    if (node.marks.size === 0) node.marks = null
  }
  if (record) {
    const dm = node.deleteMarks ?? new Set()
    dm.add(id)
    node.deleteMarks = dm
  }
}

/**
 * Apply mark add/delete ops to `target` (flagging `target.maybeHasMarks` on add). `addMarks` may be a
 * {@link Marks} set or a plain array; `deleteMarks` is a set of ids. The two id-keyed primitives
 * {@link deleteMarkTo}/{@link addMarkTo} are the only writers of `marks`/`deleteMarks`, so a node can
 * never end holding both for one id. Deletes are processed before adds so that a single change carrying
 * both for one id resolves to *add wins* (the add re-runs last and strips the just-recorded tombstone),
 * matching the rebase policy. `final` marks a document-materializing apply (propagated from
 * {@link DeltaBuilder#apply}, defaulting to `this.isFinal`): a settled document removes a present mark in
 * place but records no tombstone, while a non-final change delta records the delete (passed as
 * `record = !final`) so `create().removeMark(pos, id)` stays transmittable.
 *
 * @param {DeltaAny} target
 * @param {Iterable<Mark>?} addMarks
 * @param {Set<string>?} deleteMarks
 * @param {boolean} final whether this is a final (document-materializing) apply
 */
const applyMarkOps = (target, addMarks, deleteMarks, final) => {
  if (deleteMarks !== null) {
    for (const id of deleteMarks) deleteMarkTo(target, id, !final)
  }
  if (addMarks !== null) {
    for (const m of addMarks) addMarkTo(target, m)
  }
}

/**
 * Re-key `node`'s *root* marks in place: each mark's `key` is mapped through `mapKey` (return `null` to
 * drop it, an unchanged key to keep it, or a new key to move it). Used after a full {@link clone} by an
 * attribute-renaming transformer so a mark on a renamed attribute follows the rename (and a mark on a
 * dropped attribute is dropped). `node.maybeHasMarks` is left set (conservative; never decremented).
 *
 * @param {DeltaAny} node
 * @param {(key: number|string) => number|string|null} mapKey
 * @internal transformer plumbing (used by mark-carrying transformers), not consumer API.
 */
export const remapRootMarks = (node, mapKey) => {
  const marks = node.marks
  if (marks === null) return
  for (const m of [...marks]) {
    const k = mapKey(m.key)
    if (k === m.key) continue
    deleteMarkTo(node, m.id, false) // relocate a present mark: strip it, but synthesize no tombstone
    if (k !== null) addMarkTo(node, m.copy(k))
  }
}

/**
 * Add (or replace, by id) a single root {@link Mark} on `node`, flagging `node.maybeHasMarks`. The
 * public wrapper of the internal `addMarkTo`, used by the restructuring
 * {@link import('./transformer/core.js').Transformer transformers} (`inline`, `project`) to place a
 * mark at a position they compute themselves.
 *
 * @param {DeltaAny} node
 * @param {Mark} mark
 * @internal transformer plumbing (used by `inline`/`project`), not consumer API.
 */
export const addRootMark = (node, mark) => addMarkTo(node, mark)

/**
 * Mark id `id` as deleted on `node` (the mirror of {@link addRootMark}): the public wrapper of the
 * internal {@link deleteMarkTo} with `record === true`, used by the restructuring
 * {@link import('./transformer/core.js').Transformer transformers} (`inline`, `project`) to carry a mark
 * *delete* (which is id-keyed, so it needs no position) onto the node they build. Strips a present add of
 * the same id (last-writer-wins) so the node never holds both.
 *
 * @param {DeltaAny} node
 * @param {string} id
 * @internal transformer plumbing (used by `inline`/`project`), not consumer API.
 */
export const deleteRootMark = (node, id) => deleteMarkTo(node, id, true)

/**
 * Merge `source`'s *root* marks onto `target`, mapping each add mark's `key` through `mapKey` (return
 * `null` to drop it, a new key to move it via {@link Mark#copy}). `source`'s `deleteMarks` are merged
 * verbatim through {@link deleteMarkTo} — a delete is keyed only by its (cross-side-stable) id, so it
 * maps in either direction and strips a conflicting add on `target` (last-writer-wins, never both). Safe
 * to call repeatedly to accumulate marks from several sources onto one target (e.g.
 * {@link import('./transformer/inline.js') inline} lifting the marks of every spliced node onto the
 * flattened parent), and — onto a fresh target — to copy a node's marks across a key remapping (e.g.
 * {@link cloneShallow}, and the `attr` transformer following an attribute rename). `target.maybeHasMarks`
 * is flagged for the added marks; marks inside copied delta-valued attributes/children are flagged when
 * the caller appends them via the builder (and {@link cloneShallow} copies the flag wholesale).
 *
 * @param {DeltaAny} target
 * @param {DeltaAny} source
 * @param {(key: number|string) => number|string|null} [mapKey]
 * @internal transformer plumbing (used by `inline`/`attr`/`cloneShallow`), not consumer API.
 */
export const mergeRootMarks = (target, source, mapKey = k => k) => {
  if (source.marks !== null) {
    for (const m of source.marks) {
      const k = mapKey(m.key)
      if (k !== null) addMarkTo(target, k === m.key ? m : m.copy(k))
    }
  }
  if (source.deleteMarks !== null) {
    for (const id of source.deleteMarks) deleteMarkTo(target, id, true)
  }
}

/**
 * Map a number `key` (a content offset) of a leaf mark on a node through the content ops of `change`,
 * returning its new offset. An insert before the key pushes it right (tie-broken at the exact offset by
 * `assoc`). A delete covering the key applies *collapse-to-cut*: the mark slides to the cut point
 * (`newPos`) — i.e. to *before* any replacement text inserted there — instead of being dropped, so a
 * cursor whose content is deleted survives at the deletion site. `oldPos` walks the pre-change doc and
 * `newPos` the post-change doc *independently* — `key` is never mutated, so an insert past the key is
 * always compared against the mark's original offset even after earlier deletes shifted the content.
 *
 * NOTE: collapse-to-cut is intentionally NOT confluent under concurrent {@link DeltaBuilder#rebase} — a
 * deletion maps a whole range to one point, losing where in the range the cursor was, so a concurrent
 * insert there lands on different sides on the two replays. Marks are therefore treated as local /
 * ephemeral cursor state, excluded from a delta's identity ({@link Delta#fingerprint} / equality); only
 * the document *content* is guaranteed to converge.
 *
 * @param {DeltaAny} change
 * @param {number} key
 * @param {1|-1} assoc
 * @return {number}
 */
const shiftMarkKey = (change, key, assoc) => {
  let oldPos = 0
  let newPos = 0
  for (const op of change.children) {
    if ($retainOp.check(op) || $modifyOp.check(op)) {
      const n = op.length
      if (key < oldPos + n) return newPos + (key - oldPos) // mark falls inside this retained run
      oldPos += n
      newPos += n
    } else if ($insertOp.check(op) || $textOp.check(op)) {
      if (oldPos < key || (oldPos === key && assoc === 1)) newPos += op.length
    } else if ($deleteOp.check(op)) {
      const n = op.delete
      // mark lies in [oldPos, oldPos+n) — its content is being deleted ⇒ collapse to the cut point
      if (key < oldPos + n) return newPos
      // right boundary with LEFT gravity anchors to the last deleted char ⇒ also collapses to the cut
      // (n > 0 guards the degenerate delete(0) rebase can emit, which deletes nothing)
      if (n > 0 && key === oldPos + n && assoc === -1) return newPos
      oldPos += n
    }
  }
  return newPos + (key - oldPos)
}

/**
 * Shift `node`'s own number-keyed leaf marks by the content ops of `change`, collapsing any covered by a
 * delete to the cut point (see {@link shiftMarkKey}). Attribute-key (string) marks are untouched.
 *
 * @param {DeltaAny} node
 * @param {DeltaAny} change
 */
const shiftMarksByChange = (node, change) => {
  const marks = node.marks
  if (marks === null) return
  /** @type {Array<Mark>} */
  const shifted = []
  for (const m of marks) {
    if (typeof m.key === 'number') {
      const nk = shiftMarkKey(change, m.key, m.assoc)
      if (nk !== m.key) shifted.push(m.copy(nk)) // a fresh Mark — never mutate in place
    }
  }
  // re-add shifted marks under their (unchanged) ids ⇒ replace in place (the flag stays set)
  for (const m of shifted) marks.add(m)
}

/**
 * Collect the ids of a {@link Marks} set, a plain {@link Mark} array, or an id array (any may be
 * `null`) into a `Set`, used for the by-id conflict checks during {@link DeltaBuilder#rebase}.
 *
 * @param {Iterable<Mark|string>?} marksOrIds
 * @return {Set<string>}
 */
const markIdSet = marksOrIds => {
  /** @type {Set<string>} */
  const ids = new Set()
  if (marksOrIds !== null) {
    for (const x of marksOrIds) ids.add(typeof x === 'string' ? x : x.id)
  }
  return ids
}

/**
 * Core mark reconciliation for one node level during {@link DeltaBuilder#rebase}. `adds` are this
 * side's mark adds (with keys) and `deletes` its delete ids; `otherAddIds`/`otherDelIds` are the
 * concurrent side's ids and `otherContent` the delta whose content ops shift surviving number keys.
 *
 * Rules (each by mark id): add-vs-add → `priority` decides; add-vs-delete → the add wins (a re-placed
 * cursor is not killed by a stale removal); delete-vs-delete → the duplicate is dropped. A surviving
 * number-keyed add is shifted by `otherContent`, collapsing to the cut point if its content was
 * concurrently deleted (see {@link shiftMarkKey}). Cursor positions are best-effort, not guaranteed to
 * converge (marks are excluded from the document's identity); only content convergence is guaranteed.
 *
 * @param {Iterable<Mark>} adds
 * @param {Array<string>} deletes
 * @param {Set<string>} otherAddIds
 * @param {Set<string>} otherDelIds
 * @param {DeltaAny} otherContent
 * @param {boolean} priority
 * @return {{ adds: Array<Mark>, deletes: Array<string> }}
 */
const rebaseMarkOps = (adds, deletes, otherAddIds, otherDelIds, otherContent, priority) => {
  /** @type {Array<Mark>} */
  const keptAdds = []
  /** @type {Array<string>} */
  const delIds = deletes.slice()
  for (const m of adds) {
    if (!priority && otherAddIds.has(m.id)) continue // lost an add-vs-add conflict
    if (typeof m.key === 'number') {
      const nk = shiftMarkKey(otherContent, m.key, m.assoc) // collapses to the cut if its content was deleted
      keptAdds.push(nk === m.key ? m : m.copy(nk))
    } else {
      keptAdds.push(m)
    }
  }
  // a delete survives only where the other side neither re-adds (add wins) nor already deletes (dedup)
  /** @type {Set<string>} */
  const seen = new Set()
  /** @type {Array<string>} */
  const keptDels = []
  for (const id of delIds) {
    if (!seen.has(id) && !otherAddIds.has(id) && !otherDelIds.has(id)) {
      seen.add(id)
      keptDels.push(id)
    }
  }
  return { adds: keptAdds, deletes: keptDels }
}

/**
 * Reconcile a node's own root mark add/delete ops against a concurrent change `other` during
 * {@link DeltaBuilder#rebase}, rebuilding `node.marks`/`node.deleteMarks` from {@link rebaseMarkOps}.
 * `maybeHasMarks` is left set (conservative; marksToPositions self-corrects a now-empty subtree).
 *
 * @param {DeltaAny} node
 * @param {DeltaAny} other
 * @param {boolean} priority
 */
const rebaseRootMarks = (node, other, priority) => {
  const { adds, deletes } = rebaseMarkOps(
    node.marks !== null ? [...node.marks] : [],
    node.deleteMarks !== null ? [...node.deleteMarks] : [],
    markIdSet(other.marks), markIdSet(other.deleteMarks), other, priority
  )
  // rebuild both fields wholesale from rebaseMarkOps's provably-disjoint output (concurrent reconciliation
  // keeps its deliberate add-wins rule, NOT the apply path's last-writer-wins; not a primitive write)
  if (adds.length === 0) {
    node.marks = null
  } else {
    const m = new Marks()
    for (const x of adds) m.add(x)
    node.marks = m
  }
  node.deleteMarks = deletes.length === 0 ? null : new Set(deletes)
}

/**
 * Build a change delta that adds (or, with `isDelete`, removes) the mark for `pos`. The descent is a
 * `retain`/`modify`/`modifyAttr` chain re-derived from `pos.path`; the mark always rides on the **leaf
 * delta's own marks** (root marks). Each interior step just wraps the next level in a `modify`
 * (content index) or `modifyAttr` (attribute key) — apply/rebase carry the wrapped value's root marks
 * onto/through the target for free.
 *
 * @param {import('./position.js').Pos} pos
 * @param {string} id
 * @param {boolean} isDelete
 * @return {DeltaBuilderAny}
 */
const markChange = (pos, id, isDelete) => {
  const path = pos.path
  // a mark anchors at the terminal step of its path (a content offset or attribute key); the root
  // position `[]` has no terminal and cannot carry a mark - reject it instead of recursing forever
  if (path.length === 0) throw error.create('cannot place a mark at the root position (empty path): a mark needs a terminal content-offset or attribute-key step')
  const mark = isDelete ? null : createMark(path[path.length - 1], id, pos.assoc, pos.attrs ?? null)
  /**
   * @param {number} i
   * @return {DeltaBuilderAny}
   */
  const build = i => {
    if (i === path.length - 1) {
      // leaf reached: carry the mark on the delta's own marks
      const d = /** @type {DeltaBuilderAny} */ (create())
      if (mark === null) deleteMarkTo(d, id, true) // a change delta records the transmittable delete
      else addMarkTo(d, mark)
      return d
    }
    const step = path[i]
    return s.$string.check(step)
      ? /** @type {DeltaBuilderAny} */ (create()).modifyAttr(step, build(i + 1))
      : /** @type {DeltaBuilderAny} */ (create()).retain(step).modify(build(i + 1))
  }
  return build(0)
}

/**
 * @template {DeltaConf} Conf
 * @extends {s.Schema<Delta<Conf>>}
 * @internal use the {@link $delta} factory; this class is exported only for the `$$delta` predicate.
 */
export class $Delta extends s.Schema {
  /**
   * @param {s.Schema<any>} $name
   * @param {s.Schema<any>} $attrs
   * @param {s.Schema<any>} $children
   * @param {any} hasText
   * @param {any} recursiveChildren
   * @param {s.Schema<{[K:string]:any}>} $formats
   */
  constructor ($name, $attrs, $children, hasText, recursiveChildren, $formats) {
    super()
    const $attrsPartial = s.$$object.check($attrs) ? $attrs.partial : $attrs
    if (recursiveChildren) {
      // @ts-ignore
      $children = s.$union($children, this)
    }
    /**
     * @type {{
     *   $name: s.Schema<DeltaConfGetName<Conf>>,
     *   $attrs: s.Schema<DeltaConfGetAttrs<Conf>>,
     *   $children: s.Schema<DeltaConfGetChildren<Conf>>,
     *   hasText: DeltaConfGetText<Conf>
     *   recursiveChildren: DeltaConfGetRecursiveChildren<Conf>,
     *   $formats: s.Schema<{[K:string]:any}>
     * }}
     */
    this.shape = { $name, $attrs: $attrsPartial, $children, hasText, $formats, recursiveChildren }
  }

  /**
   * @param {any} o
   * @param {s.ValidationError} [err]
   * @return {o is Delta<Conf>}
   */
  check (o, err = undefined) {
    const { $name, $attrs, $children, hasText, $formats } = this.shape
    if (!$deltaAny.check(o, err)) {
      /* c8 ignore next */
      err?.extend(null, 'Delta', o?.constructor.name, 'Constructor match failed')
    } else if (o.name != null && !$name.check(o.name, err)) {
      /* c8 ignore next */
      err?.extend('Delta.name', $name.toString(), o.name, 'Unexpected node name')
    } else if (list.toArray(o.children).some(c => (!hasText && $textOp.check(c)) || (hasText && $textOp.check(c) && c.format != null && !$formats.check(c.format)) || ($insertOp.check(c) && !c.insert.every(ins => $children.check(ins))))) {
      err?.extend('Delta.children', '', '', 'Children don\'t match the schema')
    } else if (object.some(o.attrs, (op, k) => $setAttrOp.check(op) && !$attrs.check({ [k]: op.value }, err))) {
      err?.extend('Delta.attrs', '', '', 'Attrs don\'t match the schema')
    } else {
      return true
    }
    return false
  }
}

/**
 * @typedef {{
 *   name?: s.Schema<string>|string|Array<string>,
 *   attrs?: s.Schema<{ [key: string|number]: any }>|{ [key:string|number]:any },
 *   children?: any,
 *   text?: boolean,
 *   recursiveChildren?: boolean,
 *   formats?: { [k:string]: any }
 * }} ReadableDeltaConf
 */

/**
 * Transforms a ReadableDeltaConf (the input shape of `$delta(spec)`) to a DeltaConf.
 * @template {ReadableDeltaConf} DConfSpec
 * @typedef {[
 *   DConfSpec extends {name: infer N} ? s.ReadSchemaUnwrapped<N> : any,
 *   DConfSpec extends {attrs: infer A} ? s.ReadSchemaUnwrapped<A> : {},
 *   DConfSpec extends {children: infer C} ? s.ReadSchemaUnwrapped<C> : never
 * ] extends [infer NodeName, infer Attrs, infer Children]
 *   ? AsDeltaConf<PrettifyDeltaConf<(
 *       import('../ts.js').TypeIsAny<NodeName, {}, { name: NodeName }> &
 *       ([keyof Attrs] extends [never] ? {} : { attrs: Attrs }) &
 *       ([Children] extends [never] ? {} : { children: Children }) &
 *       (DConfSpec extends {text: true} ? { text: true } : {}) &
 *       (DConfSpec extends {recursiveChildren: true} ? { recursiveChildren: true } : {})
 *     )>>
 *   : never
 * } ReadDeltaConf
 */

/**
 * Name-first form: a string-literal `name` as the first argument is preserved as a literal type
 * (generic argument inference), so callers don't need `s.$literal('x')` / `@type {const}` to keep the
 * node name literal. The remaining options follow in `opts`.
 *
 * @template {string} Name
 * @template {Omit<ReadableDeltaConf, 'name'>} [Opts={}]
 * @overload
 * @param {Name} name
 * @param {Opts} [opts]
 * @return {s.Schema<Delta<ReadDeltaConf<Opts & { name: Name }>>>}
 */
/**
 * @template {ReadableDeltaConf} [Conf={}]
 * @overload
 * @param {Conf} opts
 * @return {s.Schema<Delta<ReadDeltaConf<Conf>>>}
 */
/**
 * @param {ReadableDeltaConf|string} optsOrName
 * @param {Omit<ReadableDeltaConf, 'name'>} [opts]
 * @return {any}
 */
export const $delta = (optsOrName, opts) => {
  const { name, attrs, children, text, formats, recursiveChildren: recursive } =
    s.$string.check(optsOrName) ? { ...opts, name: optsOrName } : optsOrName
  return /** @type {any} */ (new $Delta(
    /** @type {any} */ (name == null ? s.$any : s.$(name)),
    /** @type {any} */ (attrs == null ? s.$object({}) : s.$(attrs)),
    /** @type {any} */ (children == null ? s.$never : s.$(children)),
    text ?? false,
    recursive ?? false,
    formats == null ? s.$any : s.$(formats)
  ))
}

export const $$delta = /* @__PURE__ */s.$constructedBy($Delta)

export const $deltaAny = /** @type {s.Schema<Delta<any>>} */ (Delta.prototype.$type = s.$type('d:delta', Delta))
export const $deltaBuilderAny = /** @type {s.Schema<DeltaBuilderAny>} */ (/* @__PURE__ */s.$custom(o => $deltaAny.check(o) && !o.isDone))

/**
 * Helper function to merge attribution and attributes. The latter input "wins". The nested `format` key is
 * merged per inner key (one level — see {@link mergeAttr}); every other key is replaced wholesale.
 *
 * @template {{ [key: string]: any }} T
 * @param {T | null} a
 * @param {T | null} b
 */
export const mergeAttributions = (a, b) => a == null
  ? b
  : (b == null ? a : /** @type {T} */ (mergeAttr(a, b, true)))

/**
 * Helper function to merge formats. The latter input "wins".
 *
 * @template {{ [key: string]: any }} T
 * @param {T | null} a
 * @param {T | null} b
 */
export const mergeFormats = (a, b) => object.isEmpty(a)
  ? (object.isEmpty(b) ? null : b)
  : (object.isEmpty(b) ? a : object.assign({}, a, b))

/**
 * @template {DeltaAny|null} D
 * @param {D} a
 * @param {D} b
 * @return {D}
 */
export const mergeDeltas = (a, b) => {
  if (a != null && b != null) {
    const c = clone(a)
    c.apply(b)
    return /** @type {any} */ (c)
  }
  return /** @type {D} */ (a || b || null)
}

/**
 * The node (child delta) at child-position `pos` of `source`, or `null` when `pos` lands on a text
 * run or a non-delta child. Lets {@link random} target an existing node with a `modify` op.
 *
 * @param {DeltaAny} source
 * @param {number} pos
 * @return {DeltaAny?}
 */
const childNodeAt = (source, pos) => {
  let p = 0
  for (const op of source.children) {
    if ($textOp.check(op)) {
      if (pos < p + op.insert.length) return null
      p += op.insert.length
    } else if ($insertOp.check(op)) {
      for (const el of op.insert) {
        if (p === pos) return $deltaAny.check(el) ? el : null
        p++
      }
    }
  }
  /* c8 ignore start */
  // the sole caller passes pos < source.childCnt (sourceLen >= 1), so a node or text run always
  // resolves first; this guards an out-of-range pos defensively.
  return null
  /* c8 ignore stop */
}

/**
 * "Find the child schema for this node": the `$Delta` schemas within `$children` (a single schema or
 * any member of a union) that accept `node`. Only `$Delta` members can drive a recursive `random`
 * modify, so non-delta children (numbers, strings, `$any`) and non-matching names are dropped.
 *
 * @param {s.Schema<any>} $children
 * @param {DeltaAny} node
 * @return {Array<s.Schema<DeltaAny>>}
 */
const matchingNodeSchemas = ($children, node) => (s.$$union.check($children) ? $children.shape : [$children])
  .filter($c => $$delta.check($c) && $c.check(node))

/**
 * Random {@link Attribution} for fuzz tests. There is no schema for attributions; the canonical shape is
 * `(insert|delete + …At)` intersected with an optional format part. The format part exists only on
 * children (content ops), never on node attribute ops. Sometimes returns `undefined` (skip) or `null`
 * (clear). The optional `format` part carries a random non-empty subset of the format names, so two random
 * attributions differ in which inner `format` keys they carry — exercising the per-inner-key set/remove/merge
 * of {@link mergeAttr}/{@link diffDim} on the diff round-trip.
 *
 * @param {prng.PRNG} gen
 * @param {boolean} withFormat include the children-only `format`/`formatAt` part
 * @return {Attribution|null|undefined}
 */
const randomAttribution = (gen, withFormat) => {
  const r = prng.uint32(gen, 0, 5)
  if (r <= 2) return undefined // ~half: skip (no attribution change)
  if (r === 3) return null // clear all attribution
  const user = () => [prng.oneOf(gen, ['alice', 'bob', 'carol'])]
  /** @type {Attribution} */
  const attribution = prng.bool(gen)
    ? { insert: user(), insertAt: prng.uint32(gen, 0, 100) }
    : { delete: user(), deleteAt: prng.uint32(gen, 0, 100) }
  if (withFormat && prng.bool(gen)) {
    // a random non-empty subset of format names (never an empty `format`, per the storage invariant)
    /** @type {Record<string, string[]>} */
    const format = {}
    for (const name of ['bold', 'italic', 'under']) { if (prng.bool(gen)) format[name] = user() }
    if (!object.isEmpty(format)) {
      attribution.format = format
      attribution.formatAt = prng.uint32(gen, 0, 100)
    }
  }
  return attribution
}

/**
 * @template {DeltaConf} Conf
 * @param {prng.PRNG} gen
 * @param {s.Schema<Delta<Conf>>} $d
 * @param {object} conf
 * @param {DeltaAny?} [conf.source]
 * @param {number} [conf.minChildOps]
 * @param {number} [conf.maxChildOps]
 * @param {boolean} [conf.attribution] generate random attributions (off by default; consumes no PRNG
 * draws when off, so existing seeds are unaffected). Rebase does not converge attributions, so leave
 * this off for rebase-convergence fuzzing and enable it for diff fuzzing.
 * @return {DeltaBuilder<Conf>}
 */
export const random = (gen, $d, conf = {}) => {
  const { source = null, minChildOps = 1, maxChildOps = 9, attribution = false } = conf
  let sourceLen = source == null ? 0 : source.childCnt
  const { $name, $attrs, $children, hasText, $formats: $formats_ } = /** @type {$Delta<any>} */ (/** @type {any} */ ($d)).shape
  const d = s.$$any.check($name) ? create($deltaAny) : create(s.random(gen, $name), $deltaAny)
  const $formats = s.$$any.check($formats_) ? s.$null : $formats_
  const genAttribution = /** @param {boolean} withFormat */ withFormat => attribution ? randomAttribution(gen, withFormat) : undefined
  // set random attrs (node attribute ops carry the insert/delete part of an attribution only — no format part)
  prng.bool(gen) && d.setAttrs(s.random(gen, $attrs, random), genAttribution(false))
  // delete a single attr
  if (source && !object.isEmpty(source.attrs) && prng.bool(gen)) {
    d.deleteAttr(prng.oneOf(gen, object.keys(source.attrs)), genAttribution(false))
  }
  for (let i = prng.uint32(gen, minChildOps, maxChildOps); i > 0; i--) {
    /**
     * @type {Array<function():void>}
     */
    const possibleOps = []
    if (hasText) {
      possibleOps.push(() => {
        d.insert(prng.oneOf(gen, ['a', 'b', ' ', '\n', '.']), s.random(gen, $formats), genAttribution(true))
      })
    }
    if (!s.$$never.check($children)) {
      possibleOps.push(() => {
        /**
         * @type {Array<any>}
         */
        const ins = []
        let insN = prng.int32(gen, 0, 5)
        while (insN--) {
          ins.push(s.random(gen, $children, random))
        }
        d.insert(ins, s.random(gen, $formats), genAttribution(true))
      })
    }
    if (sourceLen > 0) {
      possibleOps.push(() => {
        const len = prng.uint32(gen, 1, sourceLen)
        sourceLen -= len
        d.delete(len)
      })
      possibleOps.push(() => {
        const len = prng.uint32(gen, 1, sourceLen)
        sourceLen -= len
        // a retain's format is a skip (`undefined`) or a per-key set object — never a blanket `null` clear
        // ($null formats coerce to skip). Blanket clears are a local-only utility and discouraged on a
        // channel (they "win" a rebase, dropping concurrent edits — see FormattingAttributes); the diff fuzz
        // already exercises the recommended per-key `{k:null}` removals (which converge without data loss).
        d.retain(len, prng.bool(gen) ? undefined : (s.random(gen, $formats) ?? undefined), genAttribution(true))
      })
      // if the op we currently point at is a node, it's also a choice to modify it: find the child
      // schema that matches the node and recursively generate a change against it.
      const src = /** @type {DeltaAny} */ (source)
      const node = childNodeAt(src, src.childCnt - sourceLen)
      const $nodeMatches = node != null ? matchingNodeSchemas($children, node) : []
      if ($nodeMatches.length > 0) {
        possibleOps.push(() => {
          d.modify(random(gen, prng.oneOf(gen, $nodeMatches), { source: node }), undefined, genAttribution(true))
          sourceLen -= 1
        })
      }
    }
    if (possibleOps.length > 0) {
      prng.oneOf(gen, possibleOps)()
    } else {
      break
    }
  }
  return /** @type {any} */ (d)
}

/**
 * @overload
 * @return {DeltaBuilder<{}>}
 */
/**
 * @template {string|null} NodeName
 * @overload
 * @param {NodeName} nodeName
 * @return {DeltaBuilder<NodeName extends string ? { name: NodeName } : {}>}
 */
/**
 * @template {string} NodeName
 * @template {s.Schema<DeltaAny>} Schema
 * @overload
 * @param {NodeName} nodeName
 * @param {Schema} schema
 * @return {Schema extends s.Schema<Delta<infer Conf>> ? DeltaBuilder<Conf, true> : never}
 */
/**
 * @template {s.Schema<DeltaAny>} Schema
 * @overload
 * @param {Schema} schema
 * @return {Schema extends s.Schema<Delta<infer Conf>> ? DeltaBuilder<Conf, true> : never}
 */
/**
 * @template {string|null} NodeName
 * @template {{[k:string|number]:any}|null} Attrs
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {NodeName} nodeName
 * @param {Attrs} attrs
 * @param {Children} [children]
 * @return {DeltaBuilder<(NodeName extends string ? { name: NodeName } : {}) & {
 *   attrs: Attrs extends null ? {} : Attrs,
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @param {string|s.Schema<DeltaAny>|null} [nodeNameOrSchema]
 * @param {{[K:string|number]:any}|s.Schema<DeltaAny>} [attrsOrSchema]
 * @param {(Array<any>|string)} [children]
 * @return {DeltaBuilder<{}>}
 */
export const create = (nodeNameOrSchema, attrsOrSchema, children) => {
  const nodeName = /** @type {any} */ (s.$string.check(nodeNameOrSchema) ? nodeNameOrSchema : null)
  const schema = /** @type {any} */ (s.$$schema.check(nodeNameOrSchema) ? nodeNameOrSchema : (s.$$schema.check(attrsOrSchema) ? attrsOrSchema : null))
  const d = /** @type {DeltaBuilder<any>} */ (new DeltaBuilder(nodeName, schema))
  if (s.$objectAny.check(attrsOrSchema)) {
    d.setAttrs(attrsOrSchema)
  }
  children && d.insert(children)
  return d
}

/**
 * @template {string|null} NodeName
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {NodeName} nodeName
 * @param {...Array<Children>} children
 * @return {DeltaBuilder<(NodeName extends string ? { name: NodeName } : {}) & {
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {...Array<Children>} children
 * @return {DeltaBuilder<{
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @template {{[k:string|number]:any}|null} Attrs
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {Attrs} attrs
 * @param {...Array<Children>} children
 * @return {DeltaBuilder<{
 *   attrs: Attrs extends null ? {} : Attrs,
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @template {string|null} NodeName
 * @template {{[k:string|number]:any}|null} Attrs
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {NodeName} nodeName
 * @param {Attrs} attrs
 * @param {...Array<Children>} children
 * @return {DeltaBuilder<(NodeName extends string ? { name: NodeName } : {}) & {
 *   attrs: Attrs extends null ? {} : Attrs,
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @param {Array<string|null|{[K:string|number]:any}|Array<any>>} args
 * @return {DeltaBuilder<{}>}
 */
export const from = (...args) => {
  const hasName = s.$string.check(args[0])
  let i = hasName ? 1 : 0
  const d = create(hasName ? /** @type {string} */ (args[0]) : null)
  if (s.$objectAny.check(args[i])) {
    d.setAttrs(/** @type {any} */ (args[i++]))
  }
  for (; i < args.length; i++) {
    d.insert(/** @type {any} */ (args[i]))
  }
  return d
}

class _DiffStringWrapper {
  /**
   * @param {string} str
   */
  constructor (str) {
    this.str = str
    /**
     * @type {string?}
     */
    this._fingerprint = null
  }

  [fingerprintTrait.FingerprintTraitSymbol] () {
    return this._fingerprint || (this._fingerprint = fingerprintTrait.fingerprint(this.str))
  }
}

/*
 * Delta Diffing approach - optimized for performance and creating readable deltas. You can only
 * diff insertions (InsertOp & TextOp) not delete ops.
 *
 * # Children
 * Diff content first and then figure out the necessary formatting updates
 * 1. find common prefix & suffix
 * 2. slice center to fresh delta. split content by coarse regex ($insert ops are split into
 * individual items)
 * 3. patience diff on split content and receive set of splice ops
 * 4. on each splice op: perform another patience diff with a granular regex on strings
 * 5. reassemble deltas recursively
 * 6. apply content diff on original delta and find necessary formatting updates
 * 7. merge content diff and formatting updates
 */

/**
 * @typedef {object} DiffOptions
 * @property {(d1: DeltaAny, d2: DeltaAny) => boolean} [compare] Predicate deciding when two nodes
 * are paired into a `modify` (vs. replaced wholesale). Defaults to comparing names
 * (`(d1, d2) => d1.name === d2.name`). Called as `compare(fromNode, toNode)`.
 */

/**
 * Compute a delta that, when applied to `d1`, produces `d2`. Only the children and attributes of
 * `d1` and `d2` are compared; the top-level node names of `d1` and `d2` are *not*. Diffing
 * `<div>a</div>` against `<span>a</span>` is valid and yields an empty diff — they have the same
 * children and attributes, so as far as `diff` is concerned they are equal at the level it cares
 * about. The top-level name is treated as a document-type marker, not as diffable content.
 *
 * Names *are* compared on children: a child node whose name changes between `d1` and `d2` is
 * replaced wholesale (delete + insert), not converted into a `modify` op. Same-name child nodes
 * at aligned positions are paired and recursed into via `modify`.
 *
 * Pairing is decided by `options.compare`, which defaults to comparing names
 * (`(d1, d2) => d1.name === d2.name`). Supply a stricter predicate to tighten the granularity —
 * e.g. to also require their first child to match — in which case nodes that don't satisfy it are
 * replaced wholesale instead. `options` is forwarded to every child diff, so the chosen granularity
 * applies consistently all the way down the tree. `compare` is always called as
 * `compare(fromNode, toNode)` (the node from `d1` first).
 *
 * NOTE: `diff` compares **content only** — it short-circuits on the {@link Delta#fingerprint}, which
 * excludes marks. Two states that differ *only* in their marks diff to an empty change, so cursor marks
 * do NOT cross a `diff` (e.g. a `Binding`'s initial-state sync). Marks survive on the live
 * `apply`/`rebase`/transform path; carrying them across a diff-based boundary needs a separate channel.
 *
 * @template {DeltaConf} Conf
 * @param {Delta<Conf>} d1
 * @param {NoInfer<Delta<Conf>>} d2
 * @param {DiffOptions} [options]
 * @return {Delta<Conf>}
 */
export const diff = (d1, d2, options = {}) => {
  const d = create(d1.name === d2.name ? d1.name : null, $deltaAny)
  const compare = options?.compare ?? defaultCompare
  if (d1.fingerprint !== d2.fingerprint) {
    /**
     * @type {ChildrenOpAny?}
     */
    let left1 = d1.children.start
    /**
     * @type {ChildrenOpAny?}
     */
    let left2 = d2.children.start
    /**
     * @type {ChildrenOpAny?}
     */
    let right1 = d1.children.end
    /**
     * @type {ChildrenOpAny?}
     */
    let right2 = d2.children.end
    // whether we need to diff formatting
    let formattingOrAttributionNeedsDiff = false
    let commonPrefixOffset = 0
    // perform a patience sort
    // 1) remove common prefix and suffix
    while (left1 != null && left1.fingerprint === left2?.fingerprint) {
      if (!$deleteOp.check(left1)) {
        commonPrefixOffset += left1.length
      }
      left1 = left1.next
      left2 = left2.next
    }
    if (left1 !== null && left2 !== null) {
      while (right1 !== null && right2 !== null && right1 !== left1 && right2 !== left2 && right1.fingerprint === right2.fingerprint) {
        right1 = right1.prev
        right2 = right2.prev
      }
    }
    /**
     * @type {Array<fingerprintTrait.Fingerprintable>}
     */
    const cs1 = []
    /**
     * @type {Array<fingerprintTrait.Fingerprintable>}
     */
    const cs2 = []
    // if right is null, then we already matched everything
    if (right1 != null) {
      while (left1 !== null && left1 !== right1.next) {
        if ($textOp.check(left1)) {
          cs1.push(left1.insert)
        } else if ($insertOp.check(left1)) {
          cs1.push(...left1.insert.map(ins => typeof ins === 'string' ? new _DiffStringWrapper(ins) : ins))
        } else {
          throw error.create('[lib0/delta] diffing deletes unsupported')
        }
        formattingOrAttributionNeedsDiff ||= left1.format != null || left1.attribution != null
        left1 = left1.next
      }
    }
    if (right2 != null) {
      while (left2 !== null && left2 !== right2.next) {
        if ($textOp.check(left2)) {
          cs2.push(left2.insert)
        } else if ($insertOp.check(left2)) {
          cs2.push(...left2.insert.map(ins => typeof ins === 'string' ? new _DiffStringWrapper(ins) : ins))
        /* c8 ignore start */
        } else {
          // unreachable for valid diff inputs (delete on the rhs would already
          // have been rejected via the `[lib0/delta] diffing deletes unsupported`
          // path above)
          error.unexpectedCase()
        }
        /* c8 ignore stop */
        formattingOrAttributionNeedsDiff ||= left2.format != null || left2.attribution != null
        left2 = left2.next
      }
    }
    const changeset1 = [{
      index: commonPrefixOffset,
      insert: cs2,
      remove: cs1
    }]
    // split by line
    const changeset2 = diffChangesetWithSeparator(changeset1, /[\n]+/g)
    // split by alphanumerics and others
    const changeset3 = diffChangesetWithSeparator(changeset2, patience.smartSplitRegex)
    // split all
    const changeset4 = diffChangesetWithSeparator(changeset3, /./g)
    applyChangesetToDelta(d, changeset4, compare, options)
    if (formattingOrAttributionNeedsDiff) {
      const formattingDiff = create()
      // update opsIs with content diff. then we can figure out the formatting diff.
      const originalUpdated = clone(d1)
      originalUpdated.apply(/** @type {DeltaAny} */ (d))
      let bOffset = 0
      // update a to match b
      let a = /** @type {InsertOp<any>|TextOp|null} */ (originalUpdated.children.start)
      let b = /** @type {InsertOp<any>|TextOp|null} */ (d2.children.start)
      let aOffset = 0
      while (a != null && b != null) {
        if (!$deleteOp.check(b) && !$deleteOp.check(a)) {
          const aFormat = a.format
          const bFormat = b.format
          const minForward = math.min(b.length - bOffset, a.length - aOffset)
          aOffset += minForward
          bOffset += minForward
          // format and attribution diff identically (unified tri-state — see diffDim):
          // undefined = unchanged (skip), null = cleared, else a per-key `{k:v}`/`{k:null}` update
          const fupdate = diffDim(aFormat, bFormat, false)
          const attributionUpdate = diffDim(a.attribution, b.attribution, true)
          if (fupdate === undefined && attributionUpdate === undefined) {
            formattingDiff.retain(minForward)
          } else {
            formattingDiff.retain(minForward, fupdate, attributionUpdate)
          }
          // update offset and iterators
          if (bOffset >= b.length) {
            b = b.next
            bOffset = 0
          }
          if (aOffset >= a.length) {
            a = a.next
            aOffset = 0
          }
        /* c8 ignore start */
        } else {
          // unreachable: by this point both a and b are insert/text (deletes
          // were rejected upstream and `originalUpdated` is the result of an
          // apply, which keeps inserts only).
          error.unexpectedCase()
        }
        /* c8 ignore stop */
      }
      // @todo instead of applying, we want to first exec d, then formattingDiff - we need a merge
      // function!
      d.apply(formattingDiff)
    }
    for (const attr2 of d2.attrs) {
      const key = attr2.key
      // @ts-ignore
      const attr1 = d1.attrs[key]
      if (attr1 == null || (attr1.fingerprint !== attr2.fingerprint)) {
        /* c8 ignore else */
        if ($setAttrOp.check(attr2)) {
          const prevVal = attr1?.value
          const nextVal = attr2.value
          if ($deltaAny.check(prevVal) && $deltaAny.check(nextVal) && compare(prevVal, nextVal)) {
            // modifyAttr carries the *incremental* attribution update (apply merges it onto the target attr
            // op's attribution); the inner diff updates its value.
            // reason: diffDim returns an opaque update (a `{k:null}` removal isn't a canonical Attribution),
            // while modifyAttr's param is typed Attribution for API ergonomics
            d.modifyAttr(key, diff(prevVal, nextVal, options), /** @type {Attribution|null|undefined} */ (diffDim(attr1?.attribution, attr2.attribution, true)))
          } else {
            // setAttr replaces the whole attr, so it carries the new attribution as data (object-or-none)
            d.setAttr(key, nextVal, attr2.attribution)
          }
        /* c8 ignore start */
        } else {
          error.unexpectedCase()
        }
        /* c8 ignore stop */
      }
    }
    for (const { key } of d1.attrs) {
      // @ts-ignore
      if (d2.attrs[key] == null) {
        d.deleteAttr(key)
      }
    }
  }
  return d.done(false)
}

/**
 * Default pairing predicate for {@link diff}: two delta nodes are paired (and recursed into via
 * `modify`) when their names match.
 *
 * @param {DeltaAny} d1
 * @param {DeltaAny} d2
 */
const defaultCompare = (d1, d2) => d1.name === d2.name

/**
 * @param {string|any} c
 */
const contentLen = c => typeof c === 'string' ? c.length : 1

/**
 * Apply removes from c.remove to d, mutating c.remove to exclude the applied items
 *
 * @param {DeltaBuilderAny} d
 * @param {Array<any>} crem
 * @param {number} len
 */
const applyRemoves = (d, crem, len) => { len > 0 && d.delete(crem.splice(0, len).map(contentLen).reduce(math.add, 0)) }
/**
 * Apply inserts from c.insert to d, mutating c.insert to exclude the applied items
 *
 * @param {DeltaBuilderAny} d
 * @param {Array<any>} cins
 * @param {number} len
 */
const applyInserts = (d, cins, len) => { len > 0 && cins.splice(0, len).forEach(ins => d.insert(typeof ins === 'string' ? ins : [ins instanceof _DiffStringWrapper ? ins.str : ins])) }

/**
 * @param {DeltaBuilderAny} d
 * @param {Array<{ index: number, remove: Array<any>, insert: Array<any> }>} changeset
 * @param {(d1: DeltaAny, d2: DeltaAny) => boolean} compare
 * @param {DiffOptions} options
 */
const applyChangesetToDelta = (d, changeset, compare, options) => {
  for (let ci = 0, lastIndex = 0; ci < changeset.length; ci++) {
    const c = changeset[ci]
    d.retain(c.index - lastIndex)
    lastIndex = c.index + c.remove.map(contentLen).reduce(math.add, 0)
    // @todo do patience diff on the delta-names, then perform maximum number of mods instead of
    // insert/delete
    while (true) {
      const cremoveDeltaIndex = c.remove.findIndex(cc => $deltaAny.check(cc))
      if (cremoveDeltaIndex < 0) break
      const cremoveDelta = c.remove[cremoveDeltaIndex]
      const cinsertDeltaIndex = c.insert.findIndex(cc => $deltaAny.check(cc) && compare(cremoveDelta, cc))
      if (cinsertDeltaIndex < 0) {
        applyRemoves(d, c.remove, cremoveDeltaIndex + 1)
        continue
      }
      applyRemoves(d, c.remove, cremoveDeltaIndex)
      applyInserts(d, c.insert, cinsertDeltaIndex)
      d.modify(diff(c.remove[0], c.insert[0], options))
      c.remove.splice(0, 1)
      c.insert.splice(0, 1)
    }
    applyRemoves(d, c.remove, c.remove.length)
    applyInserts(d, c.insert, c.insert.length)
  }
  return d
}

/**
 * @param {Array<{ index: number, remove: Array<any>, insert: Array<any> }>} changeset
 * @param {RegExp} separator
 */
export const diffChangesetWithSeparator = (changeset, separator) => {
  /**
   * @type {Array<any>}
   */
  const next = []
  changeset.forEach(change => {
    // @todo actually split here
    const cs1 = splitContentArrayByRegexp(change.remove, separator)
    const cs2 = splitContentArrayByRegexp(change.insert, separator)
    const fp1 = cs1.map(c => typeof c === 'string' ? c : fingerprintTrait.fingerprint(c))
    const fp2 = cs2.map(c => typeof c === 'string' ? c : fingerprintTrait.fingerprint(c))
    const changesetF = patience.diff(fp1, fp2)
    const nextChangeset = fillFingerprintDiffFromContent(changesetF, cs1, cs2)
    let prevDiffIndex = 0
    let nextChangeIndex = change.index
    // adjust indexes for actual content length and add results to `next`
    nextChangeset.forEach(c => {
      // adjust equal content
      for (; prevDiffIndex < c.index; prevDiffIndex += 1) {
        nextChangeIndex += contentLen(cs1[prevDiffIndex])
      }
      // need to adjust index with the actual length of the previous items
      c.index = nextChangeIndex
      next.push(c)
    })
  })
  return next
}

/**
 * @param {Array<any>} cs
 * @param {RegExp} regexp
 */
const splitContentArrayByRegexp = (cs, regexp) => {
  /**
   * @type {Array<any>}
   */
  const res = []
  cs.forEach(c => {
    if (typeof c === 'string') {
      res.push(...patience.splitByRegexp(c, regexp, true))
    } else {
      res.push(c)
    }
  })
  return res
}

/**
 * @template C
 * @param {Array<{ index: number, remove: Array<string>, insert: Array<string> }>} changeset
 * @param {Array<C>} is
 * @param {Array<C>} should
 * @return {Array<{ index: number, remove: Array<C>, insert: Array<C> }>}
 */
const fillFingerprintDiffFromContent = (changeset, is, should) => {
  // overwrite fingerprinted content with actual content
  for (let i = 0, adj = 0; i < changeset.length; i++) {
    const cd = changeset[i]
    // @ts-ignore
    cd.remove = is.slice(cd.index, cd.index + cd.remove.length)
    // @ts-ignore
    cd.insert = should.slice(cd.index + adj, cd.index + adj + cd.insert.length)
    adj += cd.insert.length - cd.remove.length
  }
  return /** @type {any} */ (changeset)
}
