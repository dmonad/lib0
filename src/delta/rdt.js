/**
 * # Replicated Data Types (RDTs) and bindings
 *
 * An **RDT** ("replicated data type") is any object that represents some state and communicates changes
 * to that state as {@link import('./delta.js').Delta deltas}. Every RDT is an
 * {@link import('../observable.js').ObservableV2 observable}:
 * - it **emits** a `'delta'` event carrying a delta whenever its own state changes, and
 * - it **accepts** foreign changes through `applyDelta(delta)`, which mutates its state to match.
 *
 * Because the changes are deltas, two different representations of "the same" data can be kept in sync
 * even when their shapes differ. That is the job of a {@link Binding}: it connects two RDTs `a` and `b`
 * through a {@link dt.Template transformer template}. The template is instantiated once (against `a`'s
 * schema) into a stateful {@link dt.Transformer}, and every change is routed through it:
 *
 * - a change on `a` is fed to `transformer.applyA(d)`, whose result `{ a, b }` is pushed back via
 *   `a.applyDelta` (self-heal) and `b.applyDelta` (the mapped change), and symmetrically for `b` via `applyB`.
 *
 * Feeding the mapped change back into the other RDT makes it emit its own `'delta'`, which would loop
 * forever; a {@link mux mutex} shared per side breaks that echo so a change is only transformed once.
 *
 * Applying a mapped change can make the receiving RDT enforce its own invariants and return a **fix**
 * (see {@link RDT}) — a further change it made to itself. Because the echo mutex swallows the RDT's
 * re-emit during propagation, the binding reads that fix from `applyDelta`'s return value and feeds it
 * back as a fresh change on its side. A fix on one side and a fix on the other are concurrent, so they
 * are rebased against each other: the pending pair `{ a, b }` is run through `transformer.apply`, whose
 * machinery already transposes the two sides. This repeats until neither side reports a fix, so fixes
 * must converge to a fixpoint (a well-behaved RDT applies them idempotently).
 *
 * On creation a binding first **synchronizes the initial state**: `a`'s current state (`a.toDelta()`)
 * is projected through the transformer, and the projection is diffed against `b`'s current state
 * (`b.toDelta()`); the resulting difference is applied to `b` so it matches `a`'s projection (and any
 * self-heal correction is applied back to `a`). `a` is the source of truth — pre-existing state on `b`
 * that `a` does not project to is overwritten.
 *
 * Two reference RDTs live in `./rdt/`:
 * - `./rdt/delta.js` ({@link RDT}) — an in-memory delta whose state is just the accumulated delta.
 * - `./rdt/dom.js` — a live DOM subtree, observed with a `MutationObserver`, that turns DOM mutations
 *   into deltas and applies incoming deltas back onto the DOM.
 *
 * @module delta/rdt
 */

import * as dt from './transformer.js'
import * as delta from './delta.js'
import * as mux from '../mutex.js'

// Re-export the two reference RDTs this module's doc references, so `bind`, `deltaRDT` and `domRDT` are
// reachable from one import. The leaf modules (`lib0/delta/rdt/delta`, `lib0/delta/rdt/dom`) stay
// independently importable, so a consumer who wants only one keeps it tree-shakeable.
export { deltaRDT } from './rdt/delta.js'
export { $domDelta, domRDT } from './rdt/dom.js'

/**
 * @template T
 * @typedef {import('../schema.js').Schema<T>} Schema
 */

/**
 * Abstract interface for a delta-based Replicated Data Type.
 *
 * An RDT is an observable that emits a `'delta'` (and, on teardown, a `'destroy'`) event, exposes the
 * {@link Schema schema} of the deltas it produces via `$delta` (so a {@link Binding} can initialize a
 * transformer for it), exposes its current state as a delta via `toDelta`, and accepts foreign deltas
 * via `applyDelta`.
 *
 * `applyDelta(d)` applies `d` and then, if the change would violate the RDT's own invariants, applies
 * a **fix** of its own (e.g. reversing part of `d`, or inserting missing content) and returns that fix
 * — `null` when none was needed. The fix is a regular change on this RDT, so a {@link Binding} maps it
 * onto the other side just like any other change. `applyDelta` also emits the *effective* change
 * (`d` together with the fix) on the `'delta'` channel.
 *
 * @template {import('./delta.js').DeltaAny} D
 * @typedef {import('../observable.js').ObservableV2<{ delta: (delta: D) => void, destroy: (rdt: RDT<D>) => void }> & {
 *   $delta: Schema<D>,
 *   toDelta: () => D,
 *   applyDelta: (delta: D) => D | null,
 *   destroy: () => void
 * }} RDT
 */

