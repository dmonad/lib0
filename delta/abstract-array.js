import * as s from '../schema.js'
import * as d from './abstract.js'
import * as traits from '../traits.js'
import * as object from '../object.js'
import * as fun from '../function.js'
import * as array from '../array.js'

/**
 * @template {any} Content
 * @typedef {TextOp|InsertOp<Content>|RetainOp|DeleteOp|(Content extends d.Delta ? ModifyOp<Extract<Content,d.Delta>> : never)} AbstractDeltaArrayOps
 */

/**
 * @template Content
 * @typedef {InsertOp<Content>|RetainOp|DeleteOp|(Content extends d.Delta ? ModifyOp<Extract<Content,d.Delta>> : never)} DeltaArrayOps
 */

/**
 * @template Embeds
 * @typedef {TextOp|InsertOp<Embeds>|RetainOp|DeleteOp|(Embeds extends d.Delta ? ModifyOp<Extract<Embeds,d.Delta>> : never)} TextDeltaOps
 */

/**
 * @typedef {{ [key: string]: any }} FormattingAttributes
 */

/**
 * @typedef {Array<DeltaJsonOp>} DeltaJson
 */

/**
 * @typedef {{ insert: string|object, attributes?: { [key: string]: any }, attribution?: d.Attribution } | { delete: number } | { retain: number, attributes?: { [key:string]: any }, attribution?: d.Attribution } | { modify: object }} DeltaJsonOp
 */

export class TextOp {
  /**
   * @param {string} insert
   * @param {FormattingAttributes|null} attributes
   * @param {d.Attribution|null} attribution
   */
  constructor (insert, attributes, attribution) {
    this.insert = insert
    this.attributes = attributes
    this.attribution = attribution
  }

  /**
   * @return {'insert'}
   */
  get type () {
    return 'insert'
  }

  get length () {
    return (this.insert.constructor === Array || this.insert.constructor === String) ? this.insert.length : 1
  }

  /**
   * @return {DeltaJsonOp}
   */
  toJSON () {
    return object.assign({ insert: this.insert }, this.attributes ? { attributes: this.attributes } : ({}), this.attribution ? { attribution: this.attribution } : ({}))
  }

  /**
   * @param {TextOp} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.insert, other.insert) && fun.equalityDeep(this.attributes, other.attributes) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

export const $textOp = s.$constructedBy(TextOp)

/**
 * @template {any} ArrayContent
 */
export class InsertOp {
  /**
   * @param {Array<ArrayContent>} insert
   * @param {FormattingAttributes|null} attributes
   * @param {d.Attribution|null} attribution
   */
  constructor (insert, attributes, attribution) {
    this.insert = insert
    this.attributes = attributes
    this.attribution = attribution
  }

  /**
   * @return {'insert'}
   */
  get type () {
    return 'insert'
  }

  get length () {
    return this.insert.length
  }

  /**
   * @return {DeltaJsonOp}
   */
  toJSON () {
    return object.assign({ insert: this.insert }, this.attributes ? { attributes: this.attributes } : ({}), this.attribution ? { attribution: this.attribution } : ({}))
  }

  /**
   * @param {InsertOp<ArrayContent>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.insert, other.insert) && fun.equalityDeep(this.attributes, other.attributes) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

/**
 * @template T
 * @param {s.$Schema<T>} $value
 * @return {s.$Schema<InsertOp<T>>}
 */
export const $insertOp = $value => /** @type {s.$Schema<InsertOp<T>>} */ (s.$constructedBy(InsertOp, o => o.insert.every(ins => $value.check(ins))))
export const $insertOpAny = $insertOp(s.$any)

export class DeleteOp {
  /**
   * @param {number} len
   */
  constructor (len) {
    this.delete = len
  }

  /**
   * @return {'delete'}
   */
  get type () {
    return 'delete'
  }

  get length () {
    return 0
  }

  /**
   * @return {DeltaJsonOp}
   */
  toJSON () {
    return { delete: this.delete }
  }

  /**
   * @param {DeleteOp} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.delete === other.delete
  }
}

export const $deleteOp = s.$constructedBy(DeleteOp)

export class RetainOp {
  /**
   * @param {number} retain
   * @param {FormattingAttributes|null} attributes
   * @param {d.Attribution|null} attribution
   */
  constructor (retain, attributes, attribution) {
    this.retain = retain
    this.attributes = attributes
    this.attribution = attribution
  }

  /**
   * @return {'retain'}
   */
  get type () {
    return 'retain'
  }

  get length () {
    return this.retain
  }

