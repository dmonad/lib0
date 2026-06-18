import * as t from '../testing.js'
import * as delta from './delta.js'
import * as dt from './transformer.js'
import { bind } from './rdt.js'
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
 * `dt.rename({})` is the identity transformer: `applyA` maps a change verbatim
 * onto the B side and `applyB` maps it back onto A, so a binding using it keeps
 * both sides bit-for-bit equal.
 */
const identity = () => dt.rename(/** @type {const} */ ({}))

export const testBindIdentity = () => {
  const $d = delta.$delta({ attrs: { x: s.$string }, text: true })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  bind(a, b, identity())
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
  bind(a, b, dt.rename(/** @type {const} */ ({ a: 'b' })))
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
  bind(a, b, identity())
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
  bind(a, b, identity())
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
  bind(a, b, identity())
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
  bind(a, b, identity())
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
  bind(a, b, dt.rename(/** @type {const} */ ({ a: 'b' })))
  t.compare(a.state, delta.create().setAttr('a', 'x'), 'a unchanged')
  t.compare(b.state, delta.create().setAttr('b', 'x'), 'initial a-state projected & renamed onto b')
}

/**
 * @typedef {import('./rdt.js').RDT<delta.DeltaAny>} RDT
 */

/**
 * A fix-producing RDT used only in these tests. Like the in-memory `deltaRDT`, but after applying a
 * change it consults `computeFix(state)` and, when that returns a non-empty delta, applies it on top
 * and returns it as the fix (emitting the effective change). This exercises the binding's
 * fix-propagation logic without baking invariants into the shipped `deltaRDT`.
 *
 * @implements {RDT}
 * @extends {ObservableV2<{ delta: (d: delta.DeltaAny) => void, destroy: (rdt: any) => void }>}
 */
class ConstrainedRDT extends ObservableV2 {
  /**
   * @param {import('../schema.js').Schema<delta.DeltaAny>} $delta
   * @param {(state: delta.DeltaBuilderAny) => (delta.DeltaAny | null)} computeFix
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
   * @param {delta.DeltaAny} d
   * @return {delta.DeltaAny | null}
   */
  applyDelta (d) {
    if (d.isEmpty()) return null
    /** @type {delta.DeltaAny | null} */
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
        effective = delta.clone(d).apply(f) // the emitted change keeps the deleteAttr (not final)
      }
    })
    this.emit('delta', [effective])
    return fix
  }

  toDelta () {
    return /** @type {any} */ (this.state ?? delta.create(this.$delta))
  }

  destroy () {
    this.emit('destroy', [this])
    super.destroy()
  }
}

/**
 * @param {import('../schema.js').Schema<delta.DeltaAny>} $delta
 * @param {(state: delta.DeltaBuilderAny) => (delta.DeltaAny | null)} computeFix
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
  bind(a, b, identity())
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
  bind(a, b, identity())
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
  bind(a, b, identity())
  a.applyDelta(delta.create().setAttr('data', 'x'))
  // b adds the missing version (a fix); it propagates back so `a` gains it too
  t.assert(b.state?.attrs.version?.value === '1', 'b added the missing version')
  t.assert(a.state?.attrs.version?.value === '1', 'version fix propagated back onto a')
  t.compare(a.state, b.state, 'both sides converge after the fix')
}

export const testBindDestroy = () => {
  const $d = delta.$delta({ attrs: { x: s.$string } })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  bind(a, b, identity())
  // destroying one side tears the binding down (it listens for 'destroy')
  a.destroy()
  // further changes on the surviving side are no longer propagated
  b.applyDelta(delta.create().setAttr('x', 'orphan'))
  t.compare(b.state, delta.create().setAttr('x', 'orphan'))
  t.assert(a.state === null, 'destroyed side received no further updates')
}
