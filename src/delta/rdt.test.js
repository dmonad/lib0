import * as t from '../testing.js'
import * as delta from './delta.js'
import * as dt from './transformer.js'
import { bind, $rdt, correctionOrigin } from './rdt.js'
import { deltaRDT } from './rdt/delta.js'
import { ObservableV2 } from '../observable.js'
import * as mux from '../mutex.js'
import * as s from '../schema.js'

// ---------------------------------------------------------------------------
// Binding
//
// These tests exercise the binding machinery (rdt.js): a `Binding` routes
// each side's changes through a transformer and feeds the result back, with a
// mutex breaking the echo loop. `DeltaRDT` is used as the (DOM-free) vehicle on
// both sides; the individual RDTs are tested in ./rdt/*.test.js.
// ---------------------------------------------------------------------------

/**
 * `dt.renameAttrs($d, {})` is the identity transformer: `applyA` maps a change verbatim
 * onto the B side and `applyB` maps it back onto A, so a binding using it keeps
 * both sides bit-for-bit equal. Exposed as a `TemplateFactory` (`$d => Template`) so it
 * can be passed to `bind`.
 *
 * @type {import('./transformer/core.js').TemplateFactory<any,any>}
 */
const identity = $d => dt.renameAttrs($d, /** @type {const} */ ({}))

export const testBindIdentity = () => {
  const $d = delta.$delta({ attrs: { x: s.$string }, text: true })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  bind(a, b, identity)
  /** @type {Array<delta.DeltaAny>} */
  const aChanges = []
  /** @type {Array<delta.DeltaAny>} */
  const bChanges = []
  a.on('delta', d => aChanges.push(d))
  b.on('delta', d => bChanges.push(d))
  // a change on `a` is mirrored onto `b`
  a.applyDelta(delta.create().setAttr('x', 'hello').insert('world'))
  t.compare(a.state, b.state, 'states equal after a-side change')
  t.compare(b.state, delta.create().setAttr('x', 'hello').insert('world'))
  // the echo loop is broken: `a` sees its own change once, `b` sees it once
  t.assert(aChanges.length === 1)
  t.assert(bChanges.length === 1)
  // a change on `b` is mirrored back onto `a`
  b.applyDelta(delta.create().setAttr('x', 'again'))
  t.compare(a.state, b.state, 'states equal after b-side change')
  t.assert(aChanges.length === 2)
  t.assert(bChanges.length === 2)
}

export const testBindDefaultIdentity = () => {
  const $d = delta.$delta({ attrs: { x: s.$string }, text: true })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  // omitting the template defaults to the identity transformer
  bind(a, b)
  a.applyDelta(delta.create().setAttr('x', 'hi').insert('there'))
  t.compare(a.state, b.state, 'states equal with default (identity) template')
  t.compare(b.state, delta.create().setAttr('x', 'hi').insert('there'))
}

export const testBindRename = () => {
  const $a = delta.$delta({ attrs: { a: s.$string } })
  const $b = delta.$delta({ attrs: { b: s.$string } })
  const a = deltaRDT($a)
  const b = deltaRDT($b)
  // a -> b renames attr `a` to `b`; the binding maps changes both ways
  bind(a, b, $d => dt.renameAttrs($d, /** @type {const} */ ({ a: 'b' })))
  a.applyDelta(delta.create().setAttr('a', 'x'))
  t.compare(a.state, delta.create().setAttr('a', 'x'))
  t.compare(b.state, delta.create().setAttr('b', 'x'), 'attr renamed a->b')
  // a change on the b side maps back to the a side (b -> a renames `b` to `a`)
  b.applyDelta(delta.create().setAttr('b', 'y'))
  t.compare(b.state, delta.create().setAttr('b', 'y'))
  t.compare(a.state, delta.create().setAttr('a', 'y'), 'attr renamed b->a')
}

export const testBindInitialState = () => {
  const $d = delta.$delta({ attrs: { x: s.$string }, text: true })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  // `a` already holds state before the binding is created
  a.applyDelta(delta.create().setAttr('x', 'hello').insert('world'))
  // binding must sync `a`'s existing state onto the (empty) `b`
  bind(a, b, identity)
  t.compare(b.state, delta.create().setAttr('x', 'hello').insert('world'), 'b initialized from a')
  t.compare(a.state, b.state, 'states equal after initial sync')
}

