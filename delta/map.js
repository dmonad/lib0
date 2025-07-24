import * as map from 'lib0/map'
import * as fun from 'lib0/function'
import * as traits from 'lib0/traits'
import * as s from 'lib0/schema'
import { $attribution, AbstractDelta, mergeAttrs } from './abstract.js'

/**
 * @template V
 */
class MapInsertOp {
  /**
   * @param {V} value
   * @param {V|undefined} prevValue
   * @param {s.TypeOf<$attribution>?} attribution
   */
  constructor (value, prevValue, attribution) {
    this.prevValue = prevValue
    this.attribution = attribution
    this.value = value
  }

  /**
   * @return {'insert'}
   */
  get type () { return 'insert' }

  toJSON () {
    return {
      type: this.type,
      value: this.value,
      prevValue: this.prevValue,
      attribution: this.attribution
    }
  }

  /**
   * @param {MapInsertOp<V>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.value, other.value) && fun.equalityDeep(this.prevValue, other.prevValue) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

/**
 * @template V
 */
class MapDeleteOp {
  /**
   * @param {V|undefined} prevValue
   * @param {s.TypeOf<$attribution>?} attribution
   */
  constructor (prevValue, attribution) {
    this.prevValue = prevValue
    this.attribution = attribution
  }

  get value () { return undefined }

  /**
   * @type {'delete'}
   */
  get type () { return 'delete' }

  toJSON () {
    return {
      type: this.type,
      prevValue: this.prevValue,
      attribution: this.attribution
    }
  }

  /**
   * @param {MapDeleteOp<V>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.prevValue, other.prevValue) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

/**
 * @template {AbstractDelta} Modifiers
 */
class MapModifyOp {
  /**
   * @param {Modifiers} delta
   */
  constructor (delta) {
    /**
     * @type {Modifiers}
     */
    this.modify = delta
  }

  get value () { return undefined }

  /**
   * @type {'modify'}
   */
  get type () { return 'modify' }

  toJSON () {
    return {
      type: this.type,
      modify: this.modify.toJSON()
    }
  }

  /**
   * @param {MapModifyOp<Modifiers>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.modify[traits.EqualityTraitSymbol](other.modify)
  }
}

export const $deleteOp = s.$constructedBy(MapDeleteOp)

/**
 * @template T
 * @param {s.$Schema<T>} $value
 * @return {s.$Schema<MapInsertOp<T>>}
 */
export const $insertOp = ($value) => /** @type {s.$Schema<MapInsertOp<T>>} */ (s.$constructedBy(MapInsertOp, o => $value.check(o.value)))

/**
 * @template {AbstractDelta} T
 * @param {s.$Schema<T>} $modifier
 * @return {s.$Schema<MapModifyOp<T>>}
 */
export const $modifyOp = ($modifier) => /** @type {s.$Schema<MapModifyOp<T>>} */ (s.$constructedBy(MapModifyOp, o => $modifier.check(o.value)))

export const $anyOp = s.$union($insertOp(s.$any),$deleteOp)

export const $mapDeltaChangeJson = s.$union(
  s.$object({ type: s.$literal('insert'), value: s.$any, prevValue: s.$any.optional, attribution: $attribution.nullable.optional }),
  s.$object({ type: s.$literal('delete'), prevValue: s.$any.optional, attribution: $attribution.nullable.optional }),
  s.$object({ type: s.$literal('modify'), modify: s.$any })
)

export const $mapDeltaJson = s.$record(s.$string, $mapDeltaChangeJson)

/**
 * @template {{ [key:string]: s.Unwrap<$anyOp> }} OPS
 */
export class MapDelta extends AbstractDelta {
  /**
   * @param {s.$Schema<OPS>} $ops
   */
  constructor ($ops) {
    super()
    /**
     * @type {$ops}
     */
    this.$ops = $ops
    /**
     * @type {Map<keyof OPS,OPS[keyof OPS]>}
     */
    this.changes = map.create()
    /**
     * @type {s.Unwrap<$attribution>?}
     */
    this.usedAttribution = null
  }

