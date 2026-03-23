/**
 * @beta this API is about to change
 *
 * ## Mutability
 *
 * Deltas are mutable by default. But references are often shared, by marking a Delta as "done". You
 * may only modify deltas by applying other deltas to them. Casting a Delta to a DeltaBuilder
 * manually, will likely modify "shared" state.
 */

import * as list from '../list.js'
import * as object from '../object.js'
import * as equalityTrait from '../trait/equality.js'
import * as fingerprintTrait from '../trait/fingerprint.js'
import * as arr from '../array.js'
import * as fun from '../function.js'
import * as s from '../schema.js'
import * as error from '../error.js'
import * as math from '../math.js'
import * as rabin from '../hash/rabin.js'
import * as encoding from '../encoding.js'
import * as buffer from '../buffer.js'
import * as patience from '../diff/patience.js'
import * as prng from '../prng.js'

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
export const $attribution = /* @__PURE__ */(() => s.$object({
  insert: s.$array(s.$string).optional,
  insertAt: s.$number.optional,
  delete: s.$array(s.$string).optional,
  deleteAt: s.$number.optional,
  format: s.$record(s.$string, s.$array(s.$string)).optional,
  formatAt: s.$number.optional
}))()

/**
 * @typedef {{ [key: string]: any }} FormattingAttributes
 */

/**
 * @typedef {{
 *   type: 'delta',
 *   name?: string,
 *   attrs?: { [Key in string|number]: DeltaAttrOpJSON },
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
 * @typedef {TextOp|InsertOp<any>|DeleteOp|RetainOp|ModifyOp<any>} ChildrenOpAny
 */

/**
 * @typedef {SetAttrOp<any>|DeleteAttrOp<any>|ModifyAttrOp} AttrOpAny
 */

/**
 * @typedef {ChildrenOpAny|AttrOpAny} _OpAny
 */

/**
 * @type {s.Schema<DeltaAttrOpJSON>}
 */
export const $deltaMapChangeJson = /* @__PURE__ */(() => s.$union(
  s.$object({ type: s.$literal('insert'), value: s.$any, prevValue: s.$any.optional, attribution: $attribution.optional }),
  s.$object({ type: s.$literal('modify'), value: s.$any }),
  s.$object({ type: s.$literal('delete'), prevValue: s.$any.optional, attribution: $attribution.optional })
))()

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
const _markMaybeDeltaAsDone = maybeDelta => $deltaAny.check(maybeDelta) ? /** @type {MaybeDelta} */ (maybeDelta.done()) : maybeDelta

export class TextOp extends list.ListNode {
  /**
   * @param {string} insert
   * @param {FormattingAttributes|null} format
   * @param {Attribution?} attribution
   */
  constructor (insert, format, attribution) {
    super()
    // Whenever this is modified, make sure to clear _fingerprint
    /**
     * @readonly
     * @type {string}
     */
    this.insert = insert
    /**
     * @readonly
     * @type {FormattingAttributes|null}
     */
    this.format = format
    this.attribution = attribution
    /**
     * @type {string?}
     */
    this._fingerprint = null
  }

  /**
   * @param {string} newVal
   */
  _updateInsert (newVal) {
    // @ts-ignore
    this.insert = newVal
    this._fingerprint = null
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

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 0) // textOp type: 0
      encoding.writeVarString(encoder, this.insert)
      encoding.writeAny(encoder, this.format)
    })))
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} offset
   * @param {number} len
   */
  _splice (offset, len) {
    this._fingerprint = null
    // @ts-ignore
    this.insert = this.insert.slice(0, offset) + this.insert.slice(offset + len)
    return this
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
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $textOp.check(other) && fun.equalityDeep(this.insert, other.insert) && fun.equalityDeep(this.format, other.format) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @return {TextOp}
   */
  clone (start = 0, end = this.length) {
    return new TextOp(this.insert.slice(start, end), _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * @template {any} ArrayContent
 */
export class InsertOp extends list.ListNode {
  /**
   * @param {Array<ArrayContent>} insert
   * @param {FormattingAttributes|null} format
   * @param {Attribution?} attribution
   */
  constructor (insert, format, attribution) {
    super()
    /**
     * @readonly
     * @type {Array<ArrayContent>}
     */
    this.insert = insert
    /**
     * @readonly
     * @type {FormattingAttributes?}
     */
    this.format = format
    /**
     * @readonly
     * @type {Attribution?}
     */
    this.attribution = attribution
    /**
     * @type {string?}
     */
    this._fingerprint = null
  }

  /**
   * @param {ArrayContent} newVal
   */
  _updateInsert (newVal) {
    // @ts-ignore
    this.insert = newVal
    this._fingerprint = null
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
   * @param {number} i
   * @return {Extract<ArrayContent,DeltaAny>}
   */
  _modValue (i) {
    /**
     * @type {any}
     */
    let d = this.insert[i]
    this._fingerprint = null
    $deltaAny.expect(d)
    if (d.isDone) {
      // @ts-ignore
      this.insert[i] = (d = clone(d))
      return d
    }
    return d
  }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 1) // insertOp type: 1
      encoding.writeVarUint(encoder, this.insert.length)
      this.insert.forEach(ins => {
        encoding.writeVarString(encoder, fingerprintTrait.fingerprint(/** @type {any} */ (ins)))
      })
      encoding.writeAny(encoder, this.format)
    })))
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} offset
   * @param {number} len
   */
  _splice (offset, len) {
    this._fingerprint = null
    this.insert.splice(offset, len)
    return this
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
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $insertOp.check(other) && fun.equalityDeep(this.insert, other.insert) && fun.equalityDeep(this.format, other.format) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @return {InsertOp<ArrayContent>}
   */
  clone (start = 0, end = this.length) {
    return new InsertOp(this.insert.slice(start, end).map(_markMaybeDeltaAsDone), _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * @template {DeltaConf} [Conf={}]
 */
export class DeleteOp extends list.ListNode {
  /**
   * @param {number} len
   * @param {DeltaBuilder<any>?} prevValue
   */
  constructor (len, prevValue) {
    super()
    this.delete = len
    this.prevValue = /** @type {Delta<Conf>?} */ (prevValue)
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @return {'delete'}
   */
  get type () {
    return 'delete'
  }

  get length () {
    return this.delete
  }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 2) // deleteOp type: 2
      encoding.writeVarUint(encoder, this.delete)
    })))
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} _offset
   * @param {number} len
   */
  _splice (_offset, len) {
    this.prevValue = /** @type {any} */ (this.prevValue ? slice(this.prevValue, _offset, len) : null)
    this._fingerprint = null
    this.delete -= len
    return this
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
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $deleteOp.check(other) && this.delete === other.delete
  }

  /**
   * @param {number} start
   * @param {number} end
   * @return {DeleteOp}
   */
  clone (start = 0, end = this.delete) {
    return new DeleteOp(end - start, null)
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
    /**
     * @readonly
     * @type {number}
     */
    this.retain = retain
    /**
     * @readonly
     * @type {FormattingAttributes?}
     */
    this.format = format
    /**
     * @readonly
     * @type {Attribution?}
     */
    this.attribution = attribution
    /**
     * @type {string|null}
     */
    this._fingerprint = null
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

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 3) // retainOp type: 3
      encoding.writeVarUint(encoder, this.retain)
      encoding.writeAny(encoder, this.format)
    })))
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} _offset
   * @param {number} len
   */
  _splice (_offset, len) {
    // @ts-ignore
    this.retain -= len
    this._fingerprint = null
    return this
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
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $retainOp.check(other) && this.retain === other.retain && fun.equalityDeep(this.format, other.format) && fun.equalityDeep(this.attribution, other.attribution)
  }

  clone (start = 0, end = this.retain) {
    return new RetainOp(end - start, _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * Delta that can be applied on a YType Embed
 *
 * @template {Delta} [DTypes=DeltaAny]
 */
export class ModifyOp extends list.ListNode {
  /**
   * @param {DTypes} delta
   * @param {FormattingAttributes|null} format
   * @param {Attribution?} attribution
   */
  constructor (delta, format, attribution) {
    super()
    /**
     * @readonly
     * @type {DTypes}
     */
    this.value = delta
    /**
     * @readonly
     * @type {FormattingAttributes?}
     */
    this.format = format
    /**
     * @readonly
     * @type {Attribution?}
     */
    this.attribution = attribution
    /**
     * @type {string|null}
     */
    this._fingerprint = null
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
   * @type {DeltaBuilderAny}
   */
  get _modValue () {
    /**
     * @type {any}
     */
    const d = this.value
    this._fingerprint = null
    if (d.isDone) {
      // @ts-ignore
      return (this.value = clone(d))
    }
    return d
  }

  get fingerprint () {
    // don't cache fingerprint because we don't know when delta changes
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 4) // modifyOp type: 4
      encoding.writeVarString(encoder, this.value.fingerprint)
      encoding.writeAny(encoder, this.format)
    })))
  }

  /**
   * Remove a part of the operation (similar to Array.splice)
   *
   * @param {number} _offset
   * @param {number} _len
   */
  _splice (_offset, _len) {
    return this
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
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $modifyOp.check(other) && this.value[equalityTrait.EqualityTraitSymbol](other.value) && fun.equalityDeep(this.format, other.format) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @return {ModifyOp<DTypes>}
   */
  clone () {
    return new ModifyOp(/** @type {DTypes} */ (this.value.done()), _cloneAttrs(this.format), _cloneAttrs(this.attribution))
  }
}

