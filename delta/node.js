import * as traits from '../traits.js'
import * as dabstract from './abstract.js'
import * as darray from './array.js'
import * as dmap from './map.js'
import * as s from '../schema.js'

/**
 * @template {string|undefined} [NodeName=string]
 * @template {{[key:string]:any}} [Attrs={[key:string]:any}]
 * @template [Children=any]
 * @template {'done'|'mutable'} [Done='mutable']
 */
export class DeltaNode extends dabstract.AbstractDelta {
  /**
   * @param {NodeName} nodeName
   * @param {Done extends 'mutable' ? dmap.DeltaMapBuilder<Attrs> : dmap.DeltaMap<Attrs>} attributes
   * @param {darray.DeltaArrayBuilder<Children>} children
   */
  constructor (nodeName, attributes, children) {
    super()
    this.name = nodeName
    /**
     * @type {Done extends 'mutable' ? dmap.DeltaMapBuilder<Attrs> : dmap.DeltaMap<Attrs>}
     */
    this.attributes = /** @type {any} */ (attributes)
    /**
     * @type {Done extends 'mutable' ? darray.DeltaArrayBuilder<Children> : darray.DeltaArray<Children>}
     */
    this.children = /** @type {any} */ (children)
  }

  /**
   * @param {DeltaNode<NodeName,Attrs,Children>} other
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
   * @return {DeltaNode<NodeName, Attrs, Children, 'done'>}
   */
  done () {
    /** @type {darray.DeltaArrayBuilder<any>} */ (this.children).done()
    ;/** @type {dmap.DeltaMapBuilder<any>} */ (this.attributes).done()
    return /** @type {any} */ (this)
  }

  /**
   * @param {DeltaNode<NodeName,Attrs,Children>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.name === other.name && this.children[traits.EqualityTraitSymbol](other.children) && this.attributes[traits.EqualityTraitSymbol](other.attributes)
  }
}

/**
 * @template {string|undefined} [NodeName=string]
 * @template {{[key:string]:any} | dmap.DeltaMapBuilder<any>} [Attrs={[key:string]:any}]
 * @template {Array<any> | darray.DeltaArrayBuilder<any>} [Children=Array<any>]
 * @param {NodeName} nodeName
 * @param {Attrs} [attributes]
 * @param {Children} [children]
 * @return {DeltaNode<NodeName,Attrs extends dmap.DeltaMapBuilder<infer AttrsDef> ? AttrsDef : Attrs,Children extends Array<infer ChildTypes> ? ChildTypes : (Children extends darray.DeltaArrayBuilder<infer ChildTypes> ? ChildTypes : never)>}
 */
export const node = (nodeName, attributes, children) =>
  new DeltaNode(
    nodeName,
    attributes == null
      ? dmap.map()
      : (dmap.$mapAny.check(attributes)
          ? /** @type {dmap.DeltaMapBuilder<any>} */ (attributes)
          : dmap.map().setMany(/** @type {any} */ (attributes))
        ),
    children == null
      ? darray.array()
      : (darray.$arrayAny.check(children)
          ? /** @type {darray.DeltaArrayBuilder<any>} */ (children)
          : darray.array().insert(children)
        )
  )

/**
 * @template {string} NodeName
 * @template Children
 * @template {{ [key:string]: any }} Attributes
 * @param {s.Schema<NodeName>} $nodeName
 * @param {s.Schema<Children>} $children
 * @param {s.Schema<Attributes>} $attributes
 * @return {s.Schema<DeltaNode<NodeName, Children, Attributes, 'done'>>}
 */
export const $node = ($nodeName, $children, $attributes) => {
  const $dchildren = darray.$array($children)
  const $dattrs = dmap.$map($attributes)
  return/** @type {s.Schema<DeltaNode<NodeName, any, any, 'done'>>} */ (s.$instanceOf(DeltaNode, o => $nodeName.check(o.name) && $dchildren.check(o.children) && $dattrs.check(o.attributes)))
}
export const $nodeAny = s.$constructedBy(DeltaNode)
