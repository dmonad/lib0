
/**
 * @template {string|undefined} NodeName
 * @template Children
 * @template {object} Attrs
 * @template {Delta|undefined} [ChildModifiers=undefined]
 * @template {Delta|undefined} [AttrModifiers=undefined]
 * @template {'done'|'mutable'} [Done='mutable']
 */
export class XmlDelta extends AbstractDelta {
  /**
   * @param {NodeName} nodeName
   * @param {ArrayDeltaBuilder<Children,ChildModifiers>} children
   * @param {MapDelta<Attrs,AttrModifiers>} attributes
   */
  constructor (nodeName, children, attributes) {
    super()
    this.nodeName = nodeName
    /**
     * @type {ArrayDeltaBuilder<Children,ChildModifiers>}
     */
    this.children = children
    /**
     * @type {Done extends 'mutable' ? MapDeltaBuilder<Attrs> : MapDelta<Attrs,AttrModifiers>}
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
   * @return {XmlDelta<Children, Attrs, ChildModifiers, AttrModifiers, 'done'>}
   */
  done () {
    this.children.done()
    this.attributes.done()
    return /** @type {any} */ (this)
  }

  /**
   * @param {XmlDelta<any,any,any>} other
   */
  [traits.EqualityTraitSymbol] (other) {
    return this.nodeName === other.nodeName && this.children[traits.EqualityTraitSymbol](other.children) && this.attributes[traits.EqualityTraitSymbol](other.attributes)
  }
}

/**
 * @template {string|undefined} NodeName
 * @template Children
 * @template {object} Attrs
 * @template {Delta|undefined} [ChildModifiers=undefined]
 * @template {Delta|undefined} [AttrModifiers=undefined]
 * @param {NodeName} nodeName
 * @param {ArrayDeltaBuilder<Children,ChildModifiers>} children
 * @param {MapDeltaBuilder<Attrs,AttrModifiers>} attributes
 * @return {XmlDelta<NodeName,Children,Attrs,ChildModifiers, AttrModifiers>}
 */
export const createXmlDelta = (nodeName, children = createArrayDelta(), attributes = /** @type {any} */ (createMapDelta())) => new XmlDelta(nodeName, children, attributes)