/**
 * @template {any} [V=any]
 * @template {string|number} [K=any]
 */
export class SetAttrOp {
  /**
   * @param {K} key
   * @param {V} value
   * @param {V|undefined} prevValue
   * @param {Attribution?} attribution
   */
  constructor (key, value, prevValue, attribution) {
    /**
     * @readonly
     * @type {K}
     */
    this.key = key
    /**
     * @readonly
     * @type {V}
     */
    this.value = value
    /**
     * @readonly
     * @type {V|undefined}
     */
    this.prevValue = prevValue
    /**
     * @readonly
     * @type {Attribution?}
     */
    this.attribution = attribution
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @return {'insert'}
   */
  get type () { return 'insert' }

  /**
   * @type {DeltaBuilderAny}
   */
  get _modValue () {
    /**
     * @type {any}
     */
    const v = this.value
    this._fingerprint = null
    if ($deltaAny.check(v) && v.isDone) {
      // @ts-ignore
      return (this.value = clone(v))
    }
    return v
  }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 5) // map insert type: 5
      encoding.writeAny(encoder, this.key)
      if ($deltaAny.check(this.value)) {
        encoding.writeUint8(encoder, 0)
        encoding.writeVarString(encoder, this.value.fingerprint)
      } else {
        encoding.writeUint8(encoder, 1)
        encoding.writeAny(encoder, /** @type {any} */ (this.value))
      }
    })))
  }

  toJSON () {
    const v = this.value
    const attribution = this.attribution
    return object.assign(
      {
        type: this.type,
        value: $deltaAny.check(v) ? v.toJSON() : v
      },
      attribution != null ? { attribution } : {}
    )
  }

  /**
   * @param {SetAttrOp<V>} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $setAttrOp.check(other) && this.key === other.key && fun.equalityDeep(this.value, other.value) && fun.equalityDeep(this.attribution, other.attribution)
  }

  /**
   * @return {SetAttrOp<V,K>}
   */
  clone () {
    return new SetAttrOp(this.key, _markMaybeDeltaAsDone(this.value), _markMaybeDeltaAsDone(this.prevValue), _cloneAttrs(this.attribution))
  }
}

/**
 * @template [V=any]
 * @template {string|number} [K=string|number]
 */
export class DeleteAttrOp {
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
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @type {'delete'}
   */
  get type () { return 'delete' }

  get value () { return undefined }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 6) // map delete type: 6
      encoding.writeAny(encoder, this.key)
    })))
  }

  /**
   * @return {DeltaAttrOpJSON}
   */
  toJSON () {
    const {
      type, attribution
    } = this
    return object.assign(
      { type },
      attribution != null ? { attribution } : {}
    )
  }

  /**
   * @param {DeleteAttrOp<V>} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $deleteAttrOp.check(other) && this.key === other.key && fun.equalityDeep(this.attribution, other.attribution)
  }

  clone () {
    return new DeleteAttrOp(this.key, _markMaybeDeltaAsDone(this.prevValue), _cloneAttrs(this.attribution))
  }
}

/**
 * @template {DeltaAny} [Modifier=DeltaAny]
 * @template {string|number} [K=string]
 */
export class ModifyAttrOp {
  /**
   * @param {K} key
   * @param {Modifier} delta
   */
  constructor (key, delta) {
    /**
     * @readonly
     * @type {K}
     */
    this.key = key
    /**
     * @readonly
     * @type {Modifier}
     */
    this.value = delta
    /**
     * @type {string|null}
     */
    this._fingerprint = null
  }

  /**
   * @type {'modify'}
   */
  get type () { return 'modify' }

  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeVarUint(encoder, 7) // map modify type: 7
      encoding.writeAny(encoder, this.key)
      encoding.writeVarString(encoder, this.value.fingerprint)
    })))
  }

  /**
   * @return {DeltaBuilder}
   */
  get _modValue () {
    this._fingerprint = null
    if (this.value.isDone) {
      // @ts-ignore
      this.value = /** @type {any} */ (clone(this.value))
    }
    // @ts-ignore
    return this.value
  }

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
   * @param {ModifyAttrOp<Modifier>} other
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    return $modifyAttrOp.check(other) && this.key === other.key && this.value[equalityTrait.EqualityTraitSymbol](other.value)
  }

  /**
   * @return {ModifyAttrOp<Modifier,K>}
   */
  clone () {
    return new ModifyAttrOp(this.key, /** @type {Modifier} */ (this.value.done()))
  }
}

export const $insertOp = /** @type {s.Schema<InsertOp<any>>} */ (InsertOp.prototype.$type = /** @type {s.Schema<InsertOp<any>>} */ (s.$type('d:insertOp', InsertOp)))
export const $modifyOp = ModifyOp.prototype.$type = s.$type('d:modifyOp', ModifyOp)
export const $textOp = TextOp.prototype.$type = s.$type('d:textOp', TextOp)
export const $deleteOp = /** @type {s.Schema<DeleteOp<any>>} */ (DeleteOp.prototype.$type = s.$type('d:deleteOp', DeleteOp))
export const $retainOp = RetainOp.prototype.$type = s.$type('d:retainOp', RetainOp)
export const $anyOp = s.$union($insertOp, $deleteOp, $textOp, $modifyOp)

export const $setAttrOp = /** @type {s.Schema<SetAttrOp<any>>} */ (SetAttrOp.prototype.$type =/** @type {s.Schema<SetAttrOp<any>>} */ (s.$type('d:setAttrOp', SetAttrOp)))
export const $modifyAttrOp = /** @type {s.Schema<ModifyAttrOp<any>>} */ (ModifyAttrOp.prototype.$type = /** @type {s.Schema<ModifyAttrOp<any>>} */ (s.$type('d:modifyAttrOp', ModifyAttrOp)))
export const $deleteAttrOp = /** @type {s.Schema<DeleteAttrOp<any>>} */ (DeleteAttrOp.prototype.$type = /** @type {s.Schema<DeleteAttrOp<any>>} */ (s.$type('d:deleteAttrOp', DeleteAttrOp)))
export const $anyAttrOp = s.$union($setAttrOp, $deleteAttrOp, $modifyAttrOp)

/**
 * @template {fingerprintTrait.Fingerprintable} Content
 * @param {s.Schema<Content>} $content
 * @return {s.Schema<SetAttrOp<Content>>}
 */
export const $setAttrOpWith = $content => s.$custom(o => $setAttrOp.check(o) && $content.check(o.value))

/**
 * @template {fingerprintTrait.Fingerprintable} Content
 * @param {s.Schema<Content>} $content
 * @return {s.Schema<InsertOp<Content>>}
 */
export const $insertOpWith = $content => s.$custom(o => $insertOp.check(o) && $content.check(o.insert.every(ins => $content.check(ins))))

/**
 * @template {DeltaAny} Modify
 * @param {s.Schema<Modify>} $content
 * @return {s.Schema<ModifyOp<Modify>>}
 */
export const $modifyOpWith = $content => s.$custom(o => $modifyOp.check(o) && $content.check(o.value))

/**
 * @template {DeltaAny} Modify
 * @param {s.Schema<Modify>} $content
 * @return {s.Schema<ModifyAttrOp<Modify>>}
 */
export const $modifyAttrOpWith = $content => s.$custom(o => $modifyAttrOp.check(o) && $content.check(/** @type {ModifyAttrOp<Modify>} */ (o).value))

/**
 * @template {{[Key in string|number]: any}} Attrs
 * @template {string|number} Key
 * @template {any} Val
 * @typedef {{ [K in (Key | keyof Attrs)]: (unknown extends Attrs[K] ? never : Attrs[K]) | (Key extends K ? Val : never) } & {}} AddToAttrs
 */

/**
 * @template {{[Key in string|number|symbol]: any}} Attrs
 * @template {{[Key in string|number|symbol]: any}} NewAttrs
 * @typedef {{ [K in (keyof NewAttrs | keyof Attrs)]: (unknown extends Attrs[K] ? never : Attrs[K]) | (unknown extends NewAttrs[K] ? never : NewAttrs[K]) }} MergeAttrs
 */

/**
 * @typedef {Delta<any>} DeltaAny
 */

/**
 * @typedef {DeltaBuilder<any>} DeltaBuilderAny
 */

/**
 * @typedef {object} DeltaConf
 * @property {string} [DeltaConf.name]
 * @property {fingerprintTrait.Fingerprintable} [DeltaConf.children=never]
 * @property {boolean} [DeltaConf.text=never]
 * @property {{[K:string|number]:fingerprintTrait.Fingerprintable}} [DeltaConf.attrs={}]
 * @property {boolean} [DeltaConf.recursiveChildren=false]
 * @property {boolean} [DeltaConf.recursiveAttrs=false]
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {Conf extends {name:infer Name} ? (unknown extends Name ? any : (Exclude<Name,undefined>)) : any} DeltaConfGetName
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {(Conf extends {children:infer Children} ? (unknown extends Children ? any : Children) : never) | (Conf extends {recursiveChildren:true} ? Delta<Conf> : never)} DeltaConfGetChildren
 */

