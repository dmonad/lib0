import * as ops from './ops.js'
import * as list from '../list.js'
import * as map from '../map.js'
import * as object from '../object.js'
import * as traits from '../traits.js'
import * as error from '../error.js'
import * as fun from '../function.js'
import * as s from '../schema.js'

export const $attribution = s.$object({
  insert: s.$array(s.$string).optional,
  insertAt: s.$number.optional,
  delete: s.$array(s.$string).optional,
  deleteAt: s.$number.optional,
  format: s.$record(s.$string, s.$array(s.$string)).optional,
  formatAt: s.$number.optional
})

/**
 * @typedef {s.TypeOf<$attribution>} Attribution
 */

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
 * @typedef {{ insert: string|Array<any>, format?: { [key: string]: any }, attribution?: Attribution } | { delete: number } | { retain: number, format?: { [key:string]: any }, attribution?: Attribution } | { modify: object }} DeltaListOpJSON
 */

/**
 * @typedef {{ type: 'insert', insert: any, attribution?: Attribution } | { type: 'delete', attribution?: Attribution } | { type: 'modify', modify: DeltaJSON }} DeltaAttrOpJSON
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
const _cloneMaybeDelta = maybeDelta => $deltaAny.check(maybeDelta) ? maybeDelta.clone() : maybeDelta

export class TextOp extends list.ListNode {
  /**
   * @param {string} insert
   * @param {FormattingAttributes|null} format
   * @param {Attribution|null} attribution
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
    return object.assign({ insert: this.insert }, this.format ? { format: this.format } : ({}), this.attribution ? { attribution: this.attribution } : ({}))
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
 * @template {any} ArrayContent
 */
