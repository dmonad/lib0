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
export class DeltaXml extends dabstract.AbstractDelta {
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
   * @return {DeltaXml<Children, Attrs, 'done'>}
   */
  done () {
    /** @type {darray.DeltaArrayBuilder<any>} */ (this.children).done()
    ;/** @type {dmap.DeltaMapBuilder<any>} */ (this.attributes).done()
    return /** @type {any} */ (this)
  }

  /**
   * @param {DeltaXml<NodeName,Children,Attrs>} other
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
 * @return {DeltaXml<NodeName,Children,Attrs>}
 */
export const createDeltaXml = (nodeName, children = darray.createDeltaArray(), attributes = /** @type {any} */ (dmap.createDeltaMap())) => new DeltaXml(nodeName, children, attributes)

/**
 * @template {string} NodeName
 * @template Children
 * @template {{ [key:string]: any }} Attributes
 * @param {s.$Schema<NodeName>} $nodeName
 * @param {s.$Schema<Children>} $children
 * @param {s.$Schema<Attributes>} $attributes
 * @return {s.$Schema<DeltaXml<NodeName, Children, Attributes>>}
 */
export const $deltaXml = ($nodeName, $children, $attributes) => {
  const $dchildren = darray.$deltaArray($children)
  const $dattrs = dmap.$deltaMap($attributes)
  return/** @type {s.$Schema<DeltaXml<NodeName, any, any>>} */ (s.$instanceOf(DeltaXml, o => $nodeName.check(o.nodeName) && $dchildren.check(o.children) && $dattrs.check(o.attributes)))
}
export const $deltaXmlAny = s.$constructedBy(DeltaXml)