/**
 * @template {DeltaConf} Conf
 * @template {boolean} FixedConf
 * @typedef {FixedConf extends true ? DeltaConfGetChildren<Conf> : any } DeltaConfGetAllowedChildren
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {0 extends (1 & Conf) ? string : (Conf extends {text:true} ? string : never)} DeltaConfGetText
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {import('../ts.js').TypeIsAny<Conf, {[K:string|number]:any}, (Conf extends {attrs:infer Attrs} ? (Attrs extends undefined ? {} : Attrs) : {})>} DeltaConfGetAttrs
 */

/**
 * @template {DeltaConf} Conf
 * @template {boolean} FixedConf
 * @typedef {FixedConf extends true ? DeltaConfGetAttrs<Conf> : {[K:string|number]:any}} DeltaConfGetAllowedAttrs
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {Conf extends {recursiveChildren:true} ? true : false} DeltaConfGetRecursiveChildren
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {Conf extends {recursiveAttrs:true} ? true : false} DeltaConfigGetRecursiveAttrs
 */

/**
 * Transform Delta(Builder) to a normal delta.
 *
 * @template V
 * @typedef {V extends never ? never : (import('../ts.js').TypeIsAny<V,any,V extends Delta<infer Conf> ? Delta<Conf> : V>)} _SanifyDelta
 */

/**
 * @template {DeltaConf} Conf
 * @typedef {import('../ts.js').Prettify<{[K in keyof Conf]: K extends 'attrs' ? import('../ts.js').Prettify<{ [KA in keyof Conf[K]]: _SanifyDelta<Conf[K][KA]> },1> : (K extends 'children' ? _SanifyDelta<Conf[K]> : Conf[K]) }, 1>} PrettifyDeltaConf
 */

/**
 * @template {DeltaConf} D1
 * @template D2
 * @typedef {(import('../ts.js').TypeIsAny<D1, any, PrettifyDeltaConf<{[K in (keyof D1|keyof D2)]: K extends keyof D2 ? D2[K] : (K extends keyof D1 ? D1[K] : never)}>> & {}) extends infer DC extends DeltaConf ? DC : never} DeltaConfOverwrite
 */

/**
 * @template {string} Name
 * @template {{[K in string|number]:any}} Attrs
 * @template Children
 * @template {boolean} Text
 */
class DeltaData {
  /**
   * @param {string?} name
   * @param {s.Schema<Delta<any>>?} $schema
   */
  constructor (name, $schema) {
    this.name = /** @type {Name} */ (name)
    this.$schema = $schema
    /**
     * @type {{ [K in keyof Attrs]?: K extends string|number ? (SetAttrOp<Attrs[K],K>|DeleteAttrOp<Attrs[K],K>|(Attrs[K] extends never ? never : (Attrs[K] extends Delta ? ModifyAttrOp<Extract<Attrs[K],Delta>,K> : never))) : never }
     *       & { [Symbol.iterator]: () => Iterator<{ [K in keyof Attrs]: K extends string|number ? (SetAttrOp<Attrs[K],K>|DeleteAttrOp<Attrs[K],K>|(Attrs[K] extends never ? never : (Delta extends Attrs[K] ? ModifyAttrOp<Extract<Attrs[K],Delta>,K> : never))) : never }[keyof Attrs]> }
     * }
     */
    this.attrs = /** @type {any} */ ({
      * [Symbol.iterator] () {
        for (const k in this) {
          yield this[k]
        }
      }
    })

    /**
     * @type {list.List<
     *   | (Text extends true ? (RetainOp|TextOp|DeleteOp<any>) : never)
     *   | (RetainOp|InsertOp<Children>|DeleteOp<any>|(Delta extends Children ? ModifyOp<Extract<Children,Delta>> : never))
     * >}
     */
    this.children = /** @type {any} */ (list.create())
    this.childCnt = 0
    /**
     * @type {any}
     */
    this.origin = null
    /**
     * @type {string|null}
     */
    this._fingerprint = null
    this.isDone = false
  }
}

/**
 * @template {DeltaConf} [Conf={}]
 * @extends {DeltaData<
 *   DeltaConfGetName<Conf>,
 *   DeltaConfGetAttrs<Conf>,
 *   DeltaConfGetChildren<Conf>,
 *   Conf extends {text:true} ? true : false
 * >}
 */
export class Delta extends DeltaData {
  /**
   * @type {string}
   */
  get fingerprint () {
    return this._fingerprint || (this._fingerprint = buffer.toBase64(encoding.encode(encoder => {
      encoding.writeUint32(encoder, 0xf2ae5680) // "magic number" that ensures that different types of content don't yield the same fingerprint
      encoding.writeAny(encoder, this.name)
      /**
       * @type {Array<number|string>}
       */
      const keys = []
      for (const attr of this.attrs) {
        keys.push(attr.key)
      }
      keys.sort((a, b) => {
        const aIsString = s.$string.check(a)
        const bIsString = s.$string.check(b)
        // numbers first
        // in ascending order
        return (aIsString && bIsString)
          ? a.localeCompare(b)
          : (aIsString ? 1 : (bIsString ? -1 : (a - b)))
      })
      encoding.writeVarUint(encoder, keys.length)
      for (const key of keys) {
        encoding.writeVarString(encoder, /** @type {any} */ (this.attrs[/** @type {keyof Attrs} */ (key)]).fingerprint)
      }
      encoding.writeVarUint(encoder, this.children.len)
      for (const child of this.children) {
        encoding.writeVarString(encoder, child.fingerprint)
      }
      return buffer.toBase64(rabin.fingerprint(rabin.StandardIrreducible128, encoding.toUint8Array(encoder)))
    })))
  }

  [fingerprintTrait.FingerprintTraitSymbol] () {
    return this.fingerprint
  }

  isEmpty () {
    return object.isEmpty(this.attrs) && list.isEmpty(this.children)
  }

  /**
   * @return {DeltaJSON}
   */
  toJSON () {
    const name = this.name
    /**
     * @type {any}
     */
    const attrs = {}
    /**
     * @type {any}
     */
    const children = []
    for (const attr of this.attrs) {
      attrs[attr.key] = attr.toJSON()
    }
    this.children.forEach(val => {
      children.push(val.toJSON())
    })
    return object.assign(
      { type: /** @type {'delta'} */ ('delta') },
      (name != null ? { name } : {}),
      (object.isEmpty(attrs) ? {} : { attrs }),
      (children.length > 0 ? { children } : {})
    )
  }

  /**
   * @param {Delta<any>} other
   * @return {boolean}
   */
  equals (other) {
    return this[equalityTrait.EqualityTraitSymbol](other)
  }

  /**
   * @param {any} other
   * @return {boolean}
   */
  [equalityTrait.EqualityTraitSymbol] (other) {
    // @todo it is only necessary to compare finrerprints OR do a deep equality check (remove
    // childCnt as well)
    return this.name === other.name && fun.equalityDeep(this.attrs, other.attrs) && fun.equalityDeep(this.children, other.children) && this.childCnt === other.childCnt
  }

  // toString () {
  //   /**
  //    * @type {Array<[string|number,string]>}
  //    */
  //   const attrs = []
  //   for (const attr of this.attrs) {
  //     attrs.push([attr.key, $deleteAttrOp.check(attr) ? 'delete' : attr.type + ' ' + (attr.value?.toString() ?? attr.value)])
  //   }
  //   attrs.sort((a, b) => a[0].toString() < b[0].toString() ? -1 : 1)
  //   const attrsString = attrs.map(attr => `${attr[0]} = ${attr[1]}`).join(', ')
  //   if (this.childCnt === 0) return `<${this.name ?? ''} ${attrsString}/>`
  //   this.children.toArray() drnt
  //   return '<>'
  // }
  //
  /**
   * Mark this delta as done and perform some cleanup (e.g. remove appended retains without
   * formats&attributions). In the future, there might be additional merge operations that can be
   * performed to result in smaller deltas. Set `markAsDone=false` to only perform the cleanup.
   *
   * @return {Delta<Conf>}
   */
  done (markAsDone = true) {
    if (!this.isDone) {
      this.isDone = markAsDone
      const cs = this.children
      for (let end = cs.end; end !== null && $retainOp.check(end) && end.format == null && end.attribution == null; end = cs.end) {
        this.childCnt -= end.length
        list.popEnd(cs)
      }
    }
    return this
  }
}

/**
 * @template {DeltaConf} Conf
 * @param {Delta<Conf>} d
 * @param {number} start
 * @param {number} end
 * @param {ChildrenOpAny?} currNode - start slicing at this node (instead of d.children.start)
 * @return {DeltaBuilder<Conf>}
 */
export const slice = (d, start = 0, end = d.childCnt, currNode = d.children.start) => {
  const cpy = /** @type {DeltaAny} */ (new DeltaBuilder(d.name, d.$schema))
  cpy.origin = d.origin
  // copy attrs
  for (const op of d.attrs) {
    // @ts-ignore
    cpy.attrs[op.key] = /** @type {any} */ (op.clone())
  }
  // copy children
  const slicedLen = end - start
  let remainingLen = slicedLen
  let currNodeOffset = 0
  while (start > 0 && currNode != null) {
    if (currNode.length <= start) {
      start -= currNode.length
      currNode = currNode.next
    } else {
      currNodeOffset = start
      start = 0
    }
  }
  if (currNodeOffset > 0 && currNode) {
    const ncpy = currNode.clone(currNodeOffset, currNodeOffset + math.min(remainingLen, currNode.length - currNodeOffset))
    list.pushEnd(cpy.children, ncpy)
    remainingLen -= ncpy.length
    currNode = currNode.next
  }
  while (currNode != null && currNode.length <= remainingLen) {
    list.pushEnd(cpy.children, currNode.clone())
    remainingLen -= currNode.length
    currNode = currNode.next
  }
  if (currNode != null && remainingLen > 0) {
    list.pushEnd(cpy.children, currNode.clone(0, remainingLen))
    remainingLen -= math.min(currNode.length, remainingLen)
  }
  cpy.childCnt = slicedLen - remainingLen
  // @ts-ignore
  return cpy
}

