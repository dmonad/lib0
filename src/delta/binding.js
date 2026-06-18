/**
 * # Bindings between Replicated Data Types (RDTs)
 *
 * An **RDT** ("replicated data type") is any object that represents some state and communicates changes
 * to that state as {@link delta.Delta deltas}. Every RDT is an {@link ObservableV2}:
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
 * Two reference RDTs live in `./rdt/`:
 * - `./rdt/delta.js` ({@link RDT}) — an in-memory delta whose state is just the accumulated delta.
 * - `./rdt/dom.js` — a live DOM subtree, observed with a `MutationObserver`, that turns DOM mutations
 *   into deltas and applies incoming deltas back onto the DOM.
 *
 * @module delta/binding
 */

import { ObservableV2 } from '../observable.js' // eslint-disable-line no-unused-vars -- referenced only in JSDoc type annotations (RDT)
import * as delta from './delta.js' // eslint-disable-line no-unused-vars -- referenced only in JSDoc type annotations (DeltaAny)
import * as dt from './transformer.js'
import * as mux from '../mutex.js'

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
 * @template {delta.DeltaAny} D
 * @typedef {ObservableV2<{ delta: (delta: D) => void, destroy: (rdt: RDT<D>) => void }> & {
 *   $delta: Schema<D>,
 *   toDelta: () => D,
 *   applyDelta: (delta: D) => void,
 *   destroy: () => void
 * }} RDT
 */

/**
 * Connects two RDTs so that changes on either side are transformed and reflected on the other.
 *
 * @template {delta.DeltaAny} DeltaA
 */
export class Binding {
  /**
   * @param {RDT<DeltaA>} a
   * @param {RDT<delta.DeltaAny>} b
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
    this._achanged = this.a.on('delta', d => this._mux(() => {
      const tres = this.t.applyA(d)
      if (tres.a) this.a.applyDelta(tres.a)
      if (tres.b) this.b.applyDelta(tres.b)
    }))
    this._bchanged = this.b.on('delta', d => this._mux(() => {
      const tres = this.t.applyB(d)
      if (tres.b) this.b.applyDelta(tres.b)
      if (tres.a) this.a.applyDelta(tres.a)
    }))
    this.a.on('destroy', this.destroy)
    this.b.on('destroy', this.destroy)
  }

  destroy = () => {
    this.a.off('destroy', this.destroy)
    this.b.off('destroy', this.destroy)
    this.a.off('delta', this._achanged)
    this.b.off('delta', this._bchanged)
  }
}

/**
 * Connect two RDTs through a transformer template. Changes on `a` are mapped onto `b` and vice versa.
 * Without a `template` the {@link dt.id identity} transformer is used, keeping both sides equal.
 *
 * @template {delta.DeltaAny} DeltaA
 * @param {RDT<DeltaA>} a
 * @param {RDT<delta.DeltaAny>} b
 * @param {dt.Template} [template]
 */
export const bind = (a, b, template) => new Binding(a, b, template)
