/**
 * # In-memory delta RDT
 *
 * {@link deltaRDT} creates an RDT (see `../rdt.js`) whose state is the accumulated delta. Calling
 * `applyDelta(delta, origin)` merges the incoming delta into `state` and re-emits it (with the given
 * {@link import('../rdt.js').RDT origin}) as a `'delta'` event, so it can be bound to any other RDT. It
 * accepts every valid delta as-is, so it never returns a fix.
 *
 * `state` is kept as a **final** delta (`isFinal`): it represents the current document, so a `delete`
 * or `deleteAttr` removes the content/attribute outright instead of accumulating a delete-op marker.
 * The `delta` getter therefore always returns a clean insert-only document.
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
 * @template {delta.DeltaConf} Conf
 * @typedef {import('../rdt.js').RDT<Conf>} RDT
 */

/**
 * An in-memory RDT whose state is the accumulated delta. Calling `applyDelta` merges the incoming delta
 * into `state` (via {@link delta.DeltaBuilder#apply}) and re-emits it as a `'delta'`.
 *
 * @template {delta.DeltaConf} Conf
 * @implements {RDT<Conf>}
 * @extends {ObservableV2<{ delta: (delta: delta.Delta<Conf>, origin: any) => void, destroy: (rdt: DeltaRDT<Conf>) => void }>}
 */
class DeltaRDT extends ObservableV2 {
  /**
   * @param {Schema<delta.Delta<Conf>>} $delta schema of the deltas this RDT produces
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
   * Merge an incoming delta into the current state and notify observers. Always returns `null`: this
   * RDT accepts every valid delta unchanged, so it never produces a fix.
   *
   * @param {delta.Delta<Conf>} d
   * @param {any} [origin] who produced the change; forwarded verbatim on the emitted `'delta'` event so
   * listeners can recognise (and skip) changes they made themselves — see {@link RDT} “Origins”. Defaults
   * to `null` (an anonymous/local change).
   * @return {null}
   */
  applyDelta (d, origin = null) {
    if (d.isEmpty()) return null
    this._mux(() => {
      if (this.state == null) {
        // start from an empty *final* document (see module doc) so deletes/deleteAttrs — even in the
        // very first delta — remove content instead of leaving delete-op markers
        this.state = delta.create(d.name)
        this.state.isFinal = true
      }
      this.state.apply(d) // `final` defaults to `state.isFinal`, so deletes clean up the state
    })
    // emit AFTER releasing the mutex. When bound to a fix-producing RDT, that side's fix is mapped
    // back here and applied via a synchronous re-entrant `applyDelta` while this call is still on the
    // stack; with the emit inside the mutex that re-entrant mutation would be dropped. The binding's
    // own mutex still breaks the echo loop. `d` is emitted as a shared read delta (the RDT only read it
    // into `state`); a consumer that needs to mutate it deep-clones it first (see the `RDT` typedef).
    this.emit('delta', [d, origin])
    return null
  }

  /**
   * The current state as a delta: the accumulated `state`, or an empty delta when nothing has been
   * applied yet.
   *
   * @return {delta.Delta<Conf>}
   */
  get delta () {
    // `state` is a loosely-typed `DeltaBuilderAny`; narrow it to this RDT's read `Delta<Conf>` view.
    return /** @type {delta.Delta<Conf>} */ (/** @type {unknown} */ (this.state ?? delta.create(this.$delta)))
  }

  destroy () {
    this.emit('destroy', [this])
    super.destroy()
  }
}

/**
 * Create a {@link DeltaRDT} for deltas described by `$delta`.
 *
 * @template {delta.DeltaConf} Conf
 * @param {Schema<delta.Delta<Conf>>} $delta
 */
export const deltaRDT = $delta => new DeltaRDT($delta)