/**
 * @template {DeltaAny} D
 * @param {D} d
 * @return {D extends Delta<infer Conf> ? DeltaBuilder<Conf> : never}
 */
export const clone = d => /** @type {any} */ (slice(d, 0, d.childCnt))

/**
 * Try merging this op with the previous op
 * @param {list.List<any>} parent
 * @param {InsertOp<any>|RetainOp|DeleteOp<any>|TextOp|ModifyOp<any>} op
 */
const tryMergeWithPrev = (parent, op) => {
  const prevOp = op.prev
  if (
    prevOp?.constructor !== op.constructor ||
    (
      (!$deleteOp.check(op) && !$modifyOp.check(op)) && (!fun.equalityDeep(op.format, /** @type {InsertOp<any>} */ (prevOp).format) || !fun.equalityDeep(op.attribution, /** @type {InsertOp<any>} */ (prevOp).attribution))
    )
  ) {
    // constructor mismatch or format/attribution mismatch
    return
  }
  // can be merged
  if ($insertOp.check(op)) {
    /** @type {InsertOp<any>} */ (prevOp).insert.push(...op.insert)
  } else if ($retainOp.check(op)) {
    // @ts-ignore
    /** @type {RetainOp} */ (prevOp).retain += op.retain
  } else if ($deleteOp.check(op)) {
    /** @type {DeleteOp<any>} */ (prevOp).delete += op.delete
  } else if ($textOp.check(op)) {
    /** @type {TextOp} */ (prevOp)._updateInsert(/** @type {TextOp} */ (prevOp).insert + op.insert)
  } else {
    error.unexpectedCase()
  }
  list.remove(parent, op)
}

/**
 * Ensures that the delta can be edited. clears _fingerprint cache.
 *
 * @param {any} d
 */
const modDeltaCheck = d => {
  if (d.isDone) {
    /**
     * You tried to modify a delta after it has been marked as "done".
     */
    throw error.create("Readonly Delta can't be modified")
  }
  d._fingerprint = null
}

/**
 * @template {DeltaConf} [Conf={}]
 * @template {boolean} [FixedConf=false]
 * @extends {Delta<Conf>}
 */
export class DeltaBuilder extends Delta {
  /**
   * @param {string?} name
   * @param {s.Schema<Delta<Conf>>?} $schema
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
    modDeltaCheck(this)
    this.usedAttribution = attribution
    return this
  }

  /**
   * @param {FormattingAttributes?} attributes
   * @return {this}
   */
  useAttributes (attributes) {
    modDeltaCheck(this)
    this.usedAttributes = attributes
    return this
  }