  /**
   * @return {DeltaJsonOp}
   */
  toJSON () {
    return object.assign({ retain: this.retain }, this.attributes ? { attributes: this.attributes } : {}, this.attribution ? { attribution: this.attribution } : {})
  }

  /**
   * @param {RetainOp} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.retain === other.retain && fun.equalityDeep(this.attributes, other.attributes) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

export const $retainOp = s.$constructedBy(RetainOp)

/**
 * Delta that can be applied on a YType Embed
 *
 * @template {d.Delta} DTypes
 */
export class ModifyOp {
  /**
   * @param {DTypes} delta
   * @param {FormattingAttributes|null} attributes
   * @param {d.Attribution|null} attribution
   */
  constructor (delta, attributes, attribution) {
    this.modify = delta
    this.attributes = attributes
    this.attribution = attribution
  }

  /**
   * @return {'modify'}
   */
  get type () {
    return 'modify'
  }

  get length () {
    return 1
  }

  /**
   * @return {DeltaJsonOp}
   */
  toJSON () {
    return object.assign({ modify: this.modify.toJSON() }, this.attributes ? { attributes: this.attributes } : {}, this.attribution ? { attribution: this.attribution } : {})
  }

  /**
   * @param {ModifyOp<any>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.modify[traits.EqualityTraitSymbol](other.modify) && fun.equalityDeep(this.attributes, other.attributes) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

/**
 * @template {d.AbstractDelta} T
 * @param {s.$Schema<T>} $modifier
 * @return {s.$Schema<ModifyOp<T>>}
 */
export const $modifyOp = $modifier => /** @type {s.$Schema<ModifyOp<T>>} */ (s.$constructedBy(ModifyOp, o => $modifier.check(o.modify)))
export const $modifyOpAny = $modifyOp(d.$delta)

export const $anyOp = s.$union($insertOpAny, $deleteOp, $textOp, $modifyOpAny)

/**
 * @template {'array' | 'text' | 'custom'} Type
 * @template {AbstractDeltaArrayOps<any>} OPS
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
   * @param {(d:OPS) => AbstractDeltaArrayOps<M>} f
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
 * @template {AbstractDeltaArrayOps<any>} OPS
 * @extends {AbstractDeltaArray<Type,OPS>}
 */
export class AbstractDeltaArrayBuilder extends AbstractDeltaArray {
  /**
   * @param {Type} type
   * @param {s.$Schema<OPS extends AbstractDeltaArrayOps<infer V> ? V : never>} $insert
   */
  constructor (type, $insert) {
    super(type)
    this.$insert = $insert
    /**
     * @type {FormattingAttributes?}
     */
    this.usedAttributes = null
    /**
     * @type {d.Attribution?}
     */
    this.usedAttribution = null
    /**
     * @type {AbstractDeltaArrayOps<any>?}
     */
    this.lastOp = null
  }

  /**
   * @param {FormattingAttributes?} attributes
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
   * @param {FormattingAttributes?} attributes
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
      if ($textOp.check(this.lastOp) && checkMergedEquals(this.lastOp)) {
        this.lastOp.insert += insert
      } else {
        this.ops.push(this.lastOp = /** @type {OPS} */ (new TextOp(insert, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution)))
      }
    } else if (array.isArray(insert)) {
      insert.forEach(/** @param {any} ins */ ins => this.$insert.expect(ins))
      if ($insertOpAny.check(this.lastOp) && checkMergedEquals(this.lastOp)) {
        this.lastOp.insert.push(...insert)
      } else {
        this.ops.push(this.lastOp = /** @type {OPS} */ (new InsertOp(insert, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution)))
      }
    }
    return this
  }

  /**
   * @param {OPS extends ModifyOp<infer Mod> ? Mod : never } modify
   * @param {FormattingAttributes?} attributes
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
   * @param {FormattingAttributes?} attributes
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
   * @return {Type extends 'array' ? (OPS extends DeltaArrayOps<infer C> ? import('./array.js').DeltaArray<C> : never) : (Type extends 'text' ? (OPS extends TextDeltaOps<infer Embeds> ? import('./text.js').TextDelta<Embeds> : never) : AbstractDeltaArray<Type,OPS>)}
   */
  done () {
    while (this.lastOp != null && this.lastOp instanceof RetainOp && this.lastOp.attributes === null && this.lastOp.attribution === null) {
      this.ops.pop()
      this.lastOp = this.ops[this.ops.length - 1] ?? null
    }
    return /** @type {any} */ (this)
  }
}
