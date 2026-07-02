/**
 * # Replicated Data Types (RDTs) and bindings
 *
 * An **RDT** ("replicated data type") is any object that represents some state and communicates changes
 * to that state as {@link import('./delta.js').Delta deltas}. Every RDT is an
 * {@link import('../observable.js').ObservableV2 observable}:
 * - it **emits** a `'delta'` event carrying a delta and its {@link RDT origin} whenever its own state
 *   changes, and
 * - it **accepts** foreign changes through `applyDelta(delta, origin)`, which mutates its state to match.
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
 * On creation a binding first **synchronizes the initial state**: `a`'s current state (`a.delta`)
 * is projected through the transformer, and the projection is diffed against `b`'s current state
 * (`b.delta`); the resulting difference is applied to `b` so it matches `a`'s projection (and any
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
import * as s from '../schema.js'

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
 * transformer for it), exposes its current state as a delta via the `delta` getter, and accepts foreign
 * deltas via `applyDelta`.
 *
 * `applyDelta(d, origin)` applies `d` and then, if the change would violate the RDT's own invariants,
 * applies a **fix** of its own (e.g. reversing part of `d`, or inserting missing content) and returns
 * that fix — `null` when none was needed. The fix is a regular change on this RDT, so a {@link Binding}
 * maps it onto the other side just like any other change. `applyDelta` also emits the *effective* change
 * (`d` together with the fix) on the `'delta'` channel.
 *
 * ## Origins
 *
 * Every `'delta'` event carries a second argument, `origin` — an opaque `any` value (modelled after
 * {@link https://docs.yjs.dev/api/transactions Yjs transaction origins}) that identifies **where the
 * change came from**. Whoever produces the change sets it, and it is usually the producing instance
 * itself: a communication provider, an editor binding, or the {@link Binding} that mapped the change
 * over from the other side. A change an RDT observes locally (e.g. a `MutationObserver` firing on a DOM
 * edit) uses that RDT itself as the origin.
 *
 * Origins let a listener tell **its own** changes apart from foreign ones so it can skip the ones it
 * already knows about — a change it produced is not looped back to where it came from. The canonical use
 * is a network provider: it tags every remote update it applies with itself (`rdt.applyDelta(update,
 * this)`) and then ignores `'delta'` events whose `origin === this`, so it never re-broadcasts an update
 * it just received. The `origin` argument to `applyDelta` is optional and defaults to `null` (an
 * anonymous/local change); the emitted event always carries whatever value was supplied.
 *
 * ## `Delta` vs `DeltaBuilder`
 *
 * The interface is parameterized by a {@link import('./delta.js').DeltaConf DeltaConf} (like a
 * {@link import('./transformer.js').Transformer transformer}). Almost everything it exposes is the
 * *read* form — {@link import('./delta.js').Delta Delta} — because those values are **shared** and must
 * not be mutated in place: `$delta` is the delta schema, the `delta` getter returns a state snapshot,
 * `applyDelta` reads a change into the RDT, and the `'delta'` event payload is broadcast to every
 * listener. The one *owned, mutable* form — {@link import('./delta.js').DeltaBuilder DeltaBuilder} — is
 * the fix `applyDelta` returns to the {@link Binding}. The binding never mutates a shared read delta: it
 * {@link import('./delta.js').cloneDeep deep-clones} every change into a private builder before the
 * transformer rebases it (transformers manipulate deltas in place — see {@link Binding}).
 *
 * @template {import('./delta.js').DeltaConf} Conf
 * @typedef {import('../observable.js').ObservableV2<{ delta: (delta: delta.Delta<Conf>, origin: any) => void, destroy: (rdt: RDT<Conf>) => void }> & {
 *   $delta: Schema<delta.Delta<Conf>>,
 *   delta: delta.Delta<Conf>,
 *   applyDelta: (delta: delta.Delta<Conf>, origin?: any) => delta.DeltaBuilder<Conf> | null,
 *   destroy: () => void
 * }} RDT
 */

/**
 * Schema guard for any {@link RDT}. RDTs are **duck-typed** — they have several independent
 * implementations (`deltaRDT`, `domRDT`, …) and no common constructor — so this matches by shape
 * rather than by `instanceof`: an object exposing a `$delta` {@link Schema}, an `applyDelta` method,
 * and the observable `on`/`destroy` channel. The (possibly expensive) `delta` getter is not invoked.
 *
 * @type {Schema<RDT<any>>}
 */