export class InsertOp extends list.ListNode {
  /**
   * @param {Array<ArrayContent>} insert
   * @param {FormattingAttributes|null} format
   * @param {Attribution|null} attribution
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
    return object.assign({ insert: this.insert.map(ins => $deltaAny.check(ins) ? ins.toJSON() : ins) }, this.format ? { format: this.format } : ({}), this.attribution ? { attribution: this.attribution } : ({}))
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
   * @param {number} offset
   * @param {number} len
   */
  _splice (offset, len) {
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
   * @param {Attribution|null} attribution
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
    return object.assign({ retain: this.retain }, this.format ? { format: this.format } : {}, this.attribution ? { attribution: this.attribution } : {})
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
 * @template {{ toJSON(): any } & traits.EqualityTrait & { clone: any }} DTypes
 */
export class ModifyOp extends list.ListNode {
  /**
   * @param {DTypes} delta
   * @param {FormattingAttributes|null} format
   * @param {Attribution|null} attribution
   */
  constructor (delta, format, attribution) {
    super()
    this.modify = delta
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
   * @param {number} len
   */
  _splice (_offset, len) {
  }

  /**
   * @return {DeltaListOpJSON}
   */
  toJSON () {
    return object.assign({ modify: this.modify.toJSON() }, this.format ? { format: this.format } : {}, this.attribution ? { attribution: this.attribution } : {})
  }

  /**
   * @param {ModifyOp<any>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.modify[traits.EqualityTraitSymbol](other.modify) && fun.equalityDeep(this.format, other.format) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @return {ModifyOp<DTypes>}
   */
  clone () {
    return new ModifyOp(this.modify.clone(), _cloneAttrs(this.format), _cloneAttrs(this.attribution))
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
    return {
      type: this.type,
      value: $deltaAny.check(this.value) ? this.value.toJSON() : this.value,
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
   * @param {Attribution} attribution
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
 * @template {Delta} Modifier
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
      modify: this.value.toJSON()
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

export const $deltaMapChangeJson = s.$union(
  s.$object({ type: s.$literal('insert'), value: s.$any, attribution: $attribution.nullable.optional }),
  s.$object({ type: s.$literal('modify'), value: s.$any }),
  s.$object({ type: s.$literal('delete'), attribution: $attribution.nullable.optional })
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
 * @template {Delta} Modify
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

/**
 * @template {Array<any>|string} C1
 * @template {Array<any>|string} C2
 * @typedef {Extract<C1 | C2, Array<any>> extends never 
 *   ? never 
 *   : (Array<(Extract<C1 | C2,Array<any>> extends Array<infer AC1> ? AC1 : never)>)} MergeListArrays
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
 * @template {s.Schema<Delta<any,any,any>>|null} Schema
 * @typedef {Schema extends null ? Delta<any,{[key:string|number|symbol]:any},Array<any>|string> : (Schema extends s.Schema<infer D> ? D : never)} AllowedDeltaFromSchema
 */

/**
 * @template {string} [NodeName=any]
 * @template {{[key:string|number|symbol]:any}} [out Attrs={}]
 * @template {Array<any>|string} [out List=never]
 * @template {s.Schema<Delta<any,any,any>>|null} [Schema=any]
 */
class Delta {
  /**
   * @param {NodeName} [name]
   * @param {Schema} [$schema]
   */
  constructor (name, $schema) {
    this.name = name || null
    this.$schema = $schema || null
    /**
     * @type {Map<keyof Attrs, { [K in keyof Attrs]: ops.MapInsertOp<Attrs[K],K>|ops.MapDeleteOp<Attrs[K],K>|(Delta extends Attrs[K] ? ops.MapModifyOp<Extract<Attrs[K],Delta>,K> : never) }[keyof Attrs]>}
     */
    this.attrs = map.create()
    /**
     * @type {list.List<
     *   ops.RetainOp
     *   | ops.DeleteOp
     *   | (string extends List ? ops.TextOp : never)
     *   | (Array<any> extends List ? ops.InsertOp<Extract<List,Array<any>>> : never)
     *   | (Delta extends List ? ops.ModifyOp<Extract<List,Delta>> : never)
     * >}
     */
    this.children = /** @type {any} */ (list.create())
    /**
     * @type {FormattingAttributes?}
     */
    this.usedAttributes = null
    /**
     * @type {Attribution?}
     */
    this.usedAttribution = null
    /**
     * @type {any}
     */
    this.origin = null
  }

  isEmpty () {
    return this.attrs.size === 0 && list.isEmpty(this.children)
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
    this.attrs.forEach(attr => {
      attrs[attr.key] = attr.toJSON()
    })
    this.children.forEach(val => {
      children.push(val.toJSON())
    })
    return object.assign(
      (this.name != null ? { name: this.name } : {}),
      (attrs != null ? { attrs } : {}),
      (children != null ? { children } : {}),
    )
  }

  /**
   * @param {Delta<any,any,any,any>} other
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
     * @type {Delta<any,{[k:string|number|symbol]:any},any>}
     */
    const d = new Delta(/** @type {any} */ (this.name), this.$schema)
    this.attrs.forEach(op => {
      d.attrs.set(op.key, /** @type {any} */ (op))
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

  /**
   * @param {import('./abstract.js').Attribution?} attribution
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
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,any,infer L> ? L : never} NewContent
   * @param {NewContent} listContent
   * @param {FormattingAttributes} [formatting]
   * @return {Delta<
   *   NodeName,
   *   Attrs,
   *   (string extends (List|(NewContent extends string ? string : never)) ? string : never)
   *     | (MergeListArrays<List,NewContent> extends Array<infer AC> ? (unknown extends AC ? never : Array<AC>) : never),
   *   Schema
   * >}
   */
  insert (listContent, formatting) {
    return /** @type {any} */ (this)
  }

  /**
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer Attrs,any> ? (keyof Attrs) : never} Key
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer Attrs,any> ? (Attrs[Key]) : never} Val
   * @param {Key} key
   * @param {Val} val
   * @param {import('./abstract.js').Attribution?} attribution
   * @return {Delta<
   *   NodeName,
   *   { [K in keyof AddToAttrs<Attrs,Key,Val>]: AddToAttrs<Attrs,Key,Val>[K]  },
   *   List,
   *   Schema
   * >}
   */
  set (key, val, attribution = null) {
    this.attrs.set(key, /** @type {any} */ (new ops.MapInsertOp(key, val, null, mergeAttrs(this.usedAttribution, attribution))))
    return /** @type {any} */ (this)
  }

  /**
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer Attrs,any> ? Attrs : never} NewAttrs
   * @param {NewAttrs} attrs
   * @param {import('./abstract.js').Attribution?} attribution
   * @return {Delta<
   *   NodeName,
   *   { [K in keyof MergeAttrs<Attrs,NewAttrs>]: MergeAttrs<Attrs,NewAttrs>[K]  },
   *   List,
   *   Schema
   * >}
   */
  setMany (attrs, attribution = null) {
    for (let k in attrs) {
      this.set(/** @type {any} */ (k), attrs[k], attribution)
    }
    return this
  }

  /**
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer As,any> ? keyof As : never} Key
   * @param {Key} key
   * @param {import('./abstract.js').Attribution?} attribution
   * @return {Delta<
   *   NodeName,
   *   { [K in keyof AddToAttrs<Attrs,Key,never>]: AddToAttrs<Attrs,Key,never>[K] },
   *   List,
   *   Schema
   * >}
   */
  unset (key, attribution = null) {
    this.attrs.set(key, /** @type {any} */ (new ops.MapDeleteOp(key, null, mergeAttrs(this.usedAttribution, attribution))))
    return this
  }

  /**
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer As,any> ? { [K in keyof As]: Delta<any,any,any,any> extends As[K] ? K : never }[keyof As] : never} Key
   * @template {AllowedDeltaFromSchema<Schema> extends Delta<any,infer As,any> ? Extract<As[Key],Delta<any,any,any,any>> : never} D
   * @param {Key} key
   * @param {D} modify
   * @return {Delta<
   *   NodeName,
   *   { [K in keyof AddToAttrs<Attrs,Key,D>]: AddToAttrs<Attrs,Key,D>[K]  },
   *   List,
   *   Schema
   * >}
   */
  modify (key, modify) {
    this.attrs.set(key, /** @type {any} */ (new ops.MapModifyOp(key, modify)))
    return this
  }

  /**
   * @param {Delta<NodeName,Partial<Attrs>,List,any>} other
   * @return {this}
   */
  apply (other) {
    this.$schema?.expect(other)
    ;/** @type {Delta<NodeName,Attrs,List,any>} */ (other).attrs.forEach(op => {
      const c = this.attrs.get(op.key)
      if (ops.$modifyOp.check(op)) {
        if ($deltaAny.check(c?.value)) {
          /** @type {Delta} */ (c.value).apply(op.value)
        } else {
          // then this is a simple modify
          this.attrs.set(op.key, /** @type {any} */ (op))
        }
      } else {
        /** @type {ops.MapInsertOp<any>} */ (op).prevValue = c?.value
        this.attrs.set(op.key, /** @type {any} */ (op))
      }
    })
    return this
  }

  /**
   * @param {Delta} other
   * @param {boolean} priority
   */
  rebase (other, priority) {
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
    this.attrs.forEach(op => {
      if (ops.$insertOp.check(op)) {
        if (ops.$insertOp.check(other.attrs.get(op.key)) && !priority) {
          this.attrs.delete(op.key)
        }
      } else if (ops.$deleteOp.check(op)) {
        const otherOp = other.attrs.get(op.key)
        if (ops.$insertOp.check(otherOp)) {
          this.attrs.delete(otherOp.key)
        }
      } else if (ops.$modifyOp.check(op)) {
        const otherOp = other.attrs.get(op.key)
        if (otherOp == null) {
          // nop
        } else if (ops.$modifyOp.check(otherOp)) {
          op.value.rebase(otherOp.value, priority)
        } else {
          this.attrs.delete(otherOp.key)
        }
      }
    })
  }
}

/**
 * @template {string} NodeName
 * @template {{ [key: string|number|symbol]: any }} Attrs
 * @template {any} List
 * @param {s.Schema<NodeName>} $nodeName
 * @param {s.Schema<Attrs>} $attrs
 * @param {s.Schema<List>} $list
 * @return {s.Schema<Delta<NodeName,Attrs,List>>}
 */
export const $delta = ($nodeName, $attrs, $list) => {
  const $attrsPartial = s.$$object.check($attrs) ? $attrs.partial : $attrs
  return /** @type {any} */ (s.$instanceOf(Delta, /** @param {Delta<any,any,any>} d */ d => {
    if (
      !$nodeName.check(d.name)
      || Array.from(d.attrs.entries()).every(
          ([k, op]) => !ops.$insertOp.check(op) || $attrsPartial.check({ [k]: op.value })
         )
    ) return false
    for (const op of d.children) {
      if ((ops.$insertOp.check(op) || ops.$textOp.check(op)) && !$list.check(op.insert)) {
        return false
      }
    }
    return true
  }))
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
 * @template {Delta?} D
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
 * @return {Delta<any,{},never,null>}
 */
/**
 * @template {string} NodeName
 * @overload
 * @param {NodeName} nodeName
 * @return {Delta<NodeName,{},never,null>}
 */
/**
 * @template {string} NodeName
 * @template {s.Schema<Delta<any,any,any,any>>} Schema
 * @overload
 * @param {NodeName} nodeName
 * @param {Schema} schema
 * @return {Schema extends s.Schema<Delta<infer N,infer Attrs,infer List,any>> ? Delta<NodeName,Attrs,List,Schema> : never}
 */
/**
 * @template {s.Schema<Delta<any,any,any,any>>} Schema
 * @overload
 * @param {Schema} schema
 * @return {Schema extends s.Schema<Delta<infer N,infer Attrs,infer List,any>> ? Delta<N,Attrs,List,Schema> : never}
 */
/**
 * @template {string|null} NodeName
 * @template {{[k:string|number|symbol]:any}|null} Attrs
 * @template {Array<any>|string} Children
 * @overload
 * @param {NodeName} nodeName
 * @param {Attrs} attrs
 * @param {...Children} children
 * @return {Delta<NodeName extends null ? any : NodeName,Attrs extends null ? {} : Attrs,Children[number],null>}
 */
/**
 * @param {string|s.Schema<Delta<any,any,any,any>>} [nodeNameOrSchema]
 * @param {{[K:string|number|symbol]:any}|s.Schema<Delta<any,any,any,any>>} [attrsOrSchema]
 * @param {Array<Array<any>|string>} children
 * @return {Delta<any,any,any,any>}
 */
export const create = (nodeNameOrSchema, attrsOrSchema, ...children) => {
  const nodeName = /** @type {any} */ (s.$string.check(nodeNameOrSchema) ? nodeNameOrSchema : null)
  const schema = /** @type {any} */ (s.$$schema.check(nodeNameOrSchema) ? nodeNameOrSchema : (s.$$schema.check(attrsOrSchema) ? attrsOrSchema : null))
  const d = /** @type {Delta<any,any,any,null>} */ (new Delta(nodeName, schema))
  if (s.$objectAny.check(attrsOrSchema)) {
    d.setMany(attrsOrSchema)
  }
  if (s.$arrayAny.check(children)) {
    children.forEach(v => {
      d.insert(v)
    })
  }
  return d
}

const ds_ = create($delta(s.$string, s.$object({ k: s.$number }), s.$string))
const ds = create('root', $delta(s.$string, s.$object({ k: s.$number, d: $delta(s.$literal('sub'), s.$object({  }), s.$string) }), s.$string))
ds.insert('dtrn')
ds.modify('d', create('sub', null, 'hi'))
ds.apply(create('root', { k: 42 }, 'content'))
ds.apply(create('root', { k: 42 }))
// @ts-expect-error
ds.apply(create('root', { k: 'hi' }, 'content'))

const m42 = create('42').insert([42])


const d1 = create().insert('hi')
const q = d1.insert([42]).insert('hi').insert([{ there: 42 }]).insert(['']).insert(['dtrn']).insert('stri').insert('dtruniae')
const p = d1.set('hi', 'there').set('test', 42).set(42, 43)
const t = create().insert('dtrn').insert([42]).insert(['', { q: 42} ]).set('kv', false).set('x', 42)

// @ts-expect-error
const applyTest = create().insert('hi').apply(create().insert('there').insert([42]))
// @ts-expect-error
const applyTestMap = create().set('x', 42).apply(create().set('x', '42'))
// @ts-expect-error
const applyTestMap2 = create().set('x', 42).apply(create().set('y', '42'))
const applyMapTest3 = create().set('x', 42).apply(create().unset('x'))
const t2 = create().insert('hi').insert(['there']).set('k', '42').set('k', 42)
const applyTest2 = t2.apply(create().insert('there').insert(['dtrn']).set('k', 42))

const m = create().set('x', 42).set('y', 'str').insert('hi').insert([42])
m.apply(create().set('y', undefined).insert('hi'))

const m2 = m.set('k', m).modify('k', m)

/**
 * @type {Delta<any,Record<string,number>>}
 */
const tRecord = create()

const gen1 = create('node-name', { kv: 42 }, [42], 'str')
const gen2 = create('node-name', null, [42], 'str')
