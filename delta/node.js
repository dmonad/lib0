import * as traits from '../traits.js'
import * as dabstract from './abstract.js'
import * as darray from './array.js'
import * as dmap from './map.js'
import * as s from '../schema.js'

/**
 * @template {string|undefined} [NodeName=string]
 * @template {{[key:string]:any}} [Attrs={[key:string]:any}]
 * @template [Children=any]
 * @template {boolean} [WithText=true]
 */
export class DeltaNode extends dabstract.AbstractDelta {
  /**
   * @param {NodeName} nodeName
   * @param {dmap.DeltaMap<Attrs>} attributes
   * @param {darray.DeltaArray<Children,WithText>} children
   */
  constructor (nodeName, attributes, children) {
    super()
    this.name = nodeName
    /**
     * @type {dmap.DeltaMap<Attrs>}
     */
    this.attributes = /** @type {any} */ (attributes)
    /**
     * @type {darray.DeltaArray<Children,WithText>}
     */
    this.children = /** @type {any} */ (children)
  }

  isEmpty () {
    return this.children.isEmpty() && this.attributes.isEmpty()
  }

  /**
   * @return {this}
   */
  clone () {
    return /** @type {this} */ (new DeltaNode(this.name, this.attributes.clone(), this.children.clone()))
  }

  /**
   * @param {(WithText extends true ? string : never) | Array<Children>} insert
   */
  insert (insert) {
    // @ts-ignore
    this.children.insert(insert)
    return this
  }

  /**
   * @template {keyof Attrs} K
   * @param {K} key
   * @param {Attrs[K]} newVal
   * @param {Attrs[K]|undefined} prevVal
   * @param {import('./abstract.js').Attribution?} attribution
   */
  set (key, newVal, prevVal, attribution) {
    this.attributes.set(key, newVal, prevVal, attribution)
    return this
  }

  /**
   * @param {import('./abstract.js').Attribution?} attribution
   * @param {Partial<Attrs>} kv
   */
  setMany (kv, attribution = null) {
    this.attributes.setMany(kv, attribution)
    return this
  }

  /**
   * @param {DeltaNode<NodeName,Partial<Attrs>,Children,WithText>} other
   */
  apply (other) {
    this.attributes.apply(other.attributes)
    this.children.apply(other.children)
  }

  toJSON () {
    return {
      name: this.name,
      attributes: this.attributes.toJSON(),
      children: this.children.toJSON()
    }
  }

  /**
   * @return {DeltaNode<NodeName, Attrs, Children, WithText>}
   */
  done () {
    /** @type {darray.DeltaArray<any>} */ (this.children).done()
    ;/** @type {dmap.DeltaMap<any>} */ (this.attributes).done()
    return /** @type {any} */ (this)
  }

  /**
   * @param {DeltaNode<NodeName,Partial<Attrs>,Children,WithText>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.name === other.name && this.children[traits.EqualityTraitSymbol](other.children) && this.attributes[traits.EqualityTraitSymbol](other.attributes)
  }
}

/**
 * @template {string|undefined} [NodeName=string]
 * @template {{[key:string]:any} | dmap.DeltaMap<any>} [Attrs={[key:string]:any}]
 * @template {Array<any> | string | darray.DeltaArray<any,any>} [Children=Array<any>]
 * @param {NodeName} nodeName
 * @param {Attrs} [attributes]
 * @param {Children} [children]
 * @return {DeltaNode<NodeName,Attrs extends dmap.DeltaMap<infer AttrsDef> ? AttrsDef : Attrs,Children extends Array<infer ChildTypes> ? ChildTypes : (Children extends darray.DeltaArray<infer ChildTypes,any> ? ChildTypes : never)>}
 */
export const node = (nodeName, attributes, children) =>
  new DeltaNode(
    nodeName,
    attributes == null
      ? dmap.map()
      : (dmap.$mapAny.check(attributes)
          ? /** @type {dmap.DeltaMap<any>} */ (attributes)
          : dmap.map().setMany(/** @type {any} */ (attributes))
        ),
    children == null
      ? darray.array()
      : (darray.$arrayAny.check(children)
          ? /** @type {darray.DeltaArray<any>} */ (children)
          : darray.array().insert(children)
        )
  )

/**
 * @template {string} NodeName
 * @template {{ [key:string]: any }} Attributes
 * @template Children
 * @template {boolean} WithText
 * @typedef {DeltaNode<NodeName, Attributes, Children | RecursiveDeltaNode<NodeName,Attributes,Children,WithText>, WithText>} RecursiveDeltaNode
 */

/**
 * @template {string} NodeName
 * @template {{ [key:string]: any }} Attributes
 * @template Children
 * @template {boolean} [Recursive=false]
 * @template {boolean} [WithText=false]
 * @param {s.Schema<NodeName>} $nodeName
 * @param {s.Schema<Children>} $children
 * @param {s.Schema<Attributes>} $attributes
 * @param {object} [opts]
 * @param {Recursive} [opts.recursive]
 * @param {WithText} [opts.withText]
 * @return {s.Schema<Recursive extends true ? RecursiveDeltaNode<NodeName, Partial<Attributes>, Children, WithText> : DeltaNode<NodeName, Partial<Attributes>, Children, withText>>}
 */
export const $node = ($nodeName, $attributes, $children, { recursive, withText } = {}) => {
  /**
   * @type {s.Schema<darray.DeltaArray<any,any>>}
   */
  let $dchildren = darray.$array($children)
  const $dattrs = dmap.$map($attributes)
  const $nodeSchema = /** @type {s.Schema<DeltaNode<NodeName, any, any, any>>} */ (s.$instanceOf(DeltaNode, o => $nodeName.check(o.name) && $dchildren.check(o.children) && $dattrs.check(o.attributes)))
  if (recursive) {
    $dchildren = darray.$array(s.$union($children, $nodeSchema), withText)
  }
  return /** @type {any} */ ($nodeSchema)
}
export const $nodeAny = s.$constructedBy(DeltaNode)