export const $rdt = /** @type {Schema<RDT<any>>} */ (/* @__PURE__ */ s.$custom(o =>
  o != null &&
  s.$$schema.check(o.$delta) &&
  typeof o.applyDelta === 'function' &&
  typeof o.on === 'function' &&
  typeof o.destroy === 'function'
))

/**
 * Propagate a pair of concurrent changes between the two sides of `binding` until they converge.
 *
 * `ta` / `tb` are changes that have ALREADY been applied to `a` / `b` (an incoming `'delta'`, or a fix
 * returned by a previous `applyDelta`). Each is mapped onto the other side via the transformer —
 * `apply` rebases the two against each other — and the mapped results are applied, which may yield
 * further RDT fixes. We repeat until neither side reports a fix. Every change it applies to either side
 * uses the `binding` itself as its {@link RDT origin} — from each side's perspective the binding is what
 * produced the mapped change.
 *
 * `ta`/`tb` are shared read deltas (an event payload, or a fix that was also written into the producing
 * RDT's state), so they are {@link delta.cloneDeep deep-cloned} into private builders before the
 * transformer — which rebases its inputs in place — touches them (see {@link Binding}).
 *
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @param {Binding<A,B>} binding
 * @param {any} ta change already applied on `a` — a shared read delta (event payload or a fix), or `null`
 * @param {any} tb change already applied on `b` — a shared read delta (event payload or a fix), or `null`
 */
const propagate = (binding, ta, tb) => {
  while ((ta != null && !ta.isEmpty()) || (tb != null && !tb.isEmpty())) {
    const tres = binding.t.apply(dt.createTransformResult(
      ta != null ? delta.cloneDeep(ta) : null,
      tb != null ? delta.cloneDeep(tb) : null
    ))
    ta = tres.a != null ? binding.a.applyDelta(tres.a, binding) : null
    tb = tres.b != null ? binding.b.applyDelta(tres.b, binding) : null
  }
}

/**
 * Connects two RDTs so that changes on either side are transformed and reflected on the other.
 *
 * The {@link dt.Transformer transformer} it drives **manipulates deltas in place** (it splices op lists
 * and rebases nodes directly, rather than only via `apply`/`rebase`) — a deliberate exception to the
 * general rule that deltas are edited through `apply`/`rebase`. Consequently every change handed to it
 * must be a privately-owned, fully-mutable delta, so the binding {@link delta.cloneDeep deep-clones}
 * each incoming change (which is a shared read delta — an event payload or a snapshot) before the
 * transformer touches it. See the initial-state sync below and {@link propagate}.
 *
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 */
export class Binding {
  /**
   * @param {RDT<A>} a
   * @param {RDT<B>} b
   * @param {dt.TemplateFactory<A,B>} [template] a `$d => Template` factory; defaults to the
   * {@link dt.id identity} transformer. `bind` injects `a`'s schema, then materializes via `.init()`.
   */
  constructor (a, b, template = /** @type {dt.TemplateFactory<A,B>} */ (dt.id)) {
    /**
     * @type {dt.Transformer<A,B>}
     */
    this.t = template(a.$delta).init()
    /**
     * @type {RDT<A>}
     */
    this.a = a
    /**
     * @type {RDT<B>}
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
      // `a.delta` is a shared read snapshot (for an in-memory RDT it IS the live state, whose nested
      // children are frozen `done`), so DEEP-clone it into a private, fully-mutable builder before the
      // transformer — which rebases its input in place — projects it. A shallow `clone` would still share
      // those frozen children and corrupt / fail on the live state (see `delta.cloneDeep`).
      const tres = this.t.applyA(delta.cloneDeep(this.a.delta))
      const fa = tres.a ? this.a.applyDelta(tres.a, this) : null
      // `diff` shares nested children with `tres.b` by default, and `tres.b` is a (possibly stateful)
      // transformer's output that may still alias its internal state — so `clone` keeps the diff
      // independent, since it is then applied into `b` (which freezes it) and propagated onward.
      const diffB = tres.b ? delta.diff(this.b.delta, tres.b, { clone: true }) : null
      const fb = diffB ? this.b.applyDelta(diffB, this) : null
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
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @param {RDT<A>} a
 * @param {RDT<B>} b
 * @param {dt.TemplateFactory<A,B>} [template] a `$d => Template` factory (e.g. `dt.id` or
 * `$d => dt.renameAttrs($d, {a:'b'})`)
 * @return {Binding<A,B>}
 */
export const bind = (a, b, template) => new Binding(a, b, template)
