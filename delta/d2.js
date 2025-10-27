/**
 * @beta this API is about to change
 */

import * as list from '../list.js'
import * as object from '../object.js'
import * as traits from '../traits.js'
import * as arr from '../array.js'
import * as fun from '../function.js'
import * as s from '../schema.js'
import * as error from '../error.js'
import * as math from '../math.js'

/**
 * @typedef {{
 *   insert?: string[]
 *   insertAt?: number
 *   delete?: string[]
 *   deleteAt?: number
 *   format?: Record<string,string[]>
 *   formatAt?: number
 * }} Attribution
 */

/**
 * @type {s.Schema<Attribution>}
 */
export const $attribution = s.$object({
  insert: s.$array(s.$string).optional,
  insertAt: s.$number.optional,
  delete: s.$array(s.$string).optional,
  deleteAt: s.$number.optional,
  format: s.$record(s.$string, s.$array(s.$string)).optional,
  formatAt: s.$number.optional
})

/**
 * @typedef {s.Unwrap<$anyOp>} DeltaOps
 */

/**
 * @typedef {{ [key: string]: any }} FormattingAttributes
 */

/**
 * @typedef {{
 *   name?: string
 *   attrs?: { [Key in string|number|symbol]: DeltaAttrOpJSON },
 *   children?: Array<DeltaListOpJSON>
 * }} DeltaJSON
 */

/**
 * @typedef {{ type: 'insert', insert: string|Array<any>, format?: { [key: string]: any }, attribution?: Attribution } | { delete: number } | { type: 'retain', retain: number, format?: { [key:string]: any }, attribution?: Attribution } | { type: 'modify', value: object }} DeltaListOpJSON
 */

/**
 * @typedef {{ type: 'insert', value: any, prevValue?: any, attribution?: Attribution } | { type: 'delete', prevValue?: any, attribution?: Attribution } | { type: 'modify', value: DeltaJSON }} DeltaAttrOpJSON
 */

/**
 * @type {s.Schema<DeltaAttrOpJSON>}
 */
export const $deltaMapChangeJson = s.$union(
  s.$object({ type: s.$literal('insert'), value: s.$any, prevValue: s.$any.optional, attribution: $attribution.optional }),
  s.$object({ type: s.$literal('modify'), value: s.$any }),
  s.$object({ type: s.$literal('delete'), prevValue: s.$any.optional, attribution: $attribution.optional })
)

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
const _cloneMaybeDelta = maybeDelta => $deltaAny.check(maybeDelta) ? maybeDelta.clone() : maybeDelta

export class TextOp extends list.ListNode {
  /**
   * @param {string} insert
   * @param {FormattingAttributes|null} format
   * @param {Attribution?} attribution
   */
  constructor (insert, format, attribution) {
    super()
    this.insert = insert
    this.format = format
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
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    const { insert, format, attribution } = this
    return object.assign(/** @type {{type: 'insert', insert: string}} */ ({ type: 'insert', insert }), format != null ? { format } : ({}), attribution != null ? { attribution } : ({}))
  }