/**
 * Propagate a pair of concurrent changes between the two sides of `binding` until they converge.
 *
 * `ta` / `tb` are changes that have ALREADY been applied to `a` / `b` (an incoming `'delta'`, or a fix
 * returned by a previous `applyDelta`). Each is mapped onto the other side via the transformer —
 * `apply` rebases the two against each other — and the mapped results are applied, which may yield
 * further RDT fixes. We repeat until neither side reports a fix.
 *
 * @param {Binding<any>} binding
 * @param {any} ta change already applied on `a` (or `null`)
 * @param {any} tb change already applied on `b` (or `null`)
 */
const propagate = (binding, ta, tb) => {
  while ((ta != null && !ta.isEmpty()) || (tb != null && !tb.isEmpty())) {
    const tres = binding.t.apply(dt.createTransformResult(ta, tb))
    ta = tres.a != null ? binding.a.applyDelta(tres.a) : null
    tb = tres.b != null ? binding.b.applyDelta(tres.b) : null
  }
}

/**
 * Connects two RDTs so that changes on either side are transformed and reflected on the other.
 *
 * @template {import('./delta.js').DeltaAny} DeltaA
 */
export class Binding {
  /**
   * @param {RDT<DeltaA>} a
   * @param {RDT<import('./delta.js').DeltaAny>} b
   * @param {dt.Template} [template] defaults to the {@link dt.id identity} transformer
   */
  constructor (a, b, template = dt.id) {
    /**
     * @type {dt.Transformer<any,any>}
     */
    this.t = template.init(a.$delta)
    // reason: the `'delta'` channel carries `Delta` values while the transformer is typed for the
    // mutable `DeltaBuilder` it consumes/produces, and the binding is generic over both sides; typing
    // the internal handles as `RDT<any>` lets changes pass through the transformer without unsound
    // cross-casts, while `bind`/the constructor keep precise public signatures.
    /**
     * @type {RDT<any>}
     */
    this.a = a
    /**
     * @type {RDT<any>}
     */
    this.b = b
    this._mux = mux.createMutex()
    this._achanged = this.a.on('delta', d => this._mux(() => propagate(this, d, null)))
    this._bchanged = this.b.on('delta', d => this._mux(() => propagate(this, null, d)))
    this.a.on('destroy', this.destroy)
    this.b.on('destroy', this.destroy)
    // Sync the initial state. `a` is the source of truth: project its current state through the
    // transformer (`applyA`) — which also yields any self-heal correction for `a` (`tres.a`) — then
    // diff the projection against `b`'s current state and apply the difference so `b` ends up
    // matching `a`'s projection. Any fixes the two sides report are reconciled via `propagate`.
    // NOTE: `delta.diff` is content-only (it excludes marks), so cursor marks present on `a` at bind
    // time are NOT transferred to `b` here; marks ride only on subsequent live `applyA`/`applyB`.
    // Wrapped in the mutex so these `applyDelta` calls don't echo back through the listeners above.
    this._mux(() => {
      const tres = this.t.applyA(this.a.toDelta())
      const fa = tres.a ? this.a.applyDelta(tres.a) : null
      const diffB = tres.b ? delta.diff(/** @type {delta.DeltaAny} */ (this.b.toDelta()), tres.b) : null
      const fb = diffB ? this.b.applyDelta(diffB) : null
      propagate(this, fa, fb)
    })
  }

  /**
   * Tear the binding down: unsubscribe both sides' `'delta'` and `'destroy'` listeners so changes are no
   * longer propagated. Call this when you no longer need the two RDTs kept in sync. It is also invoked
   * automatically when either bound RDT emits `'destroy'`. The RDTs themselves are NOT destroyed.
   */
  destroy = () => {
    this.a.off('destroy', this.destroy)
    this.b.off('destroy', this.destroy)
    this.a.off('delta', this._achanged)
    this.b.off('delta', this._bchanged)
  }
}

/**
 * Connect two RDTs through a transformer template. Changes on `a` are mapped onto `b` and vice versa.
 * Without a `template` the {@link dt.id identity} transformer is used, keeping both sides equal. Call
 * {@link Binding#destroy} on the returned binding to stop syncing (it also self-destroys when either RDT
 * emits `'destroy'`).
 *
 * @template {import('./delta.js').DeltaAny} DeltaA
 * @param {RDT<DeltaA>} a
 * @param {RDT<import('./delta.js').DeltaAny>} b
 * @param {dt.Template} [template]
 * @return {Binding<DeltaA>}
 */
export const bind = (a, b, template) => new Binding(a, b, template)
