import * as fun from '../function.js'
import * as traits from '../traits.js'
import * as s from '../schema.js'
import * as ops from './ops.js'
import { AbstractDelta } from './abstract.js'

/**
 * @template {any} Vals
 * @typedef {Vals extends AbstractDelta ? ops.MapInsertOp<Vals,''>|ops.MapDeleteOp<Vals,''>|ops.MapModifyOp<Extract<Vals,AbstractDelta>,''> : ops.MapInsertOp<Vals,''>|ops.MapDeleteOp<Vals,''>} ValueOpsFromValues
 */

/**
 * @template Vals
 * @extends {AbstractDelta}
 */
export class DeltaValue extends AbstractDelta {
  /**
   * @param {s.$Schema<Vals>} $vals
   */
  constructor ($vals) {
    super()
    this.$vals = $vals
    /**
     * @type {ValueOpsFromValues<Vals>?}
     */
    this.change = null
  }

  get () {
    return this.change
  }

  /**
   * @param {DeltaValue<Vals>} other
   * @return {boolean}
   */
  equals (other) {
    return this[traits.EqualityTraitSymbol](other)
  }

  /**
   * @param {DeltaValue<Vals>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.change, other.change)
  }
}

/**
 * @template Vals
 * @extends DeltaValue<Vals>
 */
export class DeltaValueBuilder extends DeltaValue {
  /**
   * @param {Extract<Vals, AbstractDelta>} delta
   */
  modify (delta) {
    this.change = /** @type {ValueOpsFromValues<Vals>} */ (new ops.MapModifyOp('', this.$vals.cast(delta)))
    return this
  }

  /**
   * @param {Vals} newVal
   * @param {Vals|undefined} prevValue
   * @param {import('./abstract.js').Attribution?} attribution
   */
  set (newVal, prevValue = undefined, attribution = null) {
    this.change = /** @type {ValueOpsFromValues<Vals>} */ (new ops.MapInsertOp('', this.$vals.cast(newVal), prevValue && this.$vals.cast(prevValue), attribution))
    return this
  }

  /**
   * @param {Vals|undefined} prevValue
   * @param {import('./abstract.js').Attribution?} attribution
   */
  delete (prevValue = undefined, attribution = null) {
    this.change = /** @type {ValueOpsFromValues<Vals>} */ (new ops.MapDeleteOp('', prevValue && this.$vals.cast(prevValue), attribution))
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
   * @param {DeltaValueBuilder<Vals>} other
   * @param {boolean} priority
   */
  rebase (other, priority) {
    const c = this.change
    if (ops.$insertOp.check(c)) {
      if (other.change?.constructor === ops.MapInsertOp && !priority) {
        this.change = null
      }
    } else if (ops.$deleteOp.check(c)) {
      const otherOp = other.change
      if (otherOp?.constructor === ops.MapInsertOp) {
        this.change = null
      }
    } else if (ops.$modifyOp.check(c)) {
      const otherOp = other.change
      if (otherOp == null) {
        // nop
      } else if (otherOp.constructor === ops.MapModifyOp) {
        c.value.rebase(otherOp.value, priority)
      } else {
        this.change = null
      }
    }
  }

  /**
   * @param {DeltaValue<Vals>} other
   */
  apply (other) {
    const oop = other.change
    const c = this.change
    if (ops.$modifyOp.check(oop)) {
      if (c != null && (ops.$modifyOp.check(c) || ops.$insertOp.check(c)) && $valueAny.check(c.value)) {
        /** @type {DeltaValue<any>} */ (c.value).apply(oop.value)
      } else {
        // then this is a simple modify
        this.change = oop
      }
    } else if (oop != null) {
      oop.prevValue = c?.value
      this.change = oop
    }
  }

  /**
   * @return {this}
   */
  clone () {
    const d = /** @type {this} */ (new DeltaValueBuilder(this.$vals))
    d.change = /** @type {ValueOpsFromValues<Vals>} */ (this.change?.clone())
    d.origin = this.origin
    d.isDiff = this.isDiff
    return d
  }

  done () {
    return /** @type {DeltaValue<Vals>} */ (this)
  }
}

/**
 * @template [Vals=any]
 * @param {s.$Schema<Vals>} $vals
 * @return {DeltaValueBuilder<Vals>}
 */
export const value = ($vals = s.$any) => /** @type {any} */ (new DeltaValueBuilder($vals))

/**
 * @template {any} Vals
 * @param {s.$Schema<Vals>} $vals
 * @return {s.$Schema<DeltaValue<Vals>>}
 */
export const $value = $vals => /** @type {any} */ (s.$instanceOf(DeltaValue, o => $vals.extends(o.$vals)))

/**
 * @type {s.$Schema<DeltaValue<any>>}
 */
export const $valueAny = s.$instanceOf(DeltaValue)
