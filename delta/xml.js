import * as traits from '../traits.js'
import * as dabstract from './abstract.js'
import * as darray from './array.js'
import * as dmap from './map.js'

/**
 * @template {string|undefined} NodeName
 * @template Children
 * @template {object} Attrs
 * @template {'done'|'mutable'} [Done='mutable']
 */
export class XmlDelta extends dabstract.AbstractDelta {
  /**
   * @param {NodeName} nodeName
   * @param {darray.DeltaArrayBuilder<Children>} children
   * @param {dmap.DeltaMapBuilder<Attrs>} attributes
   */
  constructor (nodeName, children, attributes) {
    super()
    this.nodeName = nodeName
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
      nodeName: this.nodeName,
      children: this.children.toJSON(),
      attributes: this.attributes.toJSON()
    }
  }

  /**
   * @return {XmlDelta<Children, Attrs, 'done'>}
   */
  done () {
    /** @type {darray.DeltaArrayBuilder<any>} */ (this.children).done()
    ;/** @type {dmap.DeltaMapBuilder<any>} */ (this.attributes).done()
    return /** @type {any} */ (this)
  }

  /**
   * @param {XmlDelta<NodeName,Children,Attrs>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.nodeName === other.nodeName && this.children[traits.EqualityTraitSymbol](other.children) && this.attributes[traits.EqualityTraitSymbol](other.attributes)
  }
}

/**
 * @template {string|undefined} NodeName
 * @template Children
 * @template {object} Attrs
 * @param {NodeName} nodeName
 * @param {darray.DeltaArrayBuilder<Children>} children
 * @param {dmap.DeltaMapBuilder<Attrs>} attributes
 * @return {XmlDelta<NodeName,Children,Attrs>}
 */
export const createXmlDelta = (nodeName, children = darray.createDeltaArray(), attributes = /** @type {any} */ (dmap.createDeltaMap())) => new XmlDelta(nodeName, children, attributes)
