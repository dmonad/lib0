import * as d from './abstract.js'
import * as object from '../object.js'
import * as traits from '../traits.js'
import * as fun from '../function.js'
import * as s from '../schema.js'

/**
 * @template {any} Content
 * @typedef {TextOp|InsertOp<Content>|RetainOp|DeleteOp|(Content extends d.AbstractDelta ? ModifyOp<Extract<Content,d.AbstractDelta>> : never)} AbstractDeltaArrayOps
 */

/**
 * @template Content
 * @typedef {InsertOp<Content>|RetainOp|DeleteOp|(Content extends d.AbstractDelta ? ModifyOp<Extract<Content,d.AbstractDelta>> : never)} DeltaArrayOps
 */

/**
 * @template Embeds
 * @typedef {TextOp|InsertOp<Embeds>|RetainOp|DeleteOp|(Embeds extends d.AbstractDelta ? ModifyOp<Extract<Embeds,d.AbstractDelta>> : never)} DeltaTextOps
 */

/**
 * @typedef {s.Unwrap<$anyOp>} DeltaOps
 */

/**
 * @typedef {MapInsertOp<any>|MapDeleteOp<any>|MapModifyOp<any>} DeltaMapOps
 */

/**
 * @typedef {MapInsertOp<any,''>|MapDeleteOp<any,''>|MapModifyOp<any,''>} DeltaValueOps
 */

/**
 * @typedef {{ [key: string]: any }} FormattingAttributes
 */

/**
 * @typedef {{ insert: string|object, attributes?: { [key: string]: any }, attribution?: d.Attribution } | { delete: number } | { retain: number, attributes?: { [key:string]: any }, attribution?: d.Attribution } | { modify: object }} DeltaJsonOp
 */

/**
 * @template {{[key:string]: any} | null} Attrs
 * @param {Attrs} attrs
 * @return {Attrs}
 */
const _cloneAttrs = attrs => attrs == null ? attrs : { ...attrs }
/**
 * @template {any} MaybeDelta
 * @param {MaybeDelta} maybeDelta
 * @return {MaybeDelta}
 */
const _cloneMaybeDelta = maybeDelta => d.$delta.check(maybeDelta) ? maybeDelta.clone() : maybeDelta

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
    return this.insert.length
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} offset
   * @param {number} len
   */
  _splice (offset, len) {
    this.insert = this.insert.slice(0, offset) + this.insert.slice(offset + len)
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

  /**
   * @return {TextOp}
   */
  clone () {
    return new TextOp(this.insert, _cloneAttrs(this.attributes), _cloneAttrs(this.attribution))
  }
}

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
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} offset
   * @param {number} len
   */
  _splice (offset, len) {
    this.insert.splice(offset, len)
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

  /**
   * @return {InsertOp<ArrayContent>}
   */
  clone () {
    return new InsertOp(this.insert.slice(), _cloneAttrs(this.attributes), _cloneAttrs(this.attribution))
  }
}

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
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} offset
   * @param {number} len
   */
  _splice (offset, len) {
    this.delete -= len
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

  clone () {
    return new DeleteOp(this.delete)
  }
}

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
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} _offset
   * @param {number} len
   */
  _splice (_offset, len) {
    this.retain -= len
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

  clone () {
    return new RetainOp(this.retain, _cloneAttrs(this.attributes), _cloneAttrs(this.attribution))
  }
}

/**
 * Delta that can be applied on a YType Embed
 *
 * @template {d.AbstractDelta} DTypes
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
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} _offset
   * @param {number} len
   */
  _splice (_offset, len) {
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

  /**
   * @return {ModifyOp<DTypes>}
   */
  clone () {
    return new ModifyOp(this.modify.clone(), _cloneAttrs(this.attributes), _cloneAttrs(this.attribution))
  }
}

/**
 * @template V
 * @template [K=string]
 */
export class MapInsertOp {
  /**
   * @param {K} key
   * @param {V} value
   * @param {V|undefined} prevValue
   * @param {s.TypeOf<d.$attribution>?} attribution
   */
  constructor (key, value, prevValue, attribution) {
    /**
     * @type {K}
     */
    this.key = key
    /**
     * @type {V}
     */
    this.value = value
    /**
     * @type {V|undefined}
     */
    this.prevValue = prevValue
    this.attribution = attribution
  }

