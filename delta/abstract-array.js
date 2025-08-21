import * as s from '../schema.js'
import * as d from './abstract.js'
import * as traits from '../traits.js'
import * as object from '../object.js'
import * as fun from '../function.js'
import * as array from '../array.js'
import * as dops from './ops.js'
import { InsertOp, DeleteOp, RetainOp, ModifyOp, TextOp } from './ops.js'

/**
 * @typedef {Array<dops.DeltaJsonOp>} DeltaJson
 */

/**
 * @template {'array' | 'text' | 'custom'} Type
 * @template {dops.AbstractDeltaArrayOps<any>} OPS
 * @extends {d.AbstractDelta}
 */
export class AbstractDeltaArray extends d.AbstractDelta {
  /**
   * @param {Type} type
   */
  constructor (type) {
    super()
    this.type = type
    /**
     * @type {Array<OPS>}
     */
    this.ops = []
  }

  /**
   * @template M
   * @param {(d:OPS) => dops.AbstractDeltaArrayOps<M>} f
   * @return {AbstractDeltaArrayBuilder<Type,M>}
   */
  map (f) {
    const d = /** @type {AbstractDeltaArrayBuilder<Type,any>} */ (new /** @type {any} */ (this.constructor)(this.type))
    d.ops = this.ops.map(f)
    d.lastOp = d.ops[d.ops.length - 1] ?? null
    return d
  }

  /**
   *
   * Iterate through the changes. There are two approches to iterate through the changes. The
   * following examples achieve the same thing:
   *
   * @example
   *   d.forEach((op, index) => {
   *     if (op instanceof delta.InsertArrayOp) {
   *       op.insert
   *     } else if (op instanceof delta.RetainOp ) {
   *       op.retain
   *     } else if (op instanceof delta.DeleteOp) {
   *       op.delete
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
   *   )
   *
   * @param {null|((d:OPS,index:number)=>void)} f
   * @param {null|((insertOp:Extract<OPS,InsertOp<any>|TextOp>,index:number)=>void)} insertHandler
   * @param {null|((retainOp:RetainOp,index:number)=>void)} retainHandler
   * @param {null|((deleteOp:DeleteOp,index:number)=>void)} deleteHandler
   * @param {null|((modifyOp:OPS extends ModifyOp<infer M> ? ModifyOp<M> : never,index:number)=>void)} modifyHandler
   */
  forEach (f = null, insertHandler = null, retainHandler = null, deleteHandler = null, modifyHandler = null) {
    for (
      let i = 0, index = 0, op = this.ops[i];
      i < this.ops.length;
      i++, index += op.length, op = this.ops[i]
    ) {
      f?.(op, index)
      switch (op.constructor) {
        case RetainOp:
          retainHandler?.(/** @type {RetainOp} */ (op), index)
          break
        case DeleteOp:
          deleteHandler?.(/** @type {DeleteOp} */ (op), index)
          break
        case ModifyOp:
          modifyHandler?.(/** @type {any}) */ (op), index)
          break
        default:
          insertHandler?.(/** @type {any} */ (op), index)
      }
    }
  }

  /**
   * @param {AbstractDeltaArray<Type, OPS>} other
   * @return {boolean}
   */
  equals (other) {
    return this[traits.EqualityTraitSymbol](other)
  }

  /**
   * @returns {DeltaJson}
   */
  toJSON () {
    return this.ops.map(o => o.toJSON())
  }

  /**
   * @param {AbstractDeltaArray<Type,OPS>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.ops, other.ops)
  }
}

/**
 * @template {'text' | 'array' | 'custom'} Type
 * @template {dops.AbstractDeltaArrayOps<any>} OPS
 * @extends {AbstractDeltaArray<Type,OPS>}
 */
export class AbstractDeltaArrayBuilder extends AbstractDeltaArray {
  /**
   * @param {Type} type
   * @param {s.$Schema<OPS extends dops.AbstractDeltaArrayOps<infer V> ? V : never>} $insert
   */
  constructor (type, $insert) {
    super(type)
    this.$insert = $insert
    /**
     * @type {dops.FormattingAttributes?}
     */
    this.usedAttributes = null
    /**
     * @type {d.Attribution?}
     */
    this.usedAttribution = null
    /**
     * @type {dops.AbstractDeltaArrayOps<any>?}
     */
    this.lastOp = null
  }

  /**
   * @param {dops.FormattingAttributes?} attributes
   * @return {this}
   */
  useAttributes (attributes) {
    this.usedAttributes = attributes
    return this
  }

  /**
   * @param {string} name
   * @param {any} value
   */
  updateUsedAttributes (name, value) {
    if (value == null) {
      this.usedAttributes = object.assign({}, this.usedAttributes)
      delete this.usedAttributes?.[name]
      if (object.isEmpty(this.usedAttributes)) {
        this.usedAttributes = null
      }
    } else if (!fun.equalityDeep(this.usedAttributes?.[name], value)) {
      this.usedAttributes = object.assign({}, this.usedAttributes)
      this.usedAttributes[name] = value
    }
    return this
  }