export const testBindInitialStateReconcile = () => {
  const $d = delta.$delta({ attrs: { x: s.$string }, text: true })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  // both sides hold (different) state before binding
  a.applyDelta(delta.create().setAttr('x', 'a').insert('AAA'))
  b.applyDelta(delta.create().setAttr('x', 'b').insert('BBB'))
  bind(a, b, identity)
  // `a` is the source of truth: `b` is reconciled to match a's projection
  t.compare(b.state, delta.create().setAttr('x', 'a').insert('AAA'), 'b reconciled to a on bind')
  t.compare(a.state, b.state, 'states equal after reconcile')
}

export const testBindInitialStateClears = () => {
  const $d = delta.$delta({ attrs: { x: s.$string }, text: true })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  // only `b` holds state; since `a` (the source of truth) is empty, `b`'s extra content is removed
  b.applyDelta(delta.create().setAttr('x', 'gone').insert('content'))
  bind(a, b, identity)
  // `b` maintains a final document, so removing its content leaves a clean empty delta (no leftover
  // delete-op markers) — semantically and structurally empty, matching the empty `a`
  t.assert(b.state?.childCnt === 0, 'b children cleared')
  t.compare(b.state, delta.create(), 'b emptied to match empty a')
}

export const testBindInitialStateThenChange = () => {
  const $d = delta.$delta({ attrs: { x: s.$string }, text: true })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  a.applyDelta(delta.create().setAttr('x', 'init').insert('hi'))
  bind(a, b, identity)
  t.compare(b.state, a.state, 'b initialized from a')
  // ongoing changes still propagate after the initial sync
  b.applyDelta(delta.create().setAttr('x', 'changed'))
  t.compare(a.state, b.state, 'b-side change propagated to a after initial sync')
  t.compare(a.state, delta.create().setAttr('x', 'changed').insert('hi'))
}

export const testBindInitialStateRename = () => {
  const $a = delta.$delta({ attrs: { a: s.$string } })
  const $b = delta.$delta({ attrs: { b: s.$string } })
  const a = deltaRDT($a)
  const b = deltaRDT($b)
  // `a` holds state before binding; the transformer renames attr `a` -> `b`
  a.applyDelta(delta.create().setAttr('a', 'x'))
  bind(a, b, $d => dt.renameAttrs($d, /** @type {const} */ ({ a: 'b' })))
  t.compare(a.state, delta.create().setAttr('a', 'x'), 'a unchanged')
  t.compare(b.state, delta.create().setAttr('b', 'x'), 'initial a-state projected & renamed onto b')
}

export const testBindInitialSelfHealNullProjection = () => {
  const $d = delta.$delta({ attrs: { x: s.$string } })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  // A contract-honest transformer double. `TransformResult` (createTransformResult(a, b)) permits a
  // non-null self-heal for side A together with a `null` projection for side B — isEmpty() is
  // `a == null && b == null`, so the two are independent. No shipped transformer emits this shape from
  // a one-sided `applyA` (it only arises in the two-sided `apply` path, exercised via `propagate`
  // above), so we model it directly to exercise the initial sync's handling of a self-heal on `a`
  // (`tres.a`) and an absent projection onto `b` (`tres.b == null`).
  /** @type {any} */
  const template = () => ({
    init: () => ({
      applyA: () => dt.createTransformResult(delta.create().setAttr('x', 'healed'), null),
      applyB: (/** @type {any} */ bd) => dt.createTransformResult(null, bd),
      apply: (/** @type {any} */ tr) => tr
    })
  })
  /** @type {Array<any>} */
  const aOrigins = []
  a.on('delta', (_d, origin) => aOrigins.push(origin))
  bind(a, b, template)
  // `tres.a` (the self-heal) was applied back onto `a` during initial sync ...
  t.assert(a.state?.attrs.x?.value === 'healed', 'init-sync applied the self-heal onto a')
  // ... adjusting a's own state, so it carries the correction origin ...
  t.assert(aOrigins.length === 1 && aOrigins[0] === correctionOrigin, 'the init-sync self-heal is a correction')
  // ... and `tres.b` was null, so `b` was never diffed/touched
  t.assert(b.state === null, 'no projection onto b when tres.b is null')
}

/**
 * @template {delta.DeltaConf} Conf
 * @typedef {import('./rdt.js').RDT<Conf>} RDT
 */

/**
 * A fix-producing RDT used only in these tests. Like the in-memory `deltaRDT`, but after applying a
 * change it consults `computeFix(state)` and, when that returns a non-empty delta, applies it on top
 * and returns it as the fix (emitting the effective change). This exercises the binding's
 * fix-propagation logic without baking invariants into the shipped `deltaRDT`.
 *
 * @template {delta.DeltaConf} Conf
 * @implements {RDT<Conf>}
 * @extends {ObservableV2<{ delta: (d: delta.Delta<Conf>, origin: any) => void, destroy: (rdt: any) => void }>}
 */