  /**
   * @param {TextOp} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.insert, other.insert) && fun.equalityDeep(this.format, other.format) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @return {TextOp}
   */
  clone () {
    return new TextOp(this.insert, _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * @template ArrayContent
 */
export class InsertOp extends list.ListNode {
  /**
   * @param {Array<ArrayContent>} insert
   * @param {FormattingAttributes|null} format
   * @param {Attribution?} attribution
   */
  constructor (insert, format, attribution) {
    super()
    this.insert = insert
    this.format = format
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
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    const { insert, format, attribution } = this
    return object.assign({ type: /** @type {'insert'} */ ('insert'), insert: insert.map(ins => $deltaAny.check(ins) ? ins.toJSON() : ins) }, format ? { format } : ({}), attribution != null ? { attribution } : ({}))
  }

  /**
   * @param {InsertOp<ArrayContent>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.insert, other.insert) && fun.equalityDeep(this.format, other.format) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @return {InsertOp<ArrayContent>}
   */
  clone () {
    return new InsertOp(this.insert.slice(), _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

export class DeleteOp extends list.ListNode {
  /**
   * @param {number} len
   */
  constructor (len) {
    super()
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
   * @param {number} _offset
   * @param {number} len
   */
  _splice (_offset, len) {
    this.delete -= len
  }

  /**
   * @return {DeltaListOpJSON}
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

export class RetainOp extends list.ListNode {
  /**
   * @param {number} retain
   * @param {FormattingAttributes|null} format
   * @param {Attribution?} attribution
   */
  constructor (retain, format, attribution) {
    super()
    this.retain = retain
    this.format = format
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
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    const { retain, format, attribution } = this
    return object.assign({ type: /** @type {'retain'} */ ('retain'), retain }, format ? { format } : {}, attribution != null ? { attribution } : {})
  }

  /**
   * @param {RetainOp} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.retain === other.retain && fun.equalityDeep(this.format, other.format) && fun.equalityDeep(this.attribution, other.attribution)
  }

  clone () {
    return new RetainOp(this.retain, _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * Delta that can be applied on a YType Embed
 *
 * @template {Delta<any,any,any,any,any>} DTypes
 */
export class ModifyOp extends list.ListNode {
  /**
   * @param {DTypes} delta
   * @param {FormattingAttributes|null} format
   * @param {Attribution?} attribution
   */
  constructor (delta, format, attribution) {
    super()
    this.value = delta
    this.format = format
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
   * @param {number} _len
   */
  _splice (_offset, _len) {
  }

  /**
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    const { value, attribution, format } = this
    return object.assign({ type: /** @type {'modify'} */ ('modify'), value: value.toJSON() }, format ? { format } : {}, attribution != null ? { attribution } : {})
  }

  /**
   * @param {ModifyOp<any>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.value[traits.EqualityTraitSymbol](other.value) && fun.equalityDeep(this.format, other.format) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @return {ModifyOp<DTypes>}
   */
  clone () {
    return new ModifyOp(this.value.clone(), _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * @template V
 * @template {string|number|symbol} [K=any]
 */
export class MapInsertOp {
  /**
   * @param {K} key
   * @param {V} value
   * @param {V|undefined} prevValue
   * @param {Attribution?} attribution
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
    const v = this.value
    const prevValue = this.prevValue
    const attribution = this.attribution
    return object.assign({
      type: this.type,
      value: $deltaAny.check(v) ? v.toJSON() : v
    }, attribution != null ? { attribution } : {}, prevValue !== undefined ? { prevValue } : {})
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
   * @param {Attribution?} attribution
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

  /**
   * @return {DeltaAttrOpJSON}
   */
  toJSON () {
    const {
      type, attribution, prevValue
    } = this
    return object.assign({ type }, attribution != null ? { attribution } : {}, prevValue !== undefined ? { prevValue } : {})
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
 * @template {DeltaAny} Modifier
 * @template [K=string]
 */
export class MapModifyOp {
  /**
   * @param {K} key
   * @param {Modifier} delta
   */
  constructor (key, delta) {
    /**
     * @type {K}
     */
    this.key = key
    /**
     * @type {Modifier}
     */
    this.value = delta
  }

  /**
   * @type {'modify'}
   */
  get type () { return 'modify' }

  /**
   * @return {DeltaAttrOpJSON}
   */
  toJSON () {
    return {
      type: this.type,
      value: this.value.toJSON()
    }
  }

  /**
   * @param {MapModifyOp<Modifier>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.key === other.key && this.value[traits.EqualityTraitSymbol](other.value)
  }

  /**
   * @return {MapModifyOp<Modifier,K>}
   */
  clone () {
    return new MapModifyOp(this.key, this.value.clone())
  }
}

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
 * @template {DeltaAny} Modify
 * @param {s.Schema<Modify>} $content
 * @return {s.Schema<MapModifyOp<Modify> | ModifyOp<Modify>>}
 */
export const $modifyOpWith = $content => s.$custom(o =>
  o != null && (
    (o.constructor === MapModifyOp && $content.check(/** @type {MapModifyOp<Modify>} */ (o).value)) ||
      (o.constructor === ModifyOp && $content.check(/** @type {ModifyOp<Modify>} */ (o).value))
  )
)

export const $anyOp = s.$union($insertOp, $deleteOp, $textOp, $modifyOp)

/**
 * @template {Array<any>|string} C1
 * @template {Array<any>|string} C2
 * @typedef {Extract<C1 | C2, Array<any>> extends never
 *   ? never
 *   : (Array<(Extract<C1 | C2,Array<any>> extends Array<infer AC1> ? (unknown extends AC1 ? never : AC1) : never)>)} MergeListArrays
 */

/**
 * @template {{[Key in string|number|symbol]: any}} Attrs
 * @template {string|number|symbol} Key
 * @template {any} Val
 * @typedef {{ [K in (Key | keyof Attrs)]: (unknown extends Attrs[K] ? never : Attrs[K]) | (Key extends K ? Val : never) }} AddToAttrs
 */

/**
 * @template {{[Key in string|number|symbol]: any}} Attrs
 * @template {{[Key in string|number|symbol]: any}} NewAttrs
 * @typedef {{ [K in (keyof NewAttrs | keyof Attrs)]: (unknown extends Attrs[K] ? never : Attrs[K]) | (unknown extends NewAttrs[K] ? never : NewAttrs[K]) }} MergeAttrs
 */

/**
 * @template X
 * @typedef {0 extends (1 & X) ? null : X} _AnyToNull
 */

/**
 * @template {s.Schema<Delta<any,any,any,any,any>>|null} Schema
 * @typedef {_AnyToNull<Schema> extends null ? Delta<any,{[key:string|number|symbol]:any},any,string> : (Schema extends s.Schema<infer D> ? D : never)} AllowedDeltaFromSchema
 */

/**
 * @typedef {Delta<any,any,any,any,any>} DeltaAny
 */

// note: simply copy the values from Delta.attrs as the parameter of the function
/**
 * @template {{[key:string|number|symbol]:any}} [Attrs={}]
 * @param {Delta<any,Attrs,any,any,any>} d
 * @param {(v:{ [K in keyof Attrs]: MapInsertOp<Attrs[K],K>|MapDeleteOp<Attrs[K],K>|(Delta extends Attrs[K] ? MapModifyOp<Extract<Attrs[K],Delta>,K> : never) }[keyof Attrs])=>any} handler
 */
export const forEachAttr = (d, handler) => {
  for (const k in d.attrs) {
    handler(/** @type {Attrs[any]} */ (d.attrs[k]))
  }
}

/**
 * @template {string} [out NodeName=any]
 * @template {{[key:string|number|symbol]:any}} [Attrs={}]
 * @template {any} [Children=never]
 * @template {string|never} [Text=never]
 * @template {s.Schema<Delta<any,any,any,any,any>>|null} [Schema=any]
 */
export class Delta {
  /**
   * @param {NodeName} [name]
   * @param {Schema} [$schema]
   */
  constructor (name, $schema) {
    this.name = name || null
    this.$schema = $schema || null
    /**
     * @type {{ [K in keyof Attrs]?: MapInsertOp<Attrs[K],K>|MapDeleteOp<Attrs[K],K>|(Delta extends Attrs[K] ? MapModifyOp<Extract<Attrs[K],Delta>,K> : never) }}
     */
    this.attrs = {}
    /**
     * @type {list.List<
     *   RetainOp
     *   | DeleteOp
     *   | (Text extends never ? never : TextOp)
     *   | (Children extends never ? never : InsertOp<Children>)
     *   | (Delta extends Children ? ModifyOp<Extract<Children,Delta<any,any,any,any,any>>> : never)
     * >}
     */
    this.children = /** @type {any} */ (list.create())
    /**
     * @type {any}
     */
    this.origin = null
  }

  /**
   * @template {{[key:string|number|symbol]:any}} [Attrs={}]
   * @param {(v:{ [K in keyof Attrs]: MapInsertOp<Attrs[K],K>|MapDeleteOp<Attrs[K],K>|(Delta extends Attrs[K] ? MapModifyOp<Extract<Attrs[K],Delta>,K> : never) }[keyof Attrs])=>any} attrHandler
   */
  forEach (attrHandler) {
    for (const k in this.attrs) {
      attrHandler(/** @type {Attrs[any]} */ (this.attrs[k]))
    }
  }


  isEmpty () {
    return object.isEmpty(this.attrs) && list.isEmpty(this.children)
  }

  /**
   * @return {DeltaJSON}
   */
  toJSON () {
    /**
     * @type {any}
     */
    const attrs = {}
    /**
     * @type {any}
     */
    const children = []
    forEachAttr(this, attr => {
      attrs[attr.key] = attr
    })
    this.children.forEach(val => {
      children.push(val.toJSON())
    })
    return object.assign(
      (this.name != null ? { name: this.name } : {}),
      (object.isEmpty(attrs) ? {} : { attrs }),
      (children.length > 0 ? { children } : {})
    )
  }

  /**
   * @param {Delta<any,any,any,any,any>} other
   * @return {boolean}
   */
  equals (other) {
    return this[traits.EqualityTraitSymbol](other)
  }

  /**
   * @return {this}
   */
  clone () {
    /**
     * @type {Delta<any,Attrs,any,any,any>}
     */
    const d = new Delta(/** @type {any} */ (this.name), this.$schema)
    d.origin = this.origin
    forEachAttr(this, op => {
      d.attrs[op.key] = op
    })
    this.children.forEach(op => {
      list.pushEnd(d.children, op.clone())
    })
    return /** @type {any} */ (d)
  }

  /**
   * @param {any} other
   * @return {boolean}
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.name === other.name && fun.equalityDeep(this.attrs, other.attrs) && fun.equalityDeep(this.children, other.children)
  }
}

/**
 * @template {string} [NodeName=any]
 * @template {{[key:string|number|symbol]:any}} [Attrs={}]
 * @template {any} [Children=never]
 * @template {string|never} [Text=never]
 * @template {s.Schema<Delta<any,any,any,any,any>>|null} [Schema=any]
 * @extends {Delta<NodeName,Attrs,Children,Text,Schema>}
 */
export class DeltaBuilder extends Delta {
  /**
   * @param {NodeName} [name]
   * @param {Schema} [$schema]
   */
  constructor (name, $schema) {
    super(name, $schema)
    /**
     * @type {FormattingAttributes?}
     */
    this.usedAttributes = null
    /**
     * @type {Attribution?}
     */
    this.usedAttribution = null
  }

  /**
   * @param {Attribution?} attribution
   */
  useAttribution (attribution) {
    this.usedAttribution = attribution
    return this
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
   * @template {keyof Attribution} NAME
   * @param {NAME} name
   * @param {Attribution[NAME]?} value
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
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,any,infer Children,infer Text,infer Schema> ? ((Children extends never ? never : Array<Children>) | Text) : never} NewContent
   * @param {NewContent} insert
   * @param {FormattingAttributes?} [formatting]
   * @param {Attribution?} [attribution]
   * @return {DeltaBuilder<
   *   NodeName,
   *   Attrs,
   *   Exclude<NewContent,string>[number]|Children,
   *   (Extract<NewContent,string>|Text) extends string ? string : never,
   *   Schema
   * >}
   */
  insert (insert, formatting = null, attribution = null) {
    const mergedAttributes = mergeAttrs(this.usedAttributes, formatting)
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    /**
     * @param {TextOp | InsertOp<any>} lastOp
     */
    const checkMergedEquals = lastOp => (mergedAttributes === lastOp.format || fun.equalityDeep(mergedAttributes, lastOp.format)) && (mergedAttribution === lastOp.attribution || fun.equalityDeep(mergedAttribution, lastOp.attribution))
    const end = this.children.end
    if (s.$string.check(insert)) {
      if ($textOp.check(end) && checkMergedEquals(end)) {
        end.insert += insert
      } else if (insert.length > 0) {
        list.pushEnd(this.children, new TextOp(insert, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution))
      }
    } else if (arr.isArray(insert)) {
      if ($insertOp.check(end) && checkMergedEquals(end)) {
        end.insert.push(...insert)
      } else if (insert.length > 0) {
        list.pushEnd(this.children, new InsertOp(insert, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution))
      }
    }
    return /** @type {any} */ (this)
  }

  /**
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,any,infer Children,any,any> ? Extract<Children,Delta<any,any,any,any,any>> : never} NewContent
   * @param {NewContent} modify
   * @param {FormattingAttributes?} formatting
   * @param {Attribution?} attribution
   * @return {DeltaBuilder<
   *   NodeName,
   *   Attrs,
   *   Exclude<NewContent,string>[number]|Children,
   *   (Extract<NewContent,string>|Text) extends string ? string : never,
   *   Schema
   * >}
   */
  modify (modify, formatting = null, attribution = null) {
    const mergedAttributes = mergeAttrs(this.usedAttributes, formatting)
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    list.pushEnd(this.children, new ModifyOp(modify, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution))
    return /** @type {any} */ (this)
  }

  /**
   * @param {number} len
   * @param {FormattingAttributes?} [format]
   * @param {Attribution?} [attribution]
   */
  retain (len, format = null, attribution = null) {
    const mergedFormats = mergeAttrs(this.usedAttributes, format)
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    const lastOp = /** @type {RetainOp|InsertOp<any>} */ (this.children.end)
    if (lastOp instanceof RetainOp && fun.equalityDeep(mergedFormats, lastOp.format) && fun.equalityDeep(mergedAttribution, lastOp.attribution)) {
      lastOp.retain += len
    } else if (len > 0) {
      list.pushEnd(this.children, new RetainOp(len, mergedFormats, mergedAttribution))
    }
    return this
  }

  /**
   * @param {number} len
   */
  delete (len) {
    const lastOp = /** @type {DeleteOp|InsertOp<any>} */ (this.children.end)
    if (lastOp instanceof DeleteOp) {
      lastOp.delete += len
    } else if (len > 0) {
      list.pushEnd(this.children, new DeleteOp(len))
    }
    return this
  }

  /**
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer Attrs,any,any,any> ? (keyof Attrs) : never} Key
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer Attrs,any,any,any> ? (Attrs[Key]) : never} Val
   * @param {Key} key
   * @param {Val} val
   * @param {Attribution?} attribution
   * @param {Val|undefined} [prevValue]
   * @return {DeltaBuilder<
   *   NodeName,
   *   { [K in keyof AddToAttrs<Attrs,Key,Val>]: AddToAttrs<Attrs,Key,Val>[K]  },
   *   Children,
   *   Text,
   *   Schema
   * >}
   */
  set (key, val, attribution = null, prevValue) {
    this.attrs[key] = /** @type {any} */ (new MapInsertOp(key, val, prevValue, mergeAttrs(this.usedAttribution, attribution)))
    return /** @type {any} */ (this)
  }

  /**
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer Attrs,any,any,any> ? Attrs : never} NewAttrs
   * @param {NewAttrs} attrs
   * @param {Attribution?} attribution
   * @return {DeltaBuilder<
   *   NodeName,
   *   { [K in keyof MergeAttrs<Attrs,NewAttrs>]: MergeAttrs<Attrs,NewAttrs>[K] },
   *   Children,
   *   Text,
   *   Schema
   * >}
   */
  setMany (attrs, attribution = null) {
    for (const k in attrs) {
      this.set(/** @type {any} */ (k), attrs[k], attribution)
    }
    return /** @type {any} */ (this)
  }

  /**
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer As,any,any,any> ? keyof As : never} Key
   * @param {Key} key
   * @param {Attribution?} attribution
   * @param {any} [prevValue]
   * @return {DeltaBuilder<
   *   NodeName,
   *   { [K in keyof AddToAttrs<Attrs,Key,never>]: AddToAttrs<Attrs,Key,never>[K] },
   *   Children,
   *   Text,
   *   Schema
   * >}
   */
  unset (key, attribution = null, prevValue) {
    this.attrs[key] = /** @type {any} */ (new MapDeleteOp(key, prevValue, mergeAttrs(this.usedAttribution, attribution)))
    return /** @type {any} */ (this)
  }

  /**
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer As,any,any,any> ? { [K in keyof As]: Extract<As[K],Delta<any,any,any,any,any>> extends never ? never : K }[keyof As] : never} Key
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer As,any,any,any> ? Extract<As[Key],Delta<any,any,any,any,any>> : never} D
   * @param {Key} key
   * @param {D} modify
   * @return {DeltaBuilder<
   *   NodeName,
   *   { [K in keyof AddToAttrs<Attrs,Key,D>]: AddToAttrs<Attrs,Key,D>[K]  },
   *   Children,
   *   Text,
   *   Schema
   * >}
   */
  update (key, modify) {
    this.attrs[key] = /** @type {any} */ (new MapModifyOp(key, modify))
    return /** @type {any} */ (this)
  }

  /**
   * @param {Delta<NodeName,Partial<Attrs>,Children,Text,any>} other
   */
  apply (other) {
    this.$schema?.expect(other)
    forEachAttr(/** @type {Delta<NodeName,Attrs,Children,Text,any>} */ (/** @type {any} */ (other)), op => {
      const c = this.attrs[op.key]
      if ($modifyOp.check(op)) {
        if ($deltaAny.check(c?.value)) {
          /** @type {DeltaBuilder} */ (c.value).apply(op.value)
        } else {
          // then this is a simple modify
          // @ts-ignore
          this.attrs[op.key] = op
        }
      } else {
        /** @type {MapInsertOp<any>} */ (op).prevValue = c?.value
        // @ts-ignore
        this.attrs[op.key] = op
      }
    })
    // apply children
    let opsI = this.children.start
    let offset = 0
    other.children.forEach(op => {
      if ($textOp.check(op) || $insertOp.check(op)) {
        if (offset === 0) {
          list.insertBetween(this.children, opsI == null ? this.children.end : opsI.prev, opsI, op.clone())
        } else {
          if (opsI == null) error.unexpectedCase()
          const cpy = opsI.clone()
          cpy._splice(0, offset)
          opsI._splice(offset, opsI.length - offset)
          list.insertBetween(this.children, opsI, opsI.next || null, cpy)
          list.insertBetween(this.children, opsI, cpy || null, op)
          offset = 0
        }
      } else if ($retainOp.check(op)) {
        let skipLen = op.length
        while (opsI != null && opsI.length - offset <= skipLen) {
          skipLen -= opsI.length - offset
          opsI = opsI?.next || null
          offset = 0
        }
        if (opsI != null) {
          offset += skipLen
        } else {
          list.pushEnd(this.children, new RetainOp(skipLen, op.format, op.attribution))
        }
      } else if ($deleteOp.check(op)) {
        let remainingLen = op.delete
        while (remainingLen > 0) {
          if (opsI == null) {
            list.pushEnd(this.children, new DeleteOp(remainingLen))
            break
          } else if (opsI instanceof DeleteOp) {
            const delLen = opsI.length - offset
            // the same content can't be deleted twice, remove duplicated deletes
            if (delLen >= remainingLen) {
              offset = 0
              opsI = opsI.next
            } else {
              offset += remainingLen
            }
            remainingLen -= delLen
          } else { // insert / embed / retain / modify ⇒ replace
            // case1: delete o fully
            // case2: delete some part of beginning
            // case3: delete some part of end
            // case4: delete some part of center
            const delLen = math.min(opsI.length - offset, remainingLen)
            if (opsI.length === delLen) {
              // case 1
              offset = 0
              list.remove(this.children, opsI)
            } else if (offset === 0) {
              // case 2
              offset = 0
              opsI._splice(0, delLen)
            } else if (offset + delLen === opsI.length) {
              // case 3
              opsI._splice(offset, delLen)
              offset = 0
              opsI = opsI.next
            } else {
              // case 4
              opsI._splice(offset, delLen)
            }
            remainingLen -= delLen
          }
        }
      } else if ($modifyOp.check(op)) {
        if (opsI == null) {
          list.pushEnd(this.children, op.clone())
          return
        }
        if ($modifyOp.check(opsI)) {
          /** @type {any} */ (opsI.value).apply(op.value)
        } else if ($textOp.check(opsI) || $insertOp.check(opsI)) {
          const d = opsI.insert[offset]
          if (!$deltaAny.check(d)) {
            // probably incompatible delta. can only modify deltas
            error.unexpectedCase()
          }
          /** @type {any} */ (d).apply(op.value)
        } else if ($retainOp.check(opsI)) {
          if (offset > 0) {
            const cpy = opsI.clone()
            cpy._splice(offset, opsI.length - offset) // skipped len
            opsI._splice(0, offset) // new remainder
            list.insertBetween(this.children, opsI.prev, opsI, cpy) // insert skipped len
            offset = 0
          }
          // not deleting opsI, because current idea is that modify should not
          // advance content
          list.insertBetween(this.children, opsI.prev, opsI, op.clone()) // insert skipped len
          if (opsI.length === 1) {
            list.remove(this.children, opsI)
          } else {
            opsI._splice(0, 1)
          }
        } else if ($deleteOp.check(opsI)) {
          // nop
        } else {
          error.unexpectedCase()
        }
      } else {
        error.unexpectedCase()
      }
    })
    return this
  }

  /**
   * @param {Delta<any,any,any,any,any>} other
   * @param {boolean} priority
   */
  rebase (other, priority) {
    // @todo rebase children
    /**
     * Rebase attributes
     *
     * - insert vs delete ⇒ insert takes precedence
     * - insert vs modify ⇒ insert takes precedence
     * - insert vs insert ⇒ priority decides
     * - delete vs modify ⇒ delete takes precedence
     * - delete vs delete ⇒ current delete op is removed because item has already been deleted
     * - modify vs modify ⇒ rebase using priority
     */
    forEachAttr(this, op => {
      if ($insertOp.check(op)) {
        if ($insertOp.check(other.attrs[op.key]) && !priority) {
          delete this.attrs[op.key]
        }
      } else if ($deleteOp.check(op)) {
        const otherOp = other.attrs[op.key]
        if ($insertOp.check(otherOp)) {
          delete this.attrs[otherOp.key]
        }
      } else if ($modifyOp.check(op)) {
        const otherOp = other.attrs[op.key]
        if (otherOp == null) {
          // nop
        } else if ($modifyOp.check(otherOp)) {
          op.value.rebase(otherOp.value, priority)
        } else {
          delete this.attrs[otherOp.key]
        }
      }
    })
    return this
  }

  /**
   * @return {Delta<NodeName,Attrs,Children,Text,Schema>}
   */
  done () {
    const cs = this.children
    for (let end = cs.end; end !== null && $retainOp.check(end) && end.format == null; end = cs.end) {
      list.popEnd(cs)
    }
    return this
  }
}

/**
 * @template {string} NodeName
 * @template {{ [key: string|number|symbol]: any }} [Attrs={}]
 * @template {any} [Children=never]
 * @template {string|never} [Text=never]
 * @typedef {Delta<NodeName,Attrs,Children|Delta<NodeName,Attrs,Children,Text>|RecursiveDelta<NodeName,Attrs,Children,Text>,Text>} RecursiveDelta
 */

/**
 * @template {string} [NodeName=any]
 * @template {{ [key: string|number|symbol]: any }} [Attrs={}]
 * @template {any} [Children=never]
 * @template {boolean} [HasText=false]
 * @template {boolean} [Recursive=false]
 * @param {object} opts
 * @param {s.Schema<NodeName>?} [opts.name]
 * @param {s.Schema<Attrs>?} [opts.attrs]
 * @param {s.Schema<Children>?} [opts.children]
 * @param {HasText} [opts.hasText]
 * @param {Recursive} [opts.recursive]
 * @return {s.Schema<Delta<
 *     NodeName,
 *     Attrs,
 *     Children|(Recursive extends true ? RecursiveDelta<NodeName,Attrs,Children,HasText extends true ? string : never> : never),
 *     HasText extends true ? string : never
 * >>}
 */
export const $delta = ({ name, attrs, children, hasText, recursive }) => {
  name = name == null ? s.$any : name
  /**
   * @type {s.Schema<Array<any>>}
   */
  let $arrContent = children == null ? s.$never : s.$array(children)
  const $attrsPartial = attrs == null ? s.$object({}) : (s.$$object.check(attrs) ? attrs.partial : attrs)
  const $d = s.$instanceOf(Delta, /** @param {Delta<any,any,any,any,any>} d */ d => {
    if (
      !name.check(d.name) ||
      object.some(d.attrs,
        (op, k) => $insertOp.check(op) && !$attrsPartial.check({ [k]: op.value })
      )
    ) return false
    for (const op of d.children) {
      if ((!hasText && $textOp.check(op)) || ($insertOp.check(op) && !$arrContent.check(op.insert))) {
        return false
      }
    }
    return true
  })
  if (recursive) {
    $arrContent = children == null ? s.$array($d) : s.$array(children, $d)
  }
  return /** @type {any} */ ($d)
}

export const $deltaAny = s.$instanceOf(Delta)

/**
 * Helper function to merge attribution and attributes. The latter input "wins".
 *
 * @template {{ [key: string]: any }} T
 * @param {T | null} a
 * @param {T | null} b
 */
export const mergeAttrs = (a, b) => object.isEmpty(a) ? b : (object.isEmpty(b) ? a : object.assign({}, a, b))

/**
 * @template {DeltaBuilder?} D
 * @param {D} a
 * @param {D} b
 * @return {D}
 */
export const mergeDeltas = (a, b) => {
  if (a != null && b != null) {
    const c = /** @type {Exclude<D,null>} */ (a.clone())
    c.apply(b)
    return c
  }
  return a == null ? b : (a || null)
}

/**
 * @overload
 * @return {DeltaBuilder<any,{},never,never,null>}
 */
/**
 * @template {string} NodeName
 * @overload
 * @param {NodeName} nodeName
 * @return {DeltaBuilder<NodeName,{},never,never,null>}
 */
/**
 * @template {string} NodeName
 * @template {s.Schema<DeltaAny>} Schema
 * @overload
 * @param {NodeName} nodeName
 * @param {Schema} schema
 * @return {Schema extends s.Schema<Delta<infer N,infer Attrs,infer Children,infer Text,any>> ? DeltaBuilder<NodeName,Attrs,Children,Text,Schema> : never}
 */
/**
 * @template {s.Schema<Delta<any,any,any,any,any>>} Schema
 * @overload
 * @param {Schema} schema
 * @return {Schema extends s.Schema<Delta<infer N,infer Attrs,infer Children,infer Text,any>> ? DeltaBuilder<N,Attrs,Children,Text,Schema> : never}
 */
/**
 * @template {string|null} NodeName
 * @template {{[k:string|number|symbol]:any}|null} Attrs
 * @template {Array<any>|string} Children
 * @overload
 * @param {NodeName} nodeName
 * @param {Attrs} attrs
 * @param {Children} [children]
 * @return {DeltaBuilder<
 *   NodeName extends null ? any : NodeName,
 *   Attrs extends null ? {} : Attrs,
 *   Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   Extract<Children,string>,
 *   null
 * >}
 */
/**
 * @param {string|s.Schema<Delta<any,any,any,any,any>>} [nodeNameOrSchema]
 * @param {{[K:string|number|symbol]:any}|s.Schema<Delta<any,any,any,any,any>>} [attrsOrSchema]
 * @param {(Array<any>|string)} [children]
 * @return {DeltaBuilder<any,any,any,any,any>}
 */
export const create = (nodeNameOrSchema, attrsOrSchema, children) => {
  const nodeName = /** @type {any} */ (s.$string.check(nodeNameOrSchema) ? nodeNameOrSchema : null)
  const schema = /** @type {any} */ (s.$$schema.check(nodeNameOrSchema) ? nodeNameOrSchema : (s.$$schema.check(attrsOrSchema) ? attrsOrSchema : null))
  const d = /** @type {DeltaBuilder<any,any,any,string,null>} */ (new Delta(nodeName, schema))
  if (s.$objectAny.check(attrsOrSchema)) {
    d.setMany(attrsOrSchema)
  }
  children && d.insert(children)
  return d
}

// DELTA TEXT

/**
 * @template [Embeds=never]
 * @typedef {Delta<any,{},Embeds,string>} TextDelta
 */

/**
 * @template [Embeds=never]
 * @typedef {DeltaBuilder<any,{},Embeds,string>} TextDeltaBuilder
 */

/**
 * @template {Array<s.Schema<any>>} [$Embeds=any]
 * @param {$Embeds} $embeds
 * @return {s.Schema<TextDelta<_AnyToNull<$Embeds> extends null ? never : ($Embeds extends Array<s.Schema<infer $C>> ? $C : never)>>}
 */
export const $text = (...$embeds) => /** @type {any} */ ($delta({ children: s.$union(...$embeds), hasText: true }))
export const $textOnly = $text()

/**
 * @template {s.Schema<Delta<any,{},any,any,null>>} [Schema=s.Schema<Delta<any,{},never,string,null>>]
 * @param {Schema} [$schema]
 * @return {Schema extends s.Schema<Delta<infer N,infer Attrs,infer Children,infer Text,any>> ? DeltaBuilder<N,Attrs,Children,Text,Schema> : never}
 */
export const text = $schema => /** @type {any} */ (create($schema || $textOnly))

/**
 * @template {any} Children
 * @typedef {Delta<any,{},Children,never>} ArrayDelta
 */

/**
 * @template {any} Children
 * @typedef {DeltaBuilder<any,{},Children,never>} ArrayDeltaBuilder
 */

/**
 * @template {s.Schema<any>} $Children
 * @param {$Children} [$children]
 * @return {s.Schema<ArrayDelta<$Children>>}
 */
export const $array = $children => $delta({ children: $children })

/**
 * @template {s.Schema<ArrayDelta<any>>} [$Schema=never]
 * @param {$Schema} $schema
 * @return {$Schema extends never ? ArrayDeltaBuilder<never> : DeltaBuilder<any,{},never,never,$Schema>}
 */
export const array = $schema => /** @type {any} */ ($schema ? create($schema) : create())

/**
 * @template {{ [K: string|number|symbol]: any }} Attrs
 * @typedef {Delta<any,Attrs,never,never>} MapDelta
 */

/**
 * @template {{ [K: string|number|symbol]: any }} Attrs
 * @typedef {DeltaBuilder<any,Attrs,never,never>} MapDeltaBuilder
 */

/**
 * @template {{ [K: string|number|symbol]: any }} $Attrs
 * @param {s.Schema<$Attrs>} $attrs
 * @return {s.Schema<MapDelta<$Attrs>>}
 */
export const $map = $attrs => /** @type {any} */ ($delta({ attrs: $attrs }))

/**
 * @template {s.Schema<MapDelta<any>>|undefined} [$Schema=undefined]
 * @param {$Schema} [$schema]
 * @return {$Schema extends s.Schema<MapDelta<infer Attrs>> ? DeltaBuilder<any,Attrs,never,never,$Schema> : MapDeltaBuilder<{}>}
 */
export const map = $schema => /** @type {any} */ (create(/** @type {any} */ ($schema)))
