/**
 * 
 */
export class $ArrayDelta extends s.$Schema {
  constructor (c) {
    super()
    this.v = c
  }

  /**
   * @param {any} o
   * @return {o is C extends ((...args:any[]) => infer T) ? T : (C extends (new (...args:any[]) => any) ? InstanceType<C> : never)} o
   */
  check (o) {
    return o?.constructor === this.v
  }
}

/**
 */
const $arrayDelta = (...args) => {
}

/**
 * @template {any} ArrayContent
 * @template {object} Embeds
 * @template {Delta|undefined} ModifyingDelta
 * @typedef {InsertTextOp|InsertEmbedOp<Embeds>|InsertArrayOp<ArrayContent>|RetainOp|DeleteOp|(ModifyingDelta extends undefined ? never : ModifyOp<ModifyingDelta extends undefined ? never : ModifyingDelta>)} DeltaOp
 */

/**
 * @template {object} Embeds
 * @template {Delta|undefined} Modifiers
 * @typedef {InsertTextOp|InsertEmbedOp<Embeds>|RetainOp|DeleteOp|(Modifiers extends undefined ? never : ModifyOp<Modifiers extends undefined ? never : Modifiers>)} TextDeltaOp
 */

/**
 * @template ArrayContent
 * @typedef {InsertArrayOp<ArrayContent>|RetainOp|DeleteOp} ArrayDeltaOp
 */

/**
 * @typedef {{ [key: string]: any }} FormattingAttributes
 */

/**
 * @typedef {Array<DeltaJsonOp>} DeltaJson
 */

/**
 * @typedef {{ insert: string|object, attributes?: { [key: string]: any }, attribution?: Attribution } | { delete: number } | { retain: number, attributes?: { [key:string]: any }, attribution?: Attribution } | { modify: object }} DeltaJsonOp
 */

export class InsertTextOp {
  /**
   * @param {string} insert
   * @param {FormattingAttributes|null} attributes
   * @param {Attribution|null} attribution
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
   * @param {InsertTextOp} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.insert, other.insert) && fun.equalityDeep(this.attributes, other.attributes) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

/**
 * @template {any} ArrayContent
 */
export class InsertArrayOp {
  /**
   * @param {Array<ArrayContent>} insert
   * @param {FormattingAttributes|null} attributes
   * @param {Attribution|null} attribution
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
   * @param {InsertArrayOp<ArrayContent>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.insert, other.insert) && fun.equalityDeep(this.attributes, other.attributes) && fun.equalityDeep(this.attribution, other.attribution)
  }
}

/**
 * @template {object} Embeds
 */
export class InsertEmbedOp {
  /**
   * @param {Embeds} insert
   * @param {FormattingAttributes|null} attributes
   * @param {Attribution|null} attribution
   */
  constructor (insert, attributes, attribution) {
    this.insert = insert
    this.attributes = attributes
    this.attribution = attribution
  }

  /**
   * @return {'insertEmbed'}
   */
  get type () {
    return 'insertEmbed'
  }

  get length () {
    return 1
  }

  /**
   * @return {DeltaJsonOp}
   */
  toJSON () {
    return object.assign({ insert: this.insert }, this.attributes ? { attributes: this.attributes } : ({}), this.attribution ? { attribution: this.attribution } : ({}))
  }

  /**
   * @param {InsertEmbedOp<Embeds>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.insert, other.insert) && fun.equalityDeep(this.attributes, other.attributes) && fun.equalityDeep(this.attribution, other.attribution)
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

export class RetainOp {
  /**
   * @param {number} retain
   * @param {FormattingAttributes|null} attributes
   * @param {Attribution|null} attribution
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

/**
 * Delta that can be applied on a YType Embed
 *
 * @template {Delta} DTypes
 */
export class ModifyOp {
  /**
   * @param {DTypes} delta
   */
  constructor (delta) {
    this.modify = delta
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
    return { modify: this.modify.toJSON() }
  }

  /**
   * @param {ModifyOp<any>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.modify[traits.EqualityTraitSymbol](other.modify)
  }
}

/**
 * @template {'array' | 'text' | 'custom'} Type
 * @template {DeltaOp<any,any,Modifiers>} TDeltaOp
 * @template {Delta|undefined} Modifiers
 */
export class AbstractArrayDelta extends AbstractDelta {
  /**
   * @param {Type} type
   */
  constructor (type) {
    super()
    this.type = type
    /**
     * @type {Array<TDeltaOp>}
     */
    this.ops = []
  }