class ConstrainedRDT extends ObservableV2 {
  /**
   * @param {import('../schema.js').Schema<delta.Delta<Conf>>} $delta
   * @param {(state: delta.DeltaBuilderAny) => (delta.DeltaBuilderAny | null)} computeFix
   */
  constructor ($delta, computeFix) {
    super()
    this.$delta = $delta
    /** @type {delta.DeltaBuilderAny?} */
    this.state = null
    this.computeFix = computeFix
    this._mux = mux.createMutex()
  }

  /**
   * @param {delta.Delta<Conf>} d
   * @param {any} [origin]
   * @return {delta.DeltaBuilder<Conf> | null}
   */
  applyDelta (d, origin = null) {
    if (d.isEmpty()) return null
    /** @type {delta.DeltaBuilderAny | null} */
    let fix = null
    /** @type {any} */
    let effective = d
    this._mux(() => {
      if (this.state == null) {
        this.state = delta.create(d.name)
        this.state.isFinal = true // keep a final document, like deltaRDT
      }
      this.state.apply(d) // final → deletes/deleteAttrs clean up the state
      const f = this.computeFix(this.state)
      if (f != null && !f.isEmpty()) {
        this.state.apply(f) // final → a deleteAttr fix removes the attr cleanly
        fix = f
        // the emitted change keeps the deleteAttr (not final); `f` is a same-conf fix at runtime
        effective = delta.clone(d).apply(/** @type {any} */ (f))
      }
    })
    this.emit('delta', [effective, origin])
    return /** @type {delta.DeltaBuilder<Conf> | null} */ (fix)
  }

  /**
   * @return {delta.Delta<Conf>}
   */
  get delta () {
    return /** @type {any} */ (this.state ?? delta.create(this.$delta))
  }

  destroy () {
    this.emit('destroy', [this])
    super.destroy()
  }
}

/**
 * @template {delta.DeltaConf} Conf
 * @param {import('../schema.js').Schema<delta.Delta<Conf>>} $delta
 * @param {(state: delta.DeltaBuilderAny) => (delta.DeltaBuilderAny | null)} computeFix
 */
const constrainedRDT = ($delta, computeFix) => new ConstrainedRDT($delta, computeFix)

/**
 * Invariant "the `secret` attribute is forbidden": whenever a change sets it, strip it back out.
 *
 * @param {delta.DeltaBuilderAny} state
 */
const stripSecret = state =>
  delta.$setAttrOp.check(state.attrs.secret) ? delta.create().deleteAttr('secret') : null

export const testBindFixReceivingSide = () => {
  const $d = delta.$delta({ attrs: { secret: s.$string, ok: s.$string } })
  const a = deltaRDT($d)
  const b = constrainedRDT($d, stripSecret) // b forbids `secret`
  bind(a, b, identity)
  // an external change on `a` carries the forbidden attr; b strips it (a fix returned from applyDelta)
  // and that fix must propagate back through the transformer onto `a`
  a.applyDelta(delta.create().setAttr('secret', 's').setAttr('ok', 'y'))
  // both sides maintain a final document, so the stripped attr is removed outright (no delete marker)
  t.assert(b.state?.attrs.secret === undefined, 'b stripped secret')
  t.assert(a.state?.attrs.secret === undefined, 'strip fix propagated back onto a')
  t.assert(b.state?.attrs.ok?.value === 'y' && a.state?.attrs.ok?.value === 'y', 'ok preserved on both')
  t.compare(a.state, b.state, 'both sides converge after the fix')
}

export const testBindFixOriginatingSide = () => {
  const $d = delta.$delta({ attrs: { secret: s.$string, ok: s.$string } })
  const a = constrainedRDT($d, stripSecret) // a itself forbids `secret`
  const b = deltaRDT($d)
  bind(a, b, identity)
  // `a` strips `secret` locally; the *effective* change it emits (with secret already removed) is what
  // reaches `b`, so `b` never sees secret as a live set
  a.applyDelta(delta.create().setAttr('secret', 's').setAttr('ok', 'y'))
  t.assert(!delta.$setAttrOp.check(b.state?.attrs.secret), 'b never received secret as a set')
  t.assert(b.state?.attrs.ok?.value === 'y', 'ok reached b')
  t.compare(a.state, b.state, 'both sides converge')
}

