/**
 * # In-memory delta RDT
 *
 * {@link deltaRDT} creates an RDT (see `../binding.js`) whose state is simply the accumulated delta.
 * Calling `applyDelta` merges the incoming delta into `state` and re-emits it as a `'delta'` event, so
 * it can be bound to any other RDT.
 *
 * @module delta/rdt/delta
 */

import { ObservableV2 } from '../../observable.js'
import * as delta from '../delta.js'
import * as mux from '../../mutex.js'

/**
 * @template T
 * @typedef {import('../../schema.js').Schema<T>} Schema
 */

/**
 * @template {delta.DeltaAny} D
 * @typedef {import('../binding.js').RDT<D>} RDT
 */

/**
 * An in-memory RDT whose state is the accumulated delta. Calling `applyDelta` merges the incoming delta
 * into `state` (via {@link delta.DeltaBuilder#apply}) and re-emits it as a `'delta'`.
 *
 * @template {delta.DeltaAny} D
 * @implements {RDT<D>}
 * @extends {ObservableV2<{ delta: (delta: D) => void, destroy: (rdt: DeltaRDT<D>) => void }>}
 */
class DeltaRDT extends ObservableV2 {
  /**
   * @param {Schema<D>} $delta schema of the deltas this RDT produces
   */
  constructor ($delta) {
    super()
    this.$delta = $delta
    /**
     * @type {delta.DeltaBuilderAny?}
     */
    this.state = null
    this._mux = mux.createMutex()
  }

  /**
   * Merge an incoming delta into the current state and notify observers.
   *
   * @param {D} d
   */
  applyDelta (d) {
    d.isEmpty() || this._mux(() => {
      if (this.state != null) {
        this.state.apply(d)
      } else {
        this.state = delta.clone(d)
      }
      this.emit('delta', [d])
    })
  }

  /**
   * The current state as a delta: the accumulated `state`, or an empty delta when nothing has been
   * applied yet.
   *
   * @return {D}
   */
  toDelta () {
    return /** @type {any} */ (this.state ?? delta.create(this.$delta))
  }

  destroy () {
    this.emit('destroy', [this])
    super.destroy()
  }
}

/**
 * Create a {@link DeltaRDT} for deltas described by `$delta`.
 *
 * @template {delta.DeltaAny} D
 * @param {Schema<D>} $delta
 */
export const deltaRDT = $delta => new DeltaRDT($delta)