  /**
   *
   * Iterate through the changes. There are two approches to iterate through changes. The
   * following two examples achieve the same thing:
   *
   * @example
   *   d.forEach((op, index) => {
   *     if (op instanceof delta.InsertArrayOp) {
   *       op.insert
   *     } else if (op instanceof delta.RetainOp ) {
   *       op.retain
   *     } else if (op instanceof delta.DeleteOp) {
   *       op.delete
   *     } else if (op instanceof delta.ModifyOp) {
   *       op.modify
   *     }
   *   })
   *
   * The second approach doesn't require instanceof checks.
   *
   * @example
   *   d.forEach(null,
   *     (insertOp, index) => insertOp.insert,
   *     (retainOp, index) => insertOp.retain
   *     (deleteOp, index) => insertOp.delete
   *     (modifyOp, index) => insertOp.modify
   *   )
   *
   * @param {null|(<K extends keyof OPS>(change:OPS[K],key:K)=>void)} changeHandler
   * @param {null|(<K extends keyof OPS>(insertOp:OPS[K] & MapInsertOp<any>,key:K)=>void)} insertHandler
   * @param {null|(<K extends keyof OPS>(deleteOp:OPS[K] & MapDeleteOp<any>,key:K)=>void)} deleteHandler
   * @param {null|(<K extends keyof OPS>(modifyOp:OPS[K] & MapModifyOp<any>,key:K)=>void)} modifyHandler
   */
  forEach (changeHandler = null, insertHandler = null, deleteHandler = null, modifyHandler = null) {
    this.changes.forEach((change, key) => {
      changeHandler?.(change, key)
      switch (change.constructor) {
        case MapDeleteOp:
          deleteHandler?.(/** @type {OPS[keyof OPS] & MapDeleteOp<any>} */ (change), key)
          break
        case MapInsertOp:
          insertHandler?.(/** @type {OPS[keyof OPS] & MapInsertOp<any>} */ (change), key)
          break
        case MapModifyOp:
          modifyHandler?.(/** @type {OPS[keyof OPS] & MapModifyOp<any>} */ (change), key)
          break
      }
    })
  }

  /**
   * @template {keyof OPS} K
   * @param {K} key
   * @return {OPS[K] | undefined}
   */
  get (key) {
    return /** @type {OPS[K]|undefined} */ (this.changes.get(key))
  }

  /**
   * @param {keyof OPS} key
   */
  has (key) {
    return this.changes.has(key)
  }

  /**
   * @param {MapDelta<OPS>} other
   * @return {boolean}
   */
  equals (other) {
    return this[traits.EqualityTraitSymbol](other)
  }

  /**
   * @return {s.Unwrap<$mapDeltaJson>}
   */
  toJSON () {
    /**
     * @type {s.Unwrap<$mapDeltaJson>}
     */
    const changes = {}
    this.changes.forEach((change, key) => {
      changes[/** @type {string} */ (key)] = change.toJSON()
    })
    return changes
  }

  /**
   * Preferred way to iterate through changes.
   *
   * @return {IterableIterator<{ [K in keyof OPS]: [K, OPS[K]] }[keyof OPS]>}
   */
  [Symbol.iterator] () {
    return this.changes.entries()
  }

  /**
   * @param {MapDelta<OPS>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.changes, other.changes)
  }

  /**
   * @return {MapDelta<OPS>}
   */
  done () {
    return this
  }
}

/**
 * @template {{ [key:string]: s.Unwrap<$anyOp> }} OPS
 * @extends MapDelta<OPS>
 */
export class MapDeltaBuilder extends MapDelta {
  /**
   * @param {keyof OPS} key
   * @param {OPS[key] extends MapModifyOp<infer D> ? D : never} delta
   */
  modify (key, delta) {
    this.changes.set(key, /** @type {OPS[keyof OPS] & MapModifyOp<any>} */ (new MapModifyOp(delta)))
    return this
  }

  /**
   * @template {keyof OPS} K
   * @param {K} key
   * @param {OPS[K] extends MapInsertOp<infer V> ? V : never} newVal
   * @param {(OPS[K] extends MapInsertOp<infer V> ? V : never)|undefined} prevValue
   * @param {s.Unwrap<$attribution>?} attribution
   */
  set (key, newVal, prevValue = undefined, attribution = null) {
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    const op = new MapInsertOp(newVal, prevValue, mergedAttribution)
    this.changes.set(key, /** @type {OPS[keyof OPS]} */ (op))
    return this
  }

  /**
   * @param {keyof OPS} key
   * @param {(OPS[key] extends MapInsertOp<infer V> ? V : never) | undefined} prevValue
   * @param {s.Unwrap<$attribution>?} attribution
   */
  delete (key, prevValue = undefined, attribution = null) {
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    this.changes.set(key, /** @type {OPS[keyof OPS]} */ (new MapDeleteOp(prevValue, mergedAttribution)))
    return this
  }

  /**
   * @param {s.Unwrap<$attribution>?} attribution
   */
  useAttribution (attribution) {
    this.usedAttribution = attribution
    return this
  }
}

/**
 * @template {{ [key:string]: s.Unwrap<$anyOp> }} OPS
 * @param {s.$Schema<OPS>} $ops
 * @return {MapDeltaBuilder<OPS>}
 */
export const create = $ops => new MapDeltaBuilder($ops)