export const testBindFixAddsContent = () => {
  const $d = delta.$delta({ attrs: { version: s.$string, data: s.$string } })
  // b requires a `version` attribute and adds a default one when it is missing
  const ensureVersion = (/** @type {delta.DeltaBuilderAny} */ state) =>
    delta.$setAttrOp.check(state.attrs.version) ? null : delta.create().setAttr('version', '1')
  const a = deltaRDT($d)
  const b = constrainedRDT($d, ensureVersion)
  bind(a, b, identity)
  a.applyDelta(delta.create().setAttr('data', 'x'))
  // b adds the missing version (a fix); it propagates back so `a` gains it too
  t.assert(b.state?.attrs.version?.value === '1', 'b added the missing version')
  t.assert(a.state?.attrs.version?.value === '1', 'version fix propagated back onto a')
  t.compare(a.state, b.state, 'both sides converge after the fix')
}

/**
 * A transformer manipulates deltas IN PLACE (see its docs), so the binding must hand it a privately-owned
 * clone of every change — the `'delta'` event payload is a shared read delta, and an in-memory RDT's
 * `delta` snapshot IS its (frozen) live state. `fullAttributions` is a shipped transformer that consumes
 * its input via `apply({move:true})`, so it would corrupt the caller's change / throw on a frozen one if
 * the binding did not `cloneDeep` first — unlike `identity`/`renameAttrs`, which clone internally. This
 * pins that the binding deep-clones on both the live path (`propagate`) and the initial-state sync.
 */
export const testBindDeepClonesForTransformer = () => {
  const $d = delta.$delta({ text: true })
  // live path: the caller keeps (and must not have mutated) the change it applied
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  bind(a, b, dt.fullAttributions)
  a.applyDelta(delta.create().insert('ab', undefined, { insert: ['alice'] }))
  const change = delta.create().retain(2, undefined, { insertAt: 9 })
  const snapshot = change.toJSON()
  a.applyDelta(change)
  t.compare(change.toJSON(), snapshot, "the caller's change was not mutated in place by the transformer")
  t.compare(a.state, b.state, 'both sides converge')
  // a frozen (done) change must not throw when routed through the in-place transformer
  const frozen = delta.create().insert('c', undefined, { insert: ['bob'] }).done()
  a.applyDelta(frozen)
  t.compare(a.state, b.state, 'a done change propagates without error')

  // initial-state sync: `a` already holds (frozen, nested) state before binding through the transformer
  const a2 = deltaRDT($d)
  const b2 = deltaRDT($d)
  a2.applyDelta(delta.create().insert('hello', undefined, { insert: ['alice'] }))
  bind(a2, b2, dt.fullAttributions) // must not throw or corrupt a2's live state
  t.compare(b2.state, a2.state, 'b initialized from a through the in-place transformer')
}

export const testRdtSchema = () => {
  const $d = delta.$delta({ attrs: { x: s.$string } })
  const a = deltaRDT($d)
  // a real RDT matches
  t.assert($rdt.check(a), 'deltaRDT matches $rdt')
  // the constrained test RDT (a different implementation) matches too — $rdt is duck-typed
  t.assert($rdt.check(constrainedRDT($d, stripSecret)), 'a different RDT implementation also matches')
  // non-RDTs don't match
  t.assert(!$rdt.check(null), 'null is not an RDT')
  t.assert(!$rdt.check(delta.create($d)), 'a plain delta is not an RDT')
  t.assert(!$rdt.check(new ObservableV2()), 'a bare observable (no $delta/applyDelta) is not an RDT')
  t.assert(!$rdt.check({ $delta: 'nope', applyDelta: () => null, on () {}, destroy () {} }), '$delta must be a schema')
  // duck-typed: any object exposing the full RDT surface matches (no single constructor brand)
  t.assert($rdt.check({ $delta: $d, applyDelta: () => null, on () {}, destroy () {} }), 'a structurally-complete object matches')
}

export const testBindDestroy = () => {
  const $d = delta.$delta({ attrs: { x: s.$string } })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  bind(a, b, identity)
  // destroying one side tears the binding down (it listens for 'destroy')
  a.destroy()
  // further changes on the surviving side are no longer propagated
  b.applyDelta(delta.create().setAttr('x', 'orphan'))
  t.compare(b.state, delta.create().setAttr('x', 'orphan'))
  t.assert(a.state === null, 'destroyed side received no further updates')
}