  /**
   * @template {(d:TDeltaOp) => DeltaOp<any,any,any>} Mapper
   * @param {Mapper} f
   * @return {AbstractArrayDeltaBuilder<Type, Mapper extends (d:TDeltaOp) => infer OP ? OP : unknown,Modifiers>}
   */
  map (f) {
    const d = /** @type {AbstractArrayDeltaBuilder<Type,any,Modifiers>} */ (new /** @type {any} */ (this.constructor)(this.type))
    d.ops = this.ops.map(f)
    // @ts-ignore
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
   * @param {null|((d:TDeltaOp,index:number)=>void)} f
   * @param {null|((insertOp:Exclude<TDeltaOp,RetainOp|DeleteOp|ModifyOp<any>>,index:number)=>void)} insertHandler
   * @param {null|((retainOp:RetainOp,index:number)=>void)} retainHandler
   * @param {null|((deleteOp:DeleteOp,index:number)=>void)} deleteHandler
   * @param {null|(Modifiers extends undefined ? null : ((modifyOp:ModifyOp<Modifiers extends undefined ? never : Modifiers>,index:number)=>void))} modifyHandler
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
   * @param {AbstractArrayDelta<Type,TDeltaOp,any>} other
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
   * @param {AbstractArrayDelta<Type,TDeltaOp,any>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return fun.equalityDeep(this.ops, other.ops)
  }
}

/**
 * @template {'array' | 'text' | 'custom'} Type
 * @template {typeof $anyTextOp} $OPS
 * @extends AbstractArrayDelta<Type,TDeltaOp,Modifiers>
 */
export class AbstractArrayDeltaBuilder extends AbstractArrayDelta {
  /**
   * @param {Type} type
   * @param {$OPS} $ops
   */
  constructor (type, $ops) {
    super(type)
    /**
     * @type {FormattingAttributes?}
     */
    this.usedAttributes = null
    /**
     * @type {Attribution?}
     */
    this.usedAttribution = null
    /**
     * @type {TDeltaOp?}
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
   * @param {Attribution?} attribution
   */
  useAttribution (attribution) {
    this.usedAttribution = attribution
    return this
  }

  /**
   * @param {(TDeltaOp extends InsertTextOp ? string : never) | (TDeltaOp extends InsertEmbedOp<infer Embeds> ? (Embeds) : never) | (TDeltaOp extends InsertArrayOp<infer Content> ? Array<Content> : never) } insert
   * @param {FormattingAttributes?} attributes
   * @param {Attribution?} attribution
   * @return {this}
   */
  insert (insert, attributes = null, attribution = null) {
    const mergedAttributes = mergeAttrs(this.usedAttributes, attributes)
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
    if (((this.lastOp instanceof InsertTextOp && insert.constructor === String) || (this.lastOp instanceof InsertArrayOp && insert.constructor === Array)) && (mergedAttributes === this.lastOp.attributes || fun.equalityDeep(mergedAttributes, this.lastOp.attributes)) && (mergedAttribution === this.lastOp.attribution || fun.equalityDeep(mergedAttribution, this.lastOp.attribution))) {
      // @ts-ignore
      if (insert.constructor === String) {
        // @ts-ignore
        this.lastOp.insert += insert
      } else {
        // @ts-ignore
        this.lastOp.insert.push(...insert)
      }
    } else {
      const OpConstructor = /** @type {any} */ (insert.constructor === String ? InsertTextOp : (insert.constructor === Array ? InsertArrayOp : InsertEmbedOp))
      this.ops.push(this.lastOp = new OpConstructor(insert, object.isEmpty(mergedAttributes) ? null : mergedAttributes, object.isEmpty(mergedAttribution) ? null : mergedAttribution))
    }
    return this
  }

  /**
   * @param {number} retain
   * @param {FormattingAttributes?} attributes
   * @param {Attribution?} attribution
   * @return {this}
   */
  retain (retain, attributes = null, attribution = null) {
    const mergedAttributes = mergeAttrs(this.usedAttributes, attributes)
    const mergedAttribution = mergeAttrs(this.usedAttribution, attribution)
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
   * @return {Type extends 'array' ? ArrayDelta<TDeltaOp,Modifiers> : (Type extends 'text' ? TextDelta<TDeltaOp,Modifiers> : AbstractArrayDelta<Type,TDeltaOp,Modifiers>)}
   */
  done () {
    while (this.lastOp != null && this.lastOp instanceof RetainOp && this.lastOp.attributes === null && this.lastOp.attribution === null) {
      this.ops.pop()
      this.lastOp = this.ops[this.ops.length - 1] ?? null
    }
    return /** @type {any} */ (this)
  }
}

/**
 * @template {any} ArrayContent
 * @template {Delta|undefined} Modifiers
 * @extends AbstractArrayDeltaBuilder<'array', ArrayDeltaOp<ArrayContent>,Modifiers>
 */
export class ArrayDeltaBuilder extends AbstractArrayDeltaBuilder {
  constructor () {
    super('array')
  }
}

/**
 * @template {any} ArrayContent
 * @template {Delta|undefined} Modifiers
 * @typedef {AbstractArrayDelta<'array', ArrayDeltaOp<ArrayContent>,Modifiers>} ArrayDelta
 */

/**
 * @template {object} Embeds
 * @template {Delta|undefined} Modifiers
 * @typedef {AbstractArrayDelta<'text',TextDeltaOp<Embeds,Modifiers>,Modifiers>} TextDelta
 */

/**
 * @template {object} Embeds
 * @template {Delta|undefined} [Modifiers=undefined]
 * @extends AbstractArrayDeltaBuilder<'text',TextDeltaOp<Embeds,Modifiers>,Modifiers>
 */
export class TextDeltaBuilder extends AbstractArrayDeltaBuilder {
  constructor ($ops) {
    super('text', $ops)
  }
}

/**
 * @template [V=any]
 * @template {Delta|undefined} [Modifiers=undefined]
 * @return {ArrayDeltaBuilder<V,Modifiers>}
 */
export const createArrayDelta = () => new ArrayDeltaBuilder()

/**
 * @template {'custom' | 'text' | 'array'} T
 * @param {DeltaJson} ops
 * @param {T} type
 */
export const fromJSON = (ops, type) => {
  const d = new AbstractArrayDeltaBuilder(type)
  for (let i = 0; i < ops.length; i++) {
    const op = /** @type {any} */ (ops[i])
    // @ts-ignore
    if (op.insert !== undefined) {
      d.insert(op.insert, op.attributes, op.attribution)
    } else if (op.retain !== undefined) {
      d.retain(op.retain, op.attributes ?? null, op.attribution ?? null)
    } else if (op.delete !== undefined) {
      d.delete(op.delete)
    } else {
      error.unexpectedCase()
    }
  }
  return d.done()
}

export const $textOp = s.$constructedBy(InsertTextOp)
export const $deleteOp = s.$constructedBy(DeleteOp)

/**
 * @template T
 * @param {s.$Schema<T>} $value
 * @return {s.$Schema<InsertArrayOp<T>>}
 */
export const $arrayOp = ($value) => /** @type {s.$Schema<InsertArrayOp<T>>} */ (s.$constructedBy(InsertArrayOp, o => o.insert.every(ins => $value.check(ins))))

/**
 * @template {object} T
 * @param {s.$Schema<T>} $embed
 * @return {s.$Schema<InsertEmbedOp<T>>}
 */
export const $embedOp = ($embed) => /** @type {s.$Schema<InsertEmbedOp<T>>} */ (s.$constructedBy(InsertEmbedOp, o => $embed.check(o)))

export const $anyOp = s.$union($arrayOp(s.$any),$embedOp(s.$any))
export const $anyTextOp= s.$union($embedOp(s.$any))

// @todo below is to do

/**
 * @param {typeof $anyOp} $ops
 */
export const $delta = $ops => s.$instanceOf(AbstractArrayDelta)

/**
 * @template {typeof $anyTextOp} $OPS
 * @param {$OPS} $ops
 */
export const createTextDelta = ($ops = /** @type {$OPS} */ ($anyTextOp)) => new TextDeltaBuilder($ops)

/**
 * @param {typeof $anyOp} $ops
 */
export const createDelta = ($ops = $anyOp) => {

}

createDelta(42)
createMapDelta(423, "dtrn")
createXmlDelta

