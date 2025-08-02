import * as map from 'lib0/map'
import * as fun from 'lib0/function'
import * as traits from 'lib0/traits'
import * as s from 'lib0/schema'
import { $attribution, AbstractDelta, mergeAttrs } from './abstract.js'

/**
 * @template V
 * @template [K=string]
 */
class MapInsertOp {
  /**
   * @param {K} key
   * @param {V} value
   * @param {V|undefined} prevValue
   * @param {s.TypeOf<$attribution>?} attribution
   */
  constructor (key, value, prevValue, attribution) {
    /**
     * @type {K}
     */
    this.key = key
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
    return this.key === other.key && fun.equalityDeep(this.value, other.value) && fun.equalityDeep(this.prevValue, other.prevValue) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

/**
 * @template V
 * @template [K=string]
 */
class MapDeleteOp {
  /**
   * @param {K} key
   * @param {V|undefined} prevValue
   * @param {s.TypeOf<$attribution>?} attribution
   */
  constructor (key, prevValue, attribution) {
    /**
     * @type {K}
     */
    this.key = key
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
    return this.key === other.key && fun.equalityDeep(this.prevValue, other.prevValue) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

/**
 * @template {AbstractDelta} Modifiers
 * @template [K=string]
 */
class MapModifyOp {
  /**
   * @param {K} key
   * @param {Modifiers} delta
   */
  constructor (key, delta) {
    /**
     * @type {K}
     */
    this.key = key
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
    return this.key === other.key && this.modify[traits.EqualityTraitSymbol](other.modify)
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

export const $anyOp = s.$union($insertOp(s.$any), $deleteOp, $modifyOp(s.$any))

export const $deltaMapChangeJson = s.$union(
  s.$object({ type: s.$literal('insert'), value: s.$any, prevValue: s.$any.optional, attribution: $attribution.nullable.optional }),
  s.$object({ type: s.$literal('delete'), prevValue: s.$any.optional, attribution: $attribution.nullable.optional }),
  s.$object({ type: s.$literal('modify'), modify: s.$any })
)

export const $deltaMapJson = s.$record(s.$string, $deltaMapChangeJson)

/**
 * @template {{ [key:string]: s.Unwrap<$anyOp> }} OPS
 * @typedef {{ [K in keyof OPS]: (OPS[K] extends MapInsertOp<infer V,any> ? MapInsertOp<V, K> : never) | (OPS[K] extends MapDeleteOp<infer V,any> ? MapDeleteOp<V,K> : never) | (OPS[K] extends MapModifyOp<infer V,any> ? MapModifyOp<V,K> : never) }} KeyedOps
 */

/**
 * @template {{ [key:string]: s.Unwrap<$anyOp> }} OPS
 */
export class DeltaMap extends AbstractDelta {
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
   *   d.forEach(op => {
   *     if (op instanceof dmap.MapInsertOp) {
   *       console.log('content inserted:', op.key, op.value)
   *     } else if (op instanceof dmap.MapDeleteOp) {
   *       console.log('content deleted:', op.key, op.prevValue)
   *     } else if (op instanceof delta.MapModifyOp) {
   *       console.log('content was modified:', op.key, op.)
   *       op.modify
   *     }
   *   })
   *
   * The second approach doesn't require instanceof checks.
   *
   * @example
   *   d.forEach(null,
   *     (insertOp) => insertOp.insert,
   *     (retainOp) => insertOp.retain
   *     (deleteOp) => insertOp.delete
   *     (modifyOp) => insertOp.modify
   *   )
   *
   * @param {null|((change:KeyedOps<OPS>[keyof OPS])=>void)} changeHandler
   * @param {null|((change:KeyedOps<OPS>[keyof OPS] & MapInsertOp<any,any>)=>void)} insertHandler
   * @param {null|((change:KeyedOps<OPS>[keyof OPS] & MapDeleteOp<any,any>)=>void)} deleteHandler
   * @param {null|((change:KeyedOps<OPS>[keyof OPS] & MapModifyOp<any,any>)=>void)} modifyHandler
   */
  forEach (changeHandler = null, insertHandler = null, deleteHandler = null, modifyHandler = null) {
    this.changes.forEach((change) => {
      changeHandler?.(/** @type {any} */ (change))
      switch (change.constructor) {
        case MapDeleteOp:
          deleteHandler?.(/** @type {any} */ (change))
          break
        case MapInsertOp:
          insertHandler?.(/** @type {any} */ (change))
          break
        case MapModifyOp:
          modifyHandler?.(/** @type {any} */ (change))
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
    return /** @type {(OPS[K] & { key:K })|undefined} */ (this.changes.get(key))
  }

  /**
   * @param {keyof OPS} key
   */
  has (key) {
    return this.changes.has(key)
  }

  /**
   * @param {DeltaMap<OPS>} other
   * @return {boolean}
   */
  equals (other) {
    return this[traits.EqualityTraitSymbol](other)
  }

  /**
   * @return {s.Unwrap<$deltaMapJson>}
   */
  toJSON () {
    /**
     * @type {s.Unwrap<$deltaMapJson>}
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
   * @return {IterableIterator<KeyedOps<OPS>[keyof OPS]>}
   */
  [Symbol.iterator] () {
    return /** @type {IterableIterator<KeyedOps<OPS>[keyof OPS]>} */ (this.changes.entries())
  }

  /**
   * @param {DeltaMap<OPS>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.changes, other.changes)
  }
}

/**
 * @template {s.$Schema<{ [Key:string]: s.Unwrap<typeof $anyOp> }>} OPS
 * @template {keyof s.Unwrap<OPS>} K
 * @param {OPS} $ops
 * @param {K} k
 * @return {s.$Schema<s.Unwrap<OPS>[K]>}
 */
const opsKeySchema = ($ops, k) => s.$$object.check($ops) ? ($ops.shape[k] || s.$never) : ((s.$$record.check($ops) && $ops.shape.keys.check(k)) ? ($ops.shape.values) : s.$never)

/**
 * @template {{ [key:string]: s.Unwrap<$anyOp> }} OPS
 * @extends DeltaMap<OPS>
 */
export class DeltaMapBuilder extends DeltaMap {
  /**
   * @param {keyof OPS} key
   * @param {OPS[key] extends MapModifyOp<infer D> ? D : never} delta
   */
  modify (key, delta) {
    this.changes.set(key, opsKeySchema(this.$ops, key).cast(new MapModifyOp(key, delta)))
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
    this.changes.set(key, opsKeySchema(this.$ops, key).cast(new MapInsertOp(key, newVal, prevValue, mergedAttribution)))
    return this
  }

  /**
   * @param {keyof OPS} key
   * @param {(OPS[key] extends MapInsertOp<infer V> ? V : never) | undefined} prevValue
   * @param {s.Unwrap<$attribution>?} attribution
   */
  delete (key, prevValue = undefined, attribution = null) {
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    this.changes.set(key, /** @type {OPS[keyof OPS]} */ (new MapDeleteOp(key, prevValue, mergedAttribution)))
    return this
  }

  /**
   * @param {s.Unwrap<$attribution>?} attribution
   */
  useAttribution (attribution) {
    this.usedAttribution = attribution
    return this
  }

  done () {
    return /** @type {DeltaMap<OPS>} */ (this)
  }
}

/**
 * @template {{ [key:string]: s.Unwrap<$anyOp> }} OPS
 * @param {s.$Schema<OPS>} $ops
 * @return {DeltaMapBuilder<OPS>}
 */
export const create = $ops => new DeltaMapBuilder($ops)

/**
 * @param {s.$Schema<{ [key:string]: s.Unwrap<$anyOp> }>} $ops
 */
export const $deltaMap = $ops => s.$instanceOf(DeltaMap, o => traits.equals(o.$ops, $ops))