/**
 * The `'delta'` event carries a second `origin` argument (see the "Origins" section of the `RDT`
 * typedef): `applyDelta(d, origin)` forwards it verbatim, and a change the `Binding` maps onto the
 * other side carries the binding itself as its origin. This is how a consumer distinguishes the changes
 * it produced from foreign ones (à la Yjs origins) and skips looping its own changes back. Fix traffic
 * carries the `correction` origin instead — see testCorrectionOrigin below.
 */
export const testDeltaEventOrigin = () => {
  const $d = delta.$delta({ attrs: { x: s.$string } })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  const binding = bind(a, b, identity)
  /** @type {Array<any>} */
  const aOrigins = []
  /** @type {Array<any>} */
  const bOrigins = []
  a.on('delta', (_d, origin) => aOrigins.push(origin))
  b.on('delta', (_d, origin) => bOrigins.push(origin))
  // a stand-in for a communication provider / editor binding that "produces" the change
  const provider = {}
  a.applyDelta(delta.create().setAttr('x', 'v'), provider)
  // the origin passed to applyDelta is forwarded verbatim on `a`'s own emit ...
  t.assert(aOrigins.length === 1 && aOrigins[0] === provider, 'applyDelta forwards the caller origin')
  // ... while the change the binding maps onto `b` is produced by the binding, so it is the origin
  t.assert(bOrigins.length === 1 && bOrigins[0] === binding, 'binding-mapped change carries the binding as origin')
}

/**
 * When the receiving side's `applyDelta` returns a fix, the binding transforms it back onto the
 * originating side and applies it with the correction origin (see the "Origins" section of the `RDT`
 * typedef) — so a consumer can tell "my change was adjusted after the fact" apart from an ordinary
 * foreign change (which carries the binding as its origin). The listeners are registered BEFORE the
 * binding so they observe events in causal order — the binding propagates synchronously from inside
 * `a`'s emit, so a listener registered after it would see the nested correction event first.
 */
export const testCorrectionOrigin = () => {
  const $d = delta.$delta({ attrs: { secret: s.$string, ok: s.$string } })
  const a = deltaRDT($d)
  const b = constrainedRDT($d, stripSecret) // b forbids `secret`
  /** @type {Array<delta.DeltaAny>} */
  const aDeltas = []
  /** @type {Array<any>} */
  const aOrigins = []
  /** @type {Array<any>} */
  const bOrigins = []
  a.on('delta', (d, origin) => { aDeltas.push(d); aOrigins.push(origin) })
  b.on('delta', (_d, origin) => bOrigins.push(origin))
  const binding = bind(a, b, identity)
  const provider = {}
  a.applyDelta(delta.create().setAttr('secret', 's').setAttr('ok', 'y'), provider)
  // `a` first emits the caller's own change, then receives b's strip fix as a correction
  t.assert(aOrigins.length === 2 && aOrigins[0] === provider, 'a first emits the caller change')
  t.assert(aOrigins[1] === correctionOrigin, "b's fix reaches a with the correction origin")
  // the exported constant is the plain string, so `origin === 'correction'` works without the import
  t.assert(correctionOrigin === 'correction')
  t.assert(delta.$deleteAttrOp.check(aDeltas[1].attrs.secret), 'the correction reverts the forbidden attr')
  // `b` folds its fix into the single effective change it emits — an ordinary binding-mapped change
  t.assert(bOrigins.length === 1 && bOrigins[0] === binding, 'b sees one binding-mapped change, no correction')
  t.compare(a.state, b.state, 'both sides converge after the correction')
}

/**
 * When the side that received the caller's change fixes it itself, the fix is folded into the
 * effective change before the binding sees it — there is nothing to correct after the fact, so no
 * `correction` origin appears on either side.
 */
export const testCorrectionOriginOriginatingSide = () => {
  const $d = delta.$delta({ attrs: { secret: s.$string, ok: s.$string } })
  const a = constrainedRDT($d, stripSecret) // a fixes its own incoming change
  const b = deltaRDT($d)
  const binding = bind(a, b, identity)
  /** @type {Array<any>} */
  const aOrigins = []
  /** @type {Array<any>} */
  const bOrigins = []
  a.on('delta', (_d, origin) => aOrigins.push(origin))
  b.on('delta', (_d, origin) => bOrigins.push(origin))
  const provider = {}
  a.applyDelta(delta.create().setAttr('secret', 's').setAttr('ok', 'y'), provider)
  t.assert(aOrigins.length === 1 && aOrigins[0] === provider, 'a emits only the effective caller change')
  t.assert(bOrigins.length === 1 && bOrigins[0] === binding, 'b receives one ordinary binding-mapped change')
  t.compare(a.state, b.state, 'both sides converge')
}
