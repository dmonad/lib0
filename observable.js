
import * as map from './map.js'
import * as set from './set.js'

/**
 * Handles named events.
 *
 * @template N
 */
export class Observable {
  constructor () {
    /**
     * @type {Map<N, any>}
     */
    this._observers = map.create()
  }

  /**
   * @param {N} name
   * @param {function} f
   */
  on (name, f) {
    map.setIfUndefined(this._observers, name, set.create).add(f)
  }

  /**
   * @param {N} name
   * @param {function} f
   */
  once (name, f) {
    /**
     * @param  {...any} args
     */
    const _f = (...args) => {
      this.off(name, f)
      f(...args)
    }
    this.on(name, _f)
  }

  /**
   * @param {N} name
   * @param {function} f
   */
  off (name, f) {
    const observers = this._observers.get(name)
    if (observers !== undefined) {
      observers.delete(f)
      if (observers.size === 0) {
        this._observers.delete(name)
      }
    }
  }

  /**
   * Emit a named event. All registered event listeners that listen to the
   * specified name will receive the event.
   *
   * @param {N} name The event name.
   * @param {Array} args The arguments that are applied to the event listener.
   */
  emit (name, args) {
    // @ts-ignore
    return (this._observers.get(name) || map.create()).forEach(f => f(...args))
  }

  destroy () {
    this._observers = map.create()
  }
}