  /**
   * @return {'insert'}
   */
  get type () { return 'insert' }

  toJSON () {
    return {
      type: this.type,
      value: d.$delta.check(this.value) ? this.value.toJSON() : this.value,
      attribution: this.attribution
    }
  }

  /**
   * @param {MapInsertOp<V>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.key === other.key && fun.equalityDeep(this.value, other.value) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @return {MapInsertOp<V,K>}
   */
  clone () {
    return new MapInsertOp(this.key, _cloneMaybeDelta(this.value), _cloneMaybeDelta(this.prevValue), _cloneAttrs(this.attribution))
  }
}

/**
 * @template V
 * @template [K=string]
 */
export class MapDeleteOp {
  /**
   * @param {K} key
   * @param {V|undefined} prevValue
   * @param {s.TypeOf<d.$attribution>?} attribution
   */
  constructor (key, prevValue, attribution) {
    /**
     * @type {K}
     */
    this.key = key
    /**
     * @type {V|undefined}
     */
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
      attribution: this.attribution
    }
  }

  /**
   * @param {MapDeleteOp<V>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.key === other.key && fun.equalityDeep(this.attribution, other.attribution)
  }

  clone () {
    return new MapDeleteOp(this.key, _cloneMaybeDelta(this.prevValue), _cloneAttrs(this.attribution))
  }
}

/**
 * @template {d.AbstractDelta} Modifiers
 * @template [K=string]
 */
export class MapModifyOp {
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
    this.value = delta
  }

  /**
   * @type {'modify'}
   */
  get type () { return 'modify' }

  toJSON () {
    return {
      type: this.type,
      value: this.value.toJSON()
    }
  }

  /**
   * @param {MapModifyOp<Modifiers>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.key === other.key && this.value[traits.EqualityTraitSymbol](other.value)
  }

  /**
   * @return {MapModifyOp<Modifiers,K>}
   */
  clone () {
    return new MapModifyOp(this.key, this.value.clone())
  }
}

export const $deltaMapChangeJson = s.$union(
  s.$object({ type: s.$literal('insert'), value: s.$any, attribution: d.$attribution.nullable.optional }),
  s.$object({ type: s.$literal('modify'), value: s.$any }),
  s.$object({ type: s.$literal('delete'), attribution: d.$attribution.nullable.optional })
)

/**
 * @type {s.Schema<MapDeleteOp<any> | DeleteOp>}
 */
export const $deleteOp = s.$custom(o => o != null && (o.constructor === DeleteOp || o.constructor === MapDeleteOp))

/**
 * @type {s.Schema<MapInsertOp<any> | InsertOp<any>>}
 */
export const $insertOp = s.$custom(o => o != null && (o.constructor === MapInsertOp || o.constructor === InsertOp))

/**
 * @template Content
 * @param {s.Schema<Content>} $content
 * @return {s.Schema<MapInsertOp<Content> | InsertOp<Content>>}
 */
export const $insertOpWith = $content => s.$custom(o =>
  o != null && (
    (o.constructor === MapInsertOp && $content.check(/** @type {MapInsertOp<Content>} */ (o).value)) ||
      (o.constructor === InsertOp && /** @type {InsertOp<Content>} */ (o).insert.every(ins => $content.check(ins)))
  )
)

/**
 * @type {s.Schema<TextOp>}
 */
export const $textOp = s.$constructedBy(TextOp)

/**
 * @type {s.Schema<RetainOp>}
 */
export const $retainOp = s.$constructedBy(RetainOp)

/**
 * @type {s.Schema<MapModifyOp<any> | ModifyOp<any>>}
 */
export const $modifyOp = s.$custom(o => o != null && (o.constructor === MapModifyOp || o.constructor === ModifyOp))

/**
 * @template {d.AbstractDelta} Modify
 * @param {s.Schema<Modify>} $content
 * @return {s.Schema<MapModifyOp<Modify> | ModifyOp<Modify>>}
 */
export const $modifyOpWith = $content => s.$custom(o =>
  o != null && (
    (o.constructor === MapModifyOp && $content.check(/** @type {MapModifyOp<Modify>} */ (o).value)) ||
      (o.constructor === ModifyOp && $content.check(/** @type {ModifyOp<Modify>} */ (o).modify))
  )
)

export const $anyOp = s.$union($insertOp, $deleteOp, $textOp, $modifyOp)