  /**
   * @template {keyof d.Attribution} NAME
   * @param {NAME} name
   * @param {d.Attribution[NAME]?} value
   */
  updateUsedAttribution (name, value) {
    if (value == null) {
      this.usedAttribution = object.assign({}, this.usedAttribution)
      delete this.usedAttribution?.[name]
      if (object.isEmpty(this.usedAttribution)) {
        this.usedAttribution = null
      }
    } else if (!fun.equalityDeep(this.usedAttribution?.[name], value)) {
      this.usedAttribution = object.assign({}, this.usedAttribution)
      this.usedAttribution[name] = value
    }
    return this
  }

  /**
   * @param {d.Attribution?} attribution
   */
  useAttribution (attribution) {
    this.usedAttribution = attribution
    return this
  }

  /**
   * @param {(OPS extends TextOp ? string : never) | (OPS extends InsertOp<infer Content> ? Array<Content> : never) } insert
   * @param {dops.FormattingAttributes?} attributes
   * @param {d.Attribution?} attribution
   * @return {this}
   */
  insert (insert, attributes = null, attribution = null) {
    const mergedAttributes = d.mergeAttrs(this.usedAttributes, attributes)
    const mergedAttribution = d.mergeAttrs(this.usedAttribution, attribution)
    /**
     * @param {TextOp | InsertOp<any>} lastOp
     */
    const checkMergedEquals = lastOp => (mergedAttributes === lastOp.attributes || fun.equalityDeep(mergedAttributes, lastOp.attributes)) && (mergedAttribution === lastOp.attribution || fun.equalityDeep(mergedAttribution, lastOp.attribution))

    if (s.$string.check(insert)) {
      if (dops.$textOp.check(this.lastOp) && checkMergedEquals(this.lastOp)) {
        this.lastOp.insert += insert
      } else {
        this.ops.push(this.lastOp = /** @type {OPS} */ (new TextOp(insert, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution)))
      }
    } else if (array.isArray(insert)) {
      insert.forEach(/** @param {any} ins */ ins => this.$insert.expect(ins))
      if (dops.$insertOp.check(this.lastOp) && checkMergedEquals(this.lastOp)) {
        this.lastOp.insert.push(...insert)
      } else {
        this.ops.push(this.lastOp = /** @type {OPS} */ (new InsertOp(insert, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution)))
      }
    }
    return this
  }

  /**
   * @param {OPS extends ModifyOp<infer Mod> ? Mod : never } modify
   * @param {dops.FormattingAttributes?} attributes
   * @param {d.Attribution?} attribution
   * @return {this}
   */
  modify (modify, attributes, attribution) {
    const mergedAttributes = d.mergeAttrs(this.usedAttributes, attributes)
    const mergedAttribution = d.mergeAttrs(this.usedAttribution, attribution)
    this.ops.push(this.lastOp = /** @type {OPS} */ (new ModifyOp(modify, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution)))
    return this
  }

  /**
   * @param {number} retain
   * @param {dops.FormattingAttributes?} attributes
   * @param {d.Attribution?} attribution
   * @return {this}
   */
  retain (retain, attributes = null, attribution = null) {
    const mergedAttributes = d.mergeAttrs(this.usedAttributes, attributes)
    const mergedAttribution = d.mergeAttrs(this.usedAttribution, attribution)
    if (this.lastOp instanceof RetainOp && fun.equalityDeep(mergedAttributes, this.lastOp.attributes) && fun.equalityDeep(mergedAttribution, this.lastOp.attribution)) {
      this.lastOp.retain += retain
    } else {
      // @ts-ignore
      this.ops.push(this.lastOp = new RetainOp(retain, mergedAttributes, mergedAttribution))
    }
    return this
  }

  /**
   * @param {number} len
   * @return {this}
   */
  delete (len) {
    if (this.lastOp instanceof DeleteOp) {
      this.lastOp.delete += len
    } else {
      // @ts-ignore
      this.ops.push(this.lastOp = new DeleteOp(len))
    }
    return this
  }

  /**
   * @return {Type extends 'array' ? (OPS extends dops.InsertOp<infer C> ? import('./array.js').DeltaArray<C> : never) : (Type extends 'text' ? (OPS extends dops.DeltaTextOps<infer Embeds> ? import('./text.js').DeltaText<Embeds> : never) : AbstractDeltaArray<Type,OPS>)}
   */
  done () {
    while (this.lastOp != null && this.lastOp instanceof RetainOp && this.lastOp.attributes === null && this.lastOp.attribution === null) {
      this.ops.pop()
      this.lastOp = this.ops[this.ops.length - 1] ?? null
    }
    return /** @type {any} */ (this)
  }
}
