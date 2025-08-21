import * as traits from '../traits.js'
import * as dabstract from './abstract.js'
import * as darray from './array.js'
import * as dmap from './map.js'
import * as s from '../schema.js'

/**
 * @template {string|undefined} NodeName
 * @template Children
 * @template {object} Attrs
 * @template {'done'|'mutable'} [Done='mutable']
 */
export class DeltaNode extends dabstract.AbstractDelta {
  /**
   * @param {NodeName} nodeName
   * @param {darray.DeltaArrayBuilder<Children>} children
   * @param {dmap.DeltaMapBuilder<Attrs>} attributes
   */
  constructor (nodeName, children, attributes) {
    super()
    this.name = nodeName
    /**
     * @type {Done extends 'mutable' ? darray.DeltaArrayBuilder<Children> : darray.DeltaArray<Children>}
     */
    this.children = /** @type {any} */ (children)
    /**
     * @type {Done extends 'mutable' ? dmap.DeltaMapBuilder<Attrs> : dmap.DeltaMap<Attrs>}
     */
    this.attributes = /** @type {any} */ (attributes)
  }

  toJSON () {
    return {
      name: this.name,
      children: this.children.toJSON(),
      attributes: this.attributes.toJSON()
    }
  }

  /**
   * @return {DeltaNode<Children, Attrs, 'done'>}
   */
  done () {
    /** @type {darray.DeltaArrayBuilder<any>} */ (this.children).done()
    ;/** @type {dmap.DeltaMapBuilder<any>} */ (this.attributes).done()
    return /** @type {any} */ (this)
  }

  /**
   * @param {DeltaNode<NodeName,Children,Attrs>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.name === other.name && this.children[traits.EqualityTraitSymbol](other.children) && this.attributes[traits.EqualityTraitSymbol](other.attributes)
  }
}

/**
 * @template {string|undefined} NodeName
 * @template Children
 * @template {object} Attrs
 * @param {NodeName} nodeName
 * @param {darray.DeltaArrayBuilder<Children>} children
 * @param {dmap.DeltaMapBuilder<Attrs>} attributes
 * @return {DeltaNode<NodeName,Children,Attrs>}
 */
export const node = (nodeName, children = darray.array(), attributes = /** @type {any} */ (dmap.map())) => new DeltaNode(nodeName, children, attributes)

/**
 * @template {string} NodeName
 * @template Children
 * @template {{ [key:string]: any }} Attributes
 * @param {s.$Schema<NodeName>} $nodeName
 * @param {s.$Schema<Children>} $children
 * @param {s.$Schema<Attributes>} $attributes
 * @return {s.$Schema<DeltaNode<NodeName, Children, Attributes>>}
 */
export const $node = ($nodeName, $children, $attributes) => {
  const $dchildren = darray.$array($children)
  const $dattrs = dmap.$map($attributes)
  return/** @type {s.$Schema<DeltaNode<NodeName, any, any>>} */ (s.$instanceOf(DeltaNode, o => $nodeName.check(o.name) && $dchildren.check(o.children) && $dattrs.check(o.attributes)))
}
export const $nodeAny = s.$constructedBy(DeltaNode)
