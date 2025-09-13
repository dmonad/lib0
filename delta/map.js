import * as gmap from '../map.js'
import * as fun from '../function.js'
import * as traits from '../traits.js'
import * as s from '../schema.js'
import * as ops from './ops.js'
import { AbstractDelta, mergeAttrs, $delta } from './abstract.js'

export const $mapJson = s.$record(s.$string, ops.$deltaMapChangeJson)

/**
 * @template {{ [key:string]: ops.DeltaMapOps }} OPS
 * @typedef {{ [K in keyof OPS]: (Extract<OPS[K],ops.MapInsertOp<any>> extends ops.MapInsertOp<infer V,any> ? ops.MapInsertOp<V, K> : never) | (Extract<OPS[K],ops.MapDeleteOp<any>> extends ops.MapDeleteOp<infer V,any> ? ops.MapDeleteOp<V,K> : never) | (Extract<OPS[K],ops.MapModifyOp<any>> extends ops.MapModifyOp<infer V,any> ? (ops.MapModifyOp<V,K>&OPS[K]) : never) }[keyof OPS]} KeyedOps */

/**
 * @template {{ [key: string]: any }} [Vals={[key:string]:any}]
 * @extends AbstractDelta
 */
export class DeltaMap extends AbstractDelta {
  /**
   * @param {s.$Schema<Vals>} $vals
   */
  constructor ($vals) {
    super()
    this.$vals = $vals
    /**
     * @type {Map<any,ops.DeltaMapOps>}
     */
    this._changes = gmap.create()
    /**
     * @type {import('./abstract.js').Attribution?}
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
   * @template {Vals} ValsX
   * @param {null|((op:KeyedOps<MapOpsFromValues<ValsX>>)=>void)} changeHandler
   * @param {null|((insertOp:Extract<KeyedOps<MapOpsFromValues<ValsX>>,ops.MapInsertOp<any,any>>)=>void)} insertHandler
   * @param {null|((deleteOp:Extract<KeyedOps<MapOpsFromValues<ValsX>>,ops.MapDeleteOp<any,any>>)=>void)} deleteHandler
   * @param {null|((modifyOp:Extract<KeyedOps<MapOpsFromValues<ValsX>>,ops.MapModifyOp<any,any>>)=>void)} modifyHandler
   */
  forEach (changeHandler = null, insertHandler = null, deleteHandler = null, modifyHandler = null) {
    this._changes.forEach((change) => {
      changeHandler?.(/** @type {any} */ (change))
      switch (change.constructor) {
        case ops.MapDeleteOp:
          deleteHandler?.(/** @type {any} */ (change))
          break
        case ops.MapInsertOp:
          insertHandler?.(/** @type {any} */ (change))
          break
        case ops.MapModifyOp:
          modifyHandler?.(/** @type {any} */ (change))
          break
      }
    })
  }

  /**
   * @template {keyof Vals} K
   * @param {K} key
   * @return {MapOpsFromValues<Vals>[K] | undefined}
   */
  get (key) {
    return /** @type {(MapOpsFromValues<Vals>[K] & { key:K })|undefined} */ (this._changes.get(key))
  }

  /**
   * @param {keyof Vals} key
   */
  has (key) {
    return this._changes.has(key)
  }

  /**
   * @param {DeltaMap<any>} other
   * @return {boolean}
   */
  equals (other) {
    return this[traits.EqualityTraitSymbol](other)
  }

  /**
   * @return {s.Unwrap<$mapJson>}
   */
  toJSON () {
    /**
     * @type {s.Unwrap<$mapJson>}
     */
    const changes = {}
    this._changes.forEach((change, key) => {
      changes[/** @type {string} */ (key)] = change.toJSON()
    })
    return changes
  }

  /**
   * @param {DeltaMap<Vals>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this._changes, other._changes)
  }
}

/**
 * @template {s.$Schema<{ [Key:string]: ops.DeltaMapOps }>} OPS
 * @template {keyof s.Unwrap<OPS>} K
 * @param {OPS} $ops
 * @param {K} k
 * @return {s.$Schema<s.Unwrap<OPS>[K]>}
 */
const valsKeySchema = ($ops, k) => s.$$object.check($ops) ? ($ops.shape[k] || s.$never) : ((s.$$record.check($ops) && $ops.shape.keys.check(k)) ? ($ops.shape.values) : s.$never)

/**
 * @template {{ [key: string]: any }} Vals
 * @extends DeltaMap<Vals>
 */
export class DeltaMapBuilder extends DeltaMap {
  /**
   * @template {keyof Vals} K
   * @param {K} key
   * @param {Extract<Vals[K], AbstractDelta>} delta
   */
  modify (key, delta) {
    this._changes.set(key, /** @type {any} */ (new ops.MapModifyOp(key, valsKeySchema(this.$vals, key).cast(delta))))
    return this
  }

  /**
   * @template {keyof Vals} K
   * @param {K} key
   * @param {Vals[K]} newVal
   * @param {Vals[K]|undefined} prevValue
   * @param {import('./abstract.js').Attribution?} attribution
   */
  set (key, newVal, prevValue = undefined, attribution = null) {
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    const $v = valsKeySchema(this.$vals, key)
    this._changes.set(key, /** @type {any} */ (new ops.MapInsertOp(key, $v.cast(newVal), prevValue && $v.cast(prevValue), mergedAttribution)))
    return this
  }

  /**
   * @param {import('./abstract.js').Attribution?} attribution
   * @param {Partial<Vals>} kv
   */
  setMany (kv, attribution = null) {
    for (const key in kv) {
      this.set(key, /** @type {Vals[any]} */ (kv[key]), undefined, attribution)
    }
    return this
  }

  /**
   * @template {keyof Vals} K
   * @param {K} key
   * @param {Vals[K]|undefined} prevValue
   * @param {import('./abstract.js').Attribution?} attribution
   */
  delete (key, prevValue = undefined, attribution = null) {
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    this._changes.set(key, /** @type {any} */ (new ops.MapDeleteOp(key, prevValue === undefined ? prevValue : valsKeySchema(this.$vals, key).cast(prevValue), mergedAttribution)))
    return this
  }

  /**
   * @param {import('./abstract.js').Attribution?} attribution
   */
  useAttribution (attribution) {
    this.usedAttribution = attribution
    return this
  }

  /**
   *
   * - insert vs delete ⇒ insert takes precedence
   * - insert vs modify ⇒ insert takes precedence
   * - insert vs insert ⇒ priority decides
   * - delete vs modify ⇒ delete takes precedence
   * - delete vs delete ⇒ current delete op is removed because item has already been deleted
   * - modify vs modify ⇒ rebase using priority
   *
   * @param {DeltaMapBuilder<Vals>} other
   * @param {boolean} priority
   */
  rebase (other, priority) {
    this.forEach(null,
      insertOp => {
        if (other.get(insertOp.key)?.constructor === ops.MapInsertOp && !priority) {
          this._changes.delete(insertOp.key)
        }
      },
      deleteOp => {
        const otherOp = other.get(deleteOp.key)
        if (otherOp?.constructor === ops.MapInsertOp) {
          this._changes.delete(otherOp.key)
        }
      },
      modifyOp => {
        const otherOp = other.get(modifyOp.key)
        if (otherOp == null) {
          // nop
        } else if (otherOp.constructor === ops.MapModifyOp) {
          modifyOp.value.rebase(otherOp.value, priority)
        } else {
          this._changes.delete(otherOp.key)
        }
      }
    )
  }

  /**
   * @param {DeltaMap<Vals>} other
   */
  apply (other) {
    other.forEach(op => {
      const c = this._changes.get(op.key)
      if (ops.$modifyOp.check(op)) {
        if ($delta.check(c?.value)) {
          /** @type {DeltaMapBuilder<any>} */ (c.value).apply(op.value)
        } else {
          // then this is a simple modify
          this._changes.set(op.key, /** @type {any} */ (op))
        }
      } else {
        op.prevValue = c?.value
        this._changes.set(op.key, /** @type {any} */ (op))
      }
    })
  }

  /**
   * @return {this}
   */
  clone () {
    const d = /** @type {this} */ (new DeltaMapBuilder(this.$vals))
    this.forEach(change => {
      d._changes.set(change.key, /** @type {any} */ (change))
    })
    d.origin = this.origin
    d.isDiff = this.isDiff
    return d
  }

  done () {
    return /** @type {DeltaMap<Vals>} */ (this)
  }
}

/**
 * @template {{ [key:string]: any }} Vals
 * @typedef {{ [K in keyof Vals]: Vals[K] extends DeltaMap<infer DM> ? ops.MapInsertOp<Vals[K]>|ops.MapDeleteOp<Vals[K]>|ops.MapModifyOp<DeltaMap<DM>> : ops.MapInsertOp<Vals[K]>|ops.MapDeleteOp<Vals[K]> }} MapOpsFromValues
 */

/**
 * Create a new DeltaMap, optionally supply a schema.
 *
 * @template {s.$Schema<{ [key:string]: any }> | { [key:string]: s.$Schema<any> }} [$Vals=s.$Schema<{ [key:string]: any }>]
 * @param {$Vals} $vals
 * @return {DeltaMapBuilder<$Vals extends s.$Schema<infer $V> ? $V : (s._ObjectDefToSchema<$Vals> extends s.$Schema<infer $V> ? $V : never)>}
 */
export const map = ($vals = /** @type {any} */ (s.$record(s.$string, s.$any))) => /** @type {any} */ (new DeltaMapBuilder(/** @type {any} */ (s.$$schema.check($vals) ? $vals : s.$object($vals))))

/**
 * @template {{ [key:string]: any }} Vals
 * @param {s.$Schema<Vals>} $vals
 * @return {s.$Schema<DeltaMap<Vals>>}
 */
export const $map = $vals => /** @type {any} */ (s.$instanceOf(DeltaMap, o => $vals.extends(o.$vals)))
export const $mapAny = s.$instanceOf(DeltaMap)