  /**
   * @param {string} name
   * @param {any} value
   */
  updateUsedAttributes (name, value) {
    modDeltaCheck(this)
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
    modDeltaCheck(this)
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
   * @template {(FixedConf extends true ? never : (Array<any>|string)) | (DeltaConfGetChildren<Conf> extends infer Children ? (Children extends never ? never : Array<Children>) : never) | DeltaConfGetText<Conf>} NewContent
   * @param {NewContent} insert
   * @param {FormattingAttributes?} [formatting]
   * @param {Attribution?} [attribution]
   * @return {DeltaBuilder<FixedConf extends true ? Conf : DeltaConfOverwrite<Conf,
   * (Exclude<NewContent,string> extends never ? {} : {
   *   children: Exclude<NewContent,string>[number]|DeltaConfGetChildren<Conf>
   * }) & (Extract<NewContent,string> extends never ? {} : { text: true })>, FixedConf>}
   */
  insert (insert, formatting = null, attribution = null) {
    modDeltaCheck(this)
    const mergedAttributes = mergeAttrs(this.usedAttributes, formatting)
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    /**
     * @param {TextOp | InsertOp<any>} lastOp
     */
    const checkMergedEquals = lastOp => (mergedAttributes === lastOp.format || fun.equalityDeep(mergedAttributes, lastOp.format)) && (mergedAttribution === lastOp.attribution || fun.equalityDeep(mergedAttribution, lastOp.attribution))
    const end = this.children.end
    if (s.$string.check(insert)) {
      if ($textOp.check(end) && checkMergedEquals(end)) {
        end._updateInsert(end.insert + insert)
      } else if (insert.length > 0) {
        list.pushEnd(this.children, new TextOp(insert, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution))
      }
      this.childCnt += insert.length
    } else if (arr.isArray(insert)) {
      if ($insertOp.check(end) && checkMergedEquals(end)) {
        // @ts-ignore
        end.insert.push(...insert)
        end._fingerprint = null
      } else if (insert.length > 0) {
        list.pushEnd(this.children, new InsertOp(insert.slice() /* ensures that we don't reuse an existing array */, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution))
      }
      this.childCnt += insert.length
    }
    return /** @type {any} */ (this)
  }

  /**
   * @template {Extract<DeltaConfGetAllowedChildren<Conf, FixedConf>,Delta|DeltaData<any,any,any,any>|DeltaBuilder>} NewContent
   * @param {NewContent} modify
   * @param {FormattingAttributes?} formatting
   * @param {Attribution?} attribution
   * @return {DeltaBuilder<DeltaConfOverwrite<Conf, {children: DeltaConfGetChildren<Conf>|NewContent}>, FixedConf>}
   */
  modify (modify, formatting = null, attribution = null) {
    modDeltaCheck(this)
    const mergedAttributes = mergeAttrs(this.usedAttributes, formatting)
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    list.pushEnd(this.children, new ModifyOp(modify, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution))
    this.childCnt += 1
    return /** @type {any} */ (this)
  }

  /**
   * @param {number} len
   * @param {FormattingAttributes?} [format]
   * @param {Attribution?} [attribution]
   */
  retain (len, format = null, attribution = null) {
    modDeltaCheck(this)
    const mergedFormats = mergeAttrs(this.usedAttributes, format)
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    const lastOp = /** @type {RetainOp|InsertOp<any>} */ (this.children.end)
    if ($retainOp.check(lastOp) && fun.equalityDeep(mergedFormats, lastOp.format) && fun.equalityDeep(mergedAttribution, lastOp.attribution)) {
      // @ts-ignore
      lastOp.retain += len
    } else if (len > 0) {
      list.pushEnd(this.children, new RetainOp(len, mergedFormats, mergedAttribution))
    }
    this.childCnt += len
    return this
  }

  /**
   * @param {number} len
   * @param {DeltaBuilder<any>|null} prevValue
   */
  delete (len, prevValue = null) {
    modDeltaCheck(this)
    const lastOp = /** @type {DeleteOp<any>|InsertOp<any>} */ (this.children.end)
    if ($deleteOp.check(lastOp) && typeof lastOp.prevValue === typeof prevValue) {
      lastOp.delete += len
      if (prevValue != null) {
        /** @type {DeltaBuilder<any>} */ (lastOp.prevValue).append(prevValue)
      }
    } else if (len > 0) {
      list.pushEnd(this.children, new DeleteOp(len, prevValue))
    }
    this.childCnt += len
    return this
  }

  /**
   * @template {Extract<keyof DeltaConfGetAllowedAttrs<Conf, FixedConf>,string|number>} Key
   * @template {DeltaConfGetAllowedAttrs<Conf, FixedConf>[Key]} Val
   * @param {Key} key
   * @param {Val} val
   * @param {Attribution?} attribution
   * @param {Val|undefined} [prevValue]
   * @return {DeltaBuilder<DeltaConfOverwrite<Conf,{attrs:AddToAttrs<DeltaConfGetAttrs<Conf>,Key,Val>}>, FixedConf>}
   */
  setAttr (key, val, attribution = null, prevValue) {
    modDeltaCheck(this)
    // @ts-ignore
    this.attrs[key] /** @type {any} */ =
      (new SetAttrOp(/** @type {any} */ (key), val, prevValue, mergeAttrs(this.usedAttribution, attribution)))
    return /** @type {any} */ (this)
  }

  /**
   * @template {DeltaConfGetAllowedAttrs<Conf, FixedConf>} NewAttrs
   * @param {NewAttrs} attrs
   * @param {Attribution?} attribution
   * @return {DeltaBuilder<DeltaConfOverwrite<
   *   Conf,
   *   { attrs: MergeAttrs<DeltaConfGetAttrs<Conf>,NewAttrs> }
   *   >, FixedConf>
   * }
   */
  setAttrs (attrs, attribution = null) {
    modDeltaCheck(this)
    for (const k in attrs) {
      this.setAttr(/** @type {any} */ (k), /** @type {any} */ (attrs)[/** @type {any} */ (k)], attribution)
    }
    return /** @type {any} */ (this)
  }

  /**
   * @template {Extract<keyof DeltaConfGetAllowedAttrs<Conf, FixedConf>,string|number>} Key
   * @param {Key} key
   * @param {Attribution?} attribution
   * @param {any} [prevValue]
   * @return {DeltaBuilder<DeltaConfOverwrite<Conf, {
   *   attrs: AddToAttrs<DeltaConfGetAttrs<Conf>,Key,never>
   * }>, FixedConf>}
   */
  deleteAttr (key, attribution = null, prevValue) {
    modDeltaCheck(this)
    // @ts-ignore
    this.attrs[key] /** @type {any} */ =
      (new DeleteAttrOp(/** @type {any} */ (key), prevValue, mergeAttrs(this.usedAttribution, attribution)))
    return /** @type {any} */ (this)
  }

  /**
   * @template {DeltaConfGetAllowedAttrs<Conf, FixedConf> extends infer As ? { [K in keyof As]: Extract<As[K],DeltaAny> extends never ? never : K }[keyof As] : never} Key
   * @template {Extract<DeltaConfGetAllowedAttrs<Conf, FixedConf>[Key],DeltaAny>} D
   * @param {Key} key
   * @param {D} modify
   * @return {DeltaBuilder<DeltaConfOverwrite<Conf,{attrs:AddToAttrs<DeltaConfGetAttrs<Conf>,Key,D>}>, FixedConf>}
   */
  modifyAttr (key, modify) {
    modDeltaCheck(this)
    this.attrs[key] = /** @type {any} */ (new ModifyAttrOp(key, modify))
    return /** @type {any} */ (this)
  }

  /**
   * @param {Delta<Conf>?} other
   */
  apply (other) {
    if (other == null) return this
    modDeltaCheck(this)
    this.$schema?.expect(other)
    // apply attrs
    for (const op of other.attrs) {
      // @ts-ignore
      const c = /** @type {SetAttrOp<any,any>|DeleteAttrOp<any>|ModifyAttrOp<any,any>} */ (this.attrs[op.key])
      if ($modifyAttrOp.check(op)) {
        if ($deltaAny.check(c?.value)) {
          c._modValue.apply(op.value)
        } else {
          // then this is a simple modify
          // @ts-ignore
          this.attrs[op.key] = op.clone()
        }
      } else if ($setAttrOp.check(op)) {
        // @ts-ignore
        op.prevValue = c?.value
        // @ts-ignore
        this.attrs[op.key] = op.clone()
      } else if ($deleteAttrOp.check(op)) {
        op.prevValue = c?.value
        // @ts-ignore
        delete this.attrs[op.key]
      }
    }
    // apply children
    /**
     * @type {ChildrenOpAny?}
     */
    let opsI = this.children.start
    let offset = 0
    /**
     * At the end, we will try to merge this op, and op.next op with their respective previous op.
     *
     * Hence, anytime an op is cloned, deleted, or inserted (anytime list.* api is used) we must add
     * an op to maybeMergeable.
     *
     * @type {Array<InsertOp<any>|RetainOp|DeleteOp<any>|TextOp|ModifyOp<any>>}
     */
    const maybeMergeable = []
    /**
     * @template {InsertOp<any>|RetainOp|DeleteOp|TextOp|ModifyOp<any>|null} OP
     * @param {OP} op
     * @return {OP}
     */
    const scheduleForMerge = op => {
      op && maybeMergeable.push(op)
      return op
    }
    other.children.forEach(op => {
      if ($textOp.check(op) || $insertOp.check(op)) {
        if (offset === 0) {
          list.insertBetween(this.children, opsI == null ? this.children.end : opsI.prev, opsI, scheduleForMerge(op.clone()))
        } else {
          // @todo inmplement "splitHelper" and "insertHelper" - I'm splitting all the time and
          // forget to update opsI
          if (opsI == null) error.unexpectedCase()
          const cpy = scheduleForMerge(opsI.clone(offset))
          opsI._splice(offset, opsI.length - offset)
          list.insertBetween(this.children, opsI, opsI.next || null, cpy)
          list.insertBetween(this.children, opsI, cpy || null, scheduleForMerge(op.clone()))
          opsI = cpy
          offset = 0
        }
        this.childCnt += op.insert.length
      } else if ($retainOp.check(op)) {
        let retainLen = op.length

        if (offset > 0 && opsI != null && op.format != null && !$deleteOp.check(opsI) && !object.every(op.format, (v, k) => fun.equalityDeep(v, /** @type {InsertOp<any>|RetainOp|ModifyOp} */ (opsI).format?.[k] || null))) {
          // need to split current op
          const cpy = scheduleForMerge(opsI.clone(offset))
          opsI._splice(offset, opsI.length - offset)
          list.insertBetween(this.children, opsI, opsI.next || null, cpy)
          opsI = cpy
          offset = 0
        }

        while (opsI != null && opsI.length - offset <= retainLen) {
          op.format != null && updateOpFormat(opsI, op.format)
          retainLen -= opsI.length - offset
          opsI = opsI?.next || null
          offset = 0
        }

        if (opsI != null) {
          if (op.format != null && retainLen > 0) {
            // split current op and apply format
            const cpy = scheduleForMerge(opsI.clone(retainLen))
            opsI._splice(retainLen, opsI.length - retainLen)
            list.insertBetween(this.children, opsI, opsI.next || null, cpy)
            updateOpFormat(opsI, op.format)
            opsI = cpy
          } else {
            offset += retainLen
          }
        } else if (retainLen > 0) {
          list.pushEnd(this.children, scheduleForMerge(new RetainOp(retainLen, op.format, op.attribution)))
          this.childCnt += retainLen
        }
      } else if ($deleteOp.check(op)) {
        let remainingLen = op.delete
        while (remainingLen > 0) {
          if (opsI == null) {
            list.pushEnd(this.children, scheduleForMerge(new DeleteOp(remainingLen, null)))
            this.childCnt += remainingLen
            break
          } else if ($deleteOp.check(opsI)) {
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
            this.childCnt -= delLen
            if (opsI.length === delLen) {
              // case 1
              offset = 0
              list.remove(this.children, opsI)
              scheduleForMerge(opsI = opsI.next)
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
          this.childCnt += 1
          return
        }
        if ($modifyAttrOp.check(opsI)) {
          opsI._modValue.apply(/** @type {any} */ (op.value))
          opsI = opsI.next
        } else if ($insertOp.check(opsI)) {
          opsI._modValue(offset).apply(op.value)
          if (opsI.length === ++offset) {
            opsI = opsI.next
            offset = 0
          }
        } else if ($retainOp.check(opsI)) {
          if (offset > 0) {
            const cpy = scheduleForMerge(opsI.clone(0, offset)) // skipped len
            opsI._splice(0, offset) // new remainder
            list.insertBetween(this.children, opsI.prev, opsI, cpy) // insert skipped len
            offset = 0
          }
          list.insertBetween(this.children, opsI.prev, opsI, scheduleForMerge(op.clone())) // insert skipped len
          if (opsI.length === 1) {
            list.remove(this.children, opsI)
          } else {
            opsI._splice(0, 1)
            scheduleForMerge(opsI)
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
    // iterate backwards, to ensure that we merge all content
    for (let i = maybeMergeable.length - 1; i >= 0; i--) {
      const op = maybeMergeable[i]
      // check if this is still integrated
      if (op.prev != null ? op.prev.next === op : this.children.start === op) {
        op.prev && tryMergeWithPrev(this.children, op)
        op.next && tryMergeWithPrev(this.children, op.next)
      }
    }
    return this
  }

  /**
   * @param {DeltaAny} other
   * @param {boolean} priority
   */
  rebase (other, priority) {
    modDeltaCheck(this)
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
    for (const op of this.attrs) {
      if ($setAttrOp.check(op)) {
        if ($setAttrOp.check(other.attrs[op.key]) && !priority) {
          // @ts-ignore
          delete this.attrs[op.key]
        }
      } else if ($deleteAttrOp.check(op)) {
        // @ts-ignore
        const otherOp = other.attrs[/** @type {any} */ (op.key)]
        if ($setAttrOp.check(otherOp)) {
          // @ts-ignore
          delete this.attrs[otherOp.key]
        }
      } else if ($modifyAttrOp.check(op)) {
        const otherOp = other.attrs[/** @type {any} */ (op.key)]
        if (otherOp == null) {
          // nop
        } else if ($modifyAttrOp.check(otherOp)) {
          op._modValue.rebase(otherOp.value, priority)
        } else {
          // @ts-ignore
          delete this.attrs[otherOp.key]
        }
      } else {
        error.unexpectedCase()
      }
    }
    /**
     * Rebase children.
     *
     * Precedence: insert with higher priority comes first. Op with less priority is transformed to
     * be inserted later.
     *
     * @todo always check if inser OR text
     */
    /**
     * @type {ChildrenOpAny?}
     */
    let currChild = this.children.start
    let currOffset = 0
    /**
     * @type {ChildrenOpAny?}
     */
    let otherChild = other.children.start
    let otherOffset = 0
    while (currChild != null && otherChild != null) {
      if ($insertOp.check(currChild) || $textOp.check(currChild)) {
        /**
         * Transforming *insert*. If other is..
         * - insert: transform based on priority
         * - retain/delete/modify: transform next op against other
         */
        if ($insertOp.check(otherChild) || $modifyOp.check(otherChild) || $textOp.check(otherChild)) {
          if (!priority) {
            list.insertBetween(this.children, currChild.prev, currChild, new RetainOp(otherChild.length, null, null))
            this.childCnt += otherChild.length
            // curr is transformed against other, transform curr against next
            otherOffset = otherChild.length
          } else {
            // curr stays as is, transform next op
            currOffset = currChild.length
          }
        } else { // otherChild = delete | retain | modify - curr stays as is, transform next op
          currOffset = currChild.length
        }
      } else if ($modifyOp.check(currChild)) {
        /**
         * Transforming *modify*. If other is..
         * - insert: adjust position
         * - modify: rebase curr modify on other modify
         * - delete: remove modify
         * - retain: adjust offset
         */
        if ($insertOp.check(otherChild) || $textOp.check(otherChild)) {
          // @todo: with all list changes (retain insertions, removal), try to merge the surrounding
          // ops later
          list.insertBetween(this.children, currChild.prev, currChild, new RetainOp(otherChild.length, null, null))
          this.childCnt += otherChild.length
          // curr is transformed against other, transform curr against next
          otherOffset = otherChild.length
        } else {
          if ($modifyOp.check(otherChild)) {
            /** @type {any} */ (currChild.value).rebase(otherChild, priority)
          } else if ($deleteOp.check(otherChild)) {
            list.remove(this.children, currChild)
            this.childCnt -= 1
          }
          currOffset += 1
          otherOffset += 1
        }
      } else { // DeleteOp | RetainOp
        const maxCommonLen = math.min(currChild.length - currOffset, otherChild.length - otherOffset)
        /**
         * Transforming *retain* OR *delete*. If other is..
         * - retain / modify: adjust offsets
         * - delete: shorten curr op
         * - insert: split curr op and insert retain
         */
        if ($retainOp.check(otherChild) || $modifyOp.check(otherChild)) {
          currOffset += maxCommonLen
          otherOffset += maxCommonLen
        } else if ($deleteOp.check(otherChild)) {
          if ($retainOp.check(currChild)) {
            // @ts-ignore
            currChild.retain -= maxCommonLen
          } else if ($deleteOp.check(currChild)) {
            currChild.delete -= maxCommonLen
          }
          this.childCnt -= maxCommonLen
        } else { // insert/text.check(currOp)
          if (currOffset > 0) {
            const leftPart = currChild.clone(currOffset)
            list.insertBetween(this.children, currChild.prev, currChild, leftPart)
            currChild._splice(currOffset, currChild.length - currOffset)
            currOffset = 0
          }
          list.insertBetween(this.children, currChild.prev, currChild, new RetainOp(otherChild.length, null, null))
          this.childCnt += otherChild.length
          otherOffset = otherChild.length
        }
      }
      if (currOffset >= currChild.length) {
        currChild = currChild.next
        currOffset = 0
      }
      if (otherOffset >= otherChild.length) {
        otherChild = otherChild.next
        otherOffset = 0
      }
    }
    return this
  }

  /**
   * Same as doing `delta.rebase(other.inverse())`, without creating a temporary delta.
   *
   * @param {DeltaAny} other
   * @param {boolean} priority
   */
  rebaseOnInverse (other, priority) {
    modDeltaCheck(this)
    // @todo
    console.info('method rebaseOnInverse unimplemented')
    return this
  }

  /**
   * Append child ops from one op to the other.
   *
   *     delta.create().insert('a').append(delta.create().insert('b')) // => insert "ab"
   *
   * @template {DeltaConf} OtherDeltaConf
   * @param {Delta<OtherDeltaConf>} other
   * @return {DeltaBuilder<FixedConf extends true ? Conf : DeltaConfOverwrite<
   *   Conf,
   *   (DeltaConfGetChildren<OtherDeltaConf> extends never ? {} : { children: DeltaConfGetChildren<Conf> | DeltaConfGetChildren<OtherDeltaConf> })
   *   & (DeltaConfGetText<OtherDeltaConf> extends string ? { text: true } : never)
   * >, FixedConf>}
   */
  append (other) {
    const children = this.children
    const prevLast = children.end
    // @todo Investigate. Above is a typescript issue. It is necessary to cast OtherDelta to a Delta first before
    // inferring type, otherwise Children will contain Text.
    for (const child of other.children) {
      list.pushEnd(children, child.clone())
    }
    this.childCnt += other.childCnt
    prevLast?.next && tryMergeWithPrev(children, prevLast.next)
    // @ts-ignore
    return this
  }
}

/**
 * @param {ChildrenOpAny} op
 * @param {{[k:string]:any}} formatUpdate
 */
const updateOpFormat = (op, formatUpdate) => {
  if (!$deleteOp.check(op)) {
    // apply formatting attributes
    for (const k in formatUpdate) {
      const v = formatUpdate[k]
      if (v != null || $retainOp.check(op)) {
        // never modify formats
        /** @type {any} */ (op).format = object.assign({}, op.format, { [k]: v })
      } else if (op.format != null) {
        const { [k]: _, ...rest } = op.format
        ;/** @type {any} */ (op).format = rest
      }
    }
  }
}

/**
 * @template {DeltaConf} Conf
 * @extends {s.Schema<Delta<Conf>>}
 */
export class $Delta extends s.Schema {
  /**
   * @param {s.Schema<any>} $name
   * @param {s.Schema<any>} $attrs
   * @param {s.Schema<any>} $children
   * @param {any} hasText
   * @param {any} recursiveChildren
   * @param {s.Schema<{[K:string]:any}>} $formats
   */
  constructor ($name, $attrs, $children, hasText, recursiveChildren, $formats) {
    super()
    const $attrsPartial = s.$$object.check($attrs) ? $attrs.partial : $attrs
    if (recursiveChildren) {
      // @ts-ignore
      $children = s.$union($children, this)
    }
    /**
     * @type {{
     *   $name: s.Schema<DeltaConfGetName<Conf>>,
     *   $attrs: s.Schema<DeltaConfGetAttrs<Conf>>,
     *   $children: s.Schema<DeltaConfGetChildren<Conf>>,
     *   hasText: DeltaConfGetText<Conf>
     *   recursiveChildren: DeltaConfGetRecursiveChildren<Conf>,
     *   $formats: s.Schema<{[K:string]:any}>
     * }}
     */
    this.shape = { $name, $attrs: $attrsPartial, $children, hasText, $formats, recursiveChildren }
  }

  /**
   * @param {any} o
   * @param {s.ValidationError} [err]
   * @return {o is Delta<Conf>}
   */
  check (o, err = undefined) {
    const { $name, $attrs, $children, hasText, $formats } = this.shape
    if (!$deltaAny.check(o, err)) {
      err?.extend(null, 'Delta', o?.constructor.name, 'Constructor match failed')
    } else if (o.name != null && !$name.check(o.name, err)) {
      err?.extend('Delta.name', $name.toString(), o.name, 'Unexpected node name')
    } else if (list.toArray(o.children).some(c => (!hasText && $textOp.check(c)) || (hasText && $textOp.check(c) && c.format != null && !$formats.check(c.format)) || ($insertOp.check(c) && !c.insert.every(ins => $children.check(ins))))) {
      err?.extend('Delta.children', '', '', 'Children don\'t match the schema')
    } else if (object.some(o.attrs, (op, k) => $setAttrOp.check(op) && !$attrs.check({ [k]: op.value }, err))) {
      err?.extend('Delta.attrs', '', '', 'Attrs don\'t match the schema')
    } else {
      return true
    }
    return false
  }
}

/**
 * @typedef {{
 *   name?: s.Schema<string>|string|Array<string>,
 *   attrs?: s.Schema<{ [key: string|number]: any }>|{ [key:string|number]:any },
 *   children?: any,
 *   text?: boolean,
 *   recursiveChildren?: boolean,
 *   formats?: { [k:string]: any }
 * }} ReadableDeltaConf
 */

/**
 * Transforms a ReadableDeltaConf (the input shape of `$delta(spec)`) to a DeltaConf.
 * @template {ReadableDeltaConf} DConfSpec
 * @typedef {[
 *   DConfSpec extends {name: infer N} ? s.ReadSchemaUnwrapped<N> : any,
 *   DConfSpec extends {attrs: infer A} ? s.ReadSchemaUnwrapped<A> : {},
 *   DConfSpec extends {children: infer C} ? s.ReadSchemaUnwrapped<C> : never
 * ] extends [infer NodeName, infer Attrs, infer Children]
 *   ? PrettifyDeltaConf<(
 *       import('../ts.js').TypeIsAny<NodeName, {}, { name: NodeName }> &
 *       ([keyof Attrs] extends [never] ? {} : { attrs: Attrs }) &
 *       ([Children] extends [never] ? {} : { children: Children }) &
 *       (DConfSpec extends {text: true} ? { text: true } : {}) &
 *       (DConfSpec extends {recursiveChildren: true} ? { recursiveChildren: true } : {})
 *     ) extends infer DC extends DeltaConf ? DC : never>
 *   : never
 * } ReadDeltaConf
 */

/**
 * @template {ReadableDeltaConf} [DeltaConf={}]
 * @param {DeltaConf} opts
 * @return {s.Schema<Delta<ReadDeltaConf<DeltaConf>>>}
 */
export const $delta = ({ name, attrs, children, text, formats, recursiveChildren: recursive }) => /** @type {any} */ (new $Delta(
  /** @type {any} */ (name == null ? s.$any : s.$(name)),
  /** @type {any} */ (attrs == null ? s.$object({}) : s.$(attrs)),
  /** @type {any} */ (children == null ? s.$never : s.$(children)),
  text ?? false,
  recursive ?? false,
  formats == null ? s.$any : s.$(formats)
))

export const $$delta = /* @__PURE__ */s.$constructedBy($Delta)

export const $deltaAny = /* @__PURE__ *//** @type {s.Schema<Delta<any>>} */ (Delta.prototype.$type = s.$type('d:delta', Delta))
export const $deltaBuilderAny = /** @type {s.Schema<DeltaBuilderAny>} */ (/* @__PURE__ */s.$custom(o => $deltaAny.check(o) && !o.isDone))

/**
 * Helper function to merge attribution and attributes. The latter input "wins".
 *
 * @template {{ [key: string]: any }} T
 * @param {T | null} a
 * @param {T | null} b
 */
export const mergeAttrs = (a, b) => object.isEmpty(a)
  ? (object.isEmpty(b) ? null : b)
  : (object.isEmpty(b) ? a : object.assign({}, a, b))

/**
 * @template {DeltaAny|null} D
 * @param {D} a
 * @param {D} b
 * @return {D}
 */
export const mergeDeltas = (a, b) => {
  if (a != null && b != null) {
    const c = clone(a)
    c.apply(b)
    return /** @type {any} */ (c)
  }
  return a == null ? b : (a || null)
}

/**
 * @template {DeltaConf} Conf
 * @param {prng.PRNG} gen
 * @param {s.Schema<Delta<Conf>>} $d
 * @param {object} conf
 * @param {DeltaAny?} [conf.source]
 * @param {number} [conf.minChildOps]
 * @param {number} [conf.maxChildOps]
 * @return {DeltaBuilder<Conf>}
 */
export const random = (gen, $d, conf = {}) => {
  const { source = null, minChildOps = 1, maxChildOps = 9 } = conf
  let sourceLen = source == null ? 0 : source.childCnt
  const { $name, $attrs, $children, hasText, $formats: $formats_ } = /** @type {$Delta<any>} */ (/** @type {any} */ ($d)).shape
  const d = s.$$any.check($name) ? create($deltaAny) : create(s.random(gen, $name), $deltaAny)
  const $formats = s.$$any.check($formats_) ? s.$null : $formats_
  // set random attrs
  prng.bool(gen) && d.setAttrs(s.random(gen, $attrs, random))
  // delete a single attr
  if (source && !object.isEmpty(source.attrs) && prng.bool(gen)) {
    d.deleteAttr(prng.oneOf(gen, object.keys(source.attrs)))
  }
  for (let i = prng.uint32(gen, minChildOps, maxChildOps); i > 0; i--) {
    /**
     * @type {Array<function():void>}
     */
    const possibleOps = []
    if (hasText) {
      possibleOps.push(() => {
        d.insert(prng.oneOf(gen, ['a', 'b', ' ', '\n', '.']), s.random(gen, $formats))
      })
    }
    if (!s.$$never.check($children)) {
      possibleOps.push(() => {
        /**
         * @type {Array<any>}
         */
        const ins = []
        let insN = prng.int32(gen, 0, 5)
        while (insN--) {
          ins.push(s.random(gen, $children, random))
        }
        d.insert(ins, s.random(gen, $formats))
      })
    }
    if (sourceLen > 0) {
      possibleOps.push(() => {
        const len = prng.uint32(gen, 1, sourceLen)
        sourceLen -= len
        d.delete(len)
      })
      possibleOps.push(() => {
        const len = prng.uint32(gen, 1, sourceLen)
        sourceLen -= len
        if (prng.bool(gen)) {
          d.retain(len)
        } else {
          d.retain(len, s.random(gen, $formats))
        }
      })
    }
    if (possibleOps.length > 0) {
      prng.oneOf(gen, possibleOps)()
    } else {
      break
    }
  }
  return /** @type {any} */ (d)
}

/**
 * @overload
 * @return {DeltaBuilder<{}>}
 */
/**
 * @template {string|null} NodeName
 * @overload
 * @param {NodeName} nodeName
 * @return {DeltaBuilder<NodeName extends string ? { name: NodeName } : {}>}
 */
/**
 * @template {string} NodeName
 * @template {DeltaConf} Conf
 * @overload
 * @param {NodeName} nodeName
 * @param {s.Schema<Delta<Conf>>} schema
 * @return {DeltaBuilder<Conf, true>}
 */
/**
 * @template {s.Schema<DeltaAny>} Schema
 * @overload
 * @param {Schema} schema
 * @return {Schema extends s.Schema<Delta<infer Conf>> ? DeltaBuilder<Conf, true> : never}
 */
/**
 * @template {string|null} NodeName
 * @template {{[k:string|number]:any}|null} Attrs
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {NodeName} nodeName
 * @param {Attrs} attrs
 * @param {Children} [children]
 * @return {DeltaBuilder<{
 *   name: NodeName,
 *   attrs: Attrs extends null ? {} : Attrs,
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @param {string|s.Schema<DeltaAny>|null} [nodeNameOrSchema]
 * @param {{[K:string|number]:any}|s.Schema<DeltaAny>} [attrsOrSchema]
 * @param {(Array<any>|string)} [children]
 * @return {DeltaBuilder<{}>}
 */
export const create = (nodeNameOrSchema, attrsOrSchema, children) => {
  const nodeName = /** @type {any} */ (s.$string.check(nodeNameOrSchema) ? nodeNameOrSchema : null)
  const schema = /** @type {any} */ (s.$$schema.check(nodeNameOrSchema) ? nodeNameOrSchema : (s.$$schema.check(attrsOrSchema) ? attrsOrSchema : null))
  const d = /** @type {DeltaBuilder<any>} */ (new DeltaBuilder(nodeName, schema))
  if (s.$objectAny.check(attrsOrSchema)) {
    d.setAttrs(attrsOrSchema)
  }
  children && d.insert(children)
  return d
}

/**
 * @template {string|null} NodeName
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {NodeName} nodeName
 * @param {...Array<Children>} children
 * @return {DeltaBuilder<{
 *   name: NodeName,
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {...Array<Children>} children
 * @return {DeltaBuilder<{
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @template {{[k:string|number]:any}|null} Attrs
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {Attrs} attrs
 * @param {...Array<Children>} children
 * @return {DeltaBuilder<{
 *   attrs: Attrs extends null ? {} : Attrs,
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @template {string|null} NodeName
 * @template {{[k:string|number]:any}|null} Attrs
 * @template {Array<any>|string} [Children=never]
 * @overload
 * @param {NodeName} nodeName
 * @param {Attrs} attrs
 * @param {...Array<Children>} children
 * @return {DeltaBuilder<{
 *   name: NodeName,
 *   attrs: Attrs extends null ? {} : Attrs,
 *   children: Extract<Children,Array<any>> extends Array<infer Ac> ? (unknown extends Ac ? never : Ac) : never,
 *   text: Extract<Children,string> extends never ? false : true
 * }>}
 */
/**
 * @param {Array<string|null|{[K:string|number]:any}|Array<any>>} args
 * @return {DeltaBuilder<{}>}
 */
export const from = (...args) => {
  const hasName = s.$string.check(args[0])
  let i = hasName ? 1 : 0
  const d = create(hasName ? /** @type {string} */ (args[0]) : null)
  if (s.$objectAny.check(args[i])) {
    d.setAttrs(/** @type {any} */ (args[i++]))
  }
  for (; i < args.length; i++) {
    d.insert(/** @type {any} */ (args[i]))
  }
  return d
}

class _DiffStringWrapper {
  /**
   * @param {string} str
   */
  constructor (str) {
    this.str = str
    /**
     * @type {string?}
     */
    this._fingerprint = null
  }

  [fingerprintTrait.FingerprintTraitSymbol] () {
    return this._fingerprint || (this._fingerprint = fingerprintTrait.fingerprint(this.str))
  }
}

/*
 * Delta Diffing approach - optimized for performance and creating readable deltas
 *
 * # Children
 * Diff content first and then figure out the necessary formatting updates
 * 1. find common prefix & suffix
 * 2. slice center to fresh delta. split content by coarse regex ($insert ops are split into
 * individual items)
 * 3. patience diff on split content and receive set of splice ops
 * 4. on each splice op: perform another patience diff with a granular regex on strings
 * 5. reassemble deltas recursively
 * 6. apply content diff on original delta and find necessary formatting updates
 * 7. merge content diff and formatting updates
 */

/**
 * @template {DeltaConf} Conf
 * @param {Delta<Conf>} d1
 * @param {NoInfer<Delta<Conf>>} d2
 * @return {Delta<Conf>}
 */
export const diff = (d1, d2) => {
  const d = create(d1.name === d2.name ? d1.name : null, $deltaAny)
  if (d1.fingerprint !== d2.fingerprint) {
    /**
     * @type {ChildrenOpAny?}
     */
    let left1 = d1.children.start
    /**
     * @type {ChildrenOpAny?}
     */
    let left2 = d2.children.start
    /**
     * @type {ChildrenOpAny?}
     */
    let right1 = d1.children.end
    /**
     * @type {ChildrenOpAny?}
     */
    let right2 = d2.children.end
    // whether we need to diff formatting
    let formattingNeedsDiff = false
    let commonPrefixOffset = 0
    // perform a patience sort
    // 1) remove common prefix and suffix
    while (left1 != null && left1.fingerprint === left2?.fingerprint) {
      if (!$deleteOp.check(left1)) {
        commonPrefixOffset += left1.length
      }
      left1 = left1.next
      left2 = left2.next
    }
    if (left1 !== null && left2 !== null) {
      while (right1 !== null && right2 !== null && right1 !== left1 && right2 !== left2 && right1.fingerprint === right2.fingerprint) {
        right1 = right1.prev
        right2 = right2.prev
      }
    }
    /**
     * @type {Array<fingerprintTrait.Fingerprintable>}
     */
    const cs1 = []
    /**
     * @type {Array<fingerprintTrait.Fingerprintable>}
     */
    const cs2 = []
    // if right is null, then we already matched everything
    if (right1 != null) {
      while (left1 !== null && left1 !== right1.next) {
        if ($textOp.check(left1)) {
          cs1.push(left1.insert)
        } else if ($insertOp.check(left1)) {
          cs1.push(...left1.insert.map(ins => typeof ins === 'string' ? new _DiffStringWrapper(ins) : ins))
        } else {
          error.unexpectedCase()
        }
        formattingNeedsDiff ||= left1.format != null
        left1 = left1.next
      }
    }
    if (right2 != null) {
      while (left2 !== null && left2 !== right2.next) {
        if ($textOp.check(left2)) {
          cs2.push(left2.insert)
        } else if ($insertOp.check(left2)) {
          cs2.push(...left2.insert.map(ins => typeof ins === 'string' ? new _DiffStringWrapper(ins) : ins))
        } else {
          error.unexpectedCase()
        }
        formattingNeedsDiff ||= left2.format != null
        left2 = left2.next
      }
    }
    const changeset1 = [{
      index: commonPrefixOffset,
      insert: cs2,
      remove: cs1
    }]
    // split by line
    const changeset2 = diffChangesetWithSeparator(changeset1, /[\n]+/g)
    // split by alphanumerics and others
    const changeset3 = diffChangesetWithSeparator(changeset2, patience.smartSplitRegex)
    // split all
    const changeset4 = diffChangesetWithSeparator(changeset3, /./g)
    applyChangesetToDelta(d, changeset4)
    if (formattingNeedsDiff) {
      const formattingDiff = create()
      // update opsIs with content diff. then we can figure out the formatting diff.
      const originalUpdated = clone(d1)
      originalUpdated.apply(/** @type {DeltaAny} */ (d))
      let bOffset = 0
      // update a to match b
      let a = /** @type {InsertOp<any>|TextOp|null} */ (originalUpdated.children.start)
      let b = /** @type {InsertOp<any>|TextOp|null} */ (d2.children.start)
      let aOffset = 0
      while (a != null && b != null) {
        if (!$deleteOp.check(b) && !$deleteOp.check(a)) {
          const aFormat = a.format
          const bFormat = b.format
          const minForward = math.min(b.length - bOffset, a.length - aOffset)
          aOffset += minForward
          bOffset += minForward
          if (fun.equalityDeep(bFormat, aFormat)) {
            formattingDiff.retain(minForward)
          } else {
            /**
             * @type {FormattingAttributes}
             */
            const fupdate = {}
            bFormat != null && object.forEach(bFormat, (v, k) => {
              if (!fun.equalityDeep(v, aFormat?.[k] || null)) {
                fupdate[k] = v
              }
            })
            aFormat && object.forEach(aFormat, (_, k) => {
              if (b?.format?.[k] === undefined) {
                fupdate[k] = null
              }
            })
            formattingDiff.retain(minForward, fupdate)
          }
          // update offset and iterators
          if (bOffset >= b.length) {
            b = b.next
            bOffset = 0
          }
          if (aOffset >= a.length) {
            a = a.next
            aOffset = 0
          }
        } else {
          error.unexpectedCase()
        }
      }
      d.apply(formattingDiff)
    }
    for (const attr2 of d2.attrs) {
      const key = attr2.key
      // @ts-ignore
      const attr1 = d1.attrs[key]
      if (attr1 == null || (attr1.fingerprint !== attr2.fingerprint)) {
        /* c8 ignore else */
        if ($setAttrOp.check(attr2)) {
          const prevVal = attr1?.value
          const nextVal = attr2.value
          if ($deltaAny.check(prevVal) && $deltaAny.check(nextVal) && prevVal.name === nextVal.name) {
            d.modifyAttr(key, diff(prevVal, nextVal))
          } else {
            d.setAttr(key, nextVal)
          }
        } else {
          /* c8 ignore next 2 */
          error.unexpectedCase()
        }
      }
    }
    for (const { key } of d1.attrs) {
      // @ts-ignore
      if (d2.attrs[key] == null) {
        d.deleteAttr(key)
      }
    }
  }
  return d.done(false)
}

/**
 * @param {string|any} c
 */
const contentLen = c => typeof c === 'string' ? c.length : 1

/**
 * Apply removes from c.remove to d, mutating c.remove to exclude the applied items
 *
 * @param {DeltaBuilderAny} d
 * @param {Array<any>} crem
 * @param {number} len
 */
const applyRemoves = (d, crem, len) => { len > 0 && d.delete(crem.splice(0, len).map(contentLen).reduce(math.add, 0)) }
/**
 * Apply inserts from c.insert to d, mutating c.insert to exclude the applied items
 *
 * @param {DeltaBuilderAny} d
 * @param {Array<any>} cins
 * @param {number} len
 */
const applyInserts = (d, cins, len) => { len > 0 && cins.splice(0, len).forEach(ins => d.insert(typeof ins === 'string' ? ins : [ins instanceof _DiffStringWrapper ? ins.str : ins])) }

/**
 * @param {DeltaBuilderAny} d
 * @param {Array<{ index: number, remove: Array<any>, insert: Array<any> }>} changeset
 */
const applyChangesetToDelta = (d, changeset) => {
  for (let ci = 0, lastIndex = 0; ci < changeset.length; ci++) {
    const c = changeset[ci]
    d.retain(c.index - lastIndex)
    lastIndex = c.index + c.remove.map(contentLen).reduce(math.add, 0)
    // @todo do patience diff on the delta-names, then perform maximum number of mods instead of
    // insert/delete
    while (true) {
      const cremoveDeltaIndex = c.remove.findIndex(cc => $deltaAny.check(cc))
      if (cremoveDeltaIndex < 0) break
      const cremoveDelta = c.remove[cremoveDeltaIndex]
      const cinsertDeltaIndex = c.insert.findIndex(cc => $deltaAny.check(cc) && cc.name === cremoveDelta.name)
      if (cinsertDeltaIndex < 0) {
        applyRemoves(d, c.remove, cremoveDeltaIndex + 1)
        continue
      }
      applyRemoves(d, c.remove, cremoveDeltaIndex)
      applyInserts(d, c.insert, cinsertDeltaIndex)
      d.modify(diff(c.remove[0], c.insert[0]))
      c.remove.splice(0, 1)
      c.insert.splice(0, 1)
    }
    applyRemoves(d, c.remove, c.remove.length)
    applyInserts(d, c.insert, c.insert.length)
  }
  return d
}

/**
 * @param {Array<{ index: number, remove: Array<any>, insert: Array<any> }>} changeset
 * @param {RegExp} separator
 */
export const diffChangesetWithSeparator = (changeset, separator) => {
  /**
   * @type {Array<any>}
   */
  const next = []
  changeset.forEach(change => {
    // @todo actually split here
    const cs1 = splitContentArrayByRegexp(change.remove, separator)
    const cs2 = splitContentArrayByRegexp(change.insert, separator)
    const fp1 = cs1.map(c => typeof c === 'string' ? c : fingerprintTrait.fingerprint(c))
    const fp2 = cs2.map(c => typeof c === 'string' ? c : fingerprintTrait.fingerprint(c))
    const changesetF = patience.diff(fp1, fp2)
    const nextChangeset = fillFingerprintDiffFromContent(changesetF, cs1, cs2)
    let prevDiffIndex = 0
    let nextChangeIndex = change.index
    // adjust indexes for actual content length and add results to `next`
    nextChangeset.forEach(c => {
      // adjust equal content
      for (; prevDiffIndex < c.index; prevDiffIndex += 1) {
        nextChangeIndex += contentLen(cs1[prevDiffIndex])
      }
      // need to adjust index with the actual length of the previous items
      c.index = nextChangeIndex
      next.push(c)
    })
  })
  return next
}

/**
 * @param {Array<any>} cs
 * @param {RegExp} regexp
 */
const splitContentArrayByRegexp = (cs, regexp) => {
  /**
   * @type {Array<any>}
   */
  const res = []
  cs.forEach(c => {
    if (typeof c === 'string') {
      res.push(...patience.splitByRegexp(c, regexp, true))
    } else {
      res.push(c)
    }
  })
  return res
}

/**
 * @template C
 * @param {Array<{ index: number, remove: Array<string>, insert: Array<string> }>} changeset
 * @param {Array<C>} is
 * @param {Array<C>} should
 * @return {Array<{ index: number, remove: Array<C>, insert: Array<C> }>}
 */
const fillFingerprintDiffFromContent = (changeset, is, should) => {
  // overwrite fingerprinted content with actual content
  for (let i = 0, adj = 0; i < changeset.length; i++) {
    const cd = changeset[i]
    // @ts-ignore
    cd.remove = is.slice(cd.index, cd.index + cd.remove.length)
    // @ts-ignore
    cd.insert = should.slice(cd.index + adj, cd.index + adj + cd.insert.length)
    adj += cd.insert.length - cd.remove.length
  }
  return /** @type {any} */ (changeset)
}
