/* global MutationObserver */
import { ObservableV2 } from '../observable.js'
import * as delta from './index.js'
import * as dt from './transformer.js' // eslint-disable-line
import * as dom from '../dom.js'
import * as set from '../set.js'
import * as map from '../map.js'
import * as error from '../error.js'
import * as math from '../math.js'
import * as mux from '../mutex.js'
import * as s from '../schema.js'

/**
 * @template T
 * @typedef {import('../schema.js').Schema<T>} Schema
 */

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {delta.AbstractDelta} DeltaB
 */
export class Binding {
  /**
   * @param {RDT<DeltaA>} a
   * @param {RDT<DeltaB>} b
   * @param {dt.Template<any,DeltaA,DeltaB>} template
   */
  constructor (a, b, template) {
    /**
     * @type {dt.Transformer<any,DeltaA,DeltaB>}
     */
    this.t = template.init()
    this.a = a
    this.b = b
    this._achanged = this.a.on('change', d => {
      if (d.origin !== b && d.origin !== this) {
        const tres = this.t.applyA(d)
        if (tres.a) {
          tres.a.origin = this
          a.update(tres.a)
        }
        if (tres.b) {
          tres.b.origin = d.origin
          b.update(tres.b)
        }
      }
    })
    this._bchanged = this.b.on('change', d => {
      if (d.origin !== a && d.origin !== this) {
        const tres = this.t.applyB(d)
        if (tres.b) {
          tres.b.origin = this
          this.b.update(tres.b)
        }
        if (tres.a) {
          tres.a.origin = d.origin
          a.update(tres.a)
        }
      }
    })
  }

  destroy = () => {
    this.a.off('destroy', this.destroy)
    this.b.off('destroy', this.destroy)
    this.a.off('change', this._achanged)
    this.b.off('change', this._bchanged)
  }
}

/**
 * Abstract Interface for a delta-based Replicated Data Type.
 *
 * @template {delta.AbstractDelta} Delta
 * @typedef {ObservableV2<{ 'change': (delta: Delta) => void, 'destroy': (rdt:RDT<Delta>)=>void }> & { update: (delta: Delta) => any, destroy: () => void }} RDT
 */

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {delta.AbstractDelta} DeltaB
 * @param {RDT<NoInfer<DeltaA>>} a
 * @param {RDT<NoInfer<DeltaB>>} b
 * @param {dt.Template<any,DeltaA,DeltaB>} template
 */
export const bind = (a, b, template) => new Binding(a, b, template)

/**
 * @template {delta.AbstractDelta} Delta
 * @implements RDT<Delta>
 * @extends {ObservableV2<{ change: (delta: Delta) => void, 'destroy': (rdt:DeltaRDT<Delta>)=>void }>}
 */
class DeltaRDT extends ObservableV2 {
  /**
   * @param {Schema<Delta>} $delta
   */
  constructor ($delta) {
    super()
    this.$delta = $delta
    /**
     * @type {Delta?}
     */
    this.state = null
  }

  /**
   * @param {Delta} delta
   */
  update = delta => {
    if (this.state != null) {
      this.state.apply(delta)
    } else {
      this.state = delta
    }
    this.emit('change', [delta])
  }

  destroy () {
    this.emit('destroy', [this])
    super.destroy()
  }
}

/**
 * @template {delta.AbstractDelta} Delta
 * @param {Schema<Delta>} $delta
 */
export const deltaRDT = $delta => new DeltaRDT($delta)

/**
 * @param {Node} domNode
 */
const domToDelta = domNode => {
  if (dom.$element.check(domNode)) {
    const d = delta.node(domNode.nodeName)
    for (let i = 0; i < domNode.attributes.length; i++) {
      const attr = /** @type {Attr} */ (domNode.attributes.item(i))
      d.attributes.set(attr.nodeName, attr.value)
    }
    /**
     * @type {Array<delta.Node | delta.Text>}
     */
    const childrenInsert = []
    domNode.childNodes.forEach(child => {
      childrenInsert.push(domToDelta(child))
    })
    return d
  } else if (dom.$text.check(domNode)) {
    // @todo text should simply be included in the parent node content
    return delta.text(domNode.textContent)
  }
  error.unexpectedCase()
}

/**
 * @param {DomDelta} d
 */
const deltaToDom = d => {
  if (delta.$nodeAny.check(d)) {
    const n = dom.element(d.name)
    d.attributes.forEach(change => {
      if (delta.$insertOp.check(change)) {
        n.setAttribute(change.key, change.value)
      }
    })
    d.children.forEach(child => {
      if (delta.$insertOp.check(child)) {
        n.append(...child.insert.map(deltaToDom))
      } else if (delta.$textOp.check(child)) {
        n.append(dom.text(child.insert))
      }
    })
    return n
  }
  error.unexpectedCase()
}

/**
 * @param {Element} el
 * @param {delta.Node<string,any,any,any>} d
 */
const applyDeltaToDom = (el, d) => {
  d.attributes.forEach(change => {
    if (delta.$deleteOp.check(change)) {
      el.removeAttribute(change.key)
    } else {
      el.setAttribute(change.key, change.value)
    }
  })
  let childIndex = 0
  let childOffset = 0
  d.children.forEach(change => {
    let child = el.childNodes[childIndex] || null
    if (delta.$deleteOp.check(change)) {
      let len = change.length
      while (len > 0) {
        if (dom.$element.check(child)) {
          child.remove()
          len--
        } else if (dom.$text.check(child)) {
          const childLen = child.length
          if (childOffset === 0 && childLen <= len) {
            child.remove()
            len -= childLen
          } else {
            const spliceLen = math.min(len, childLen - childOffset)
            child.deleteData(childOffset, spliceLen)
            if (child.length <= childOffset) {
              childOffset = 0
              childIndex++
            }
          }
        }
      }
    } else if (delta.$insertOp.check(change)) {
      if (childOffset > 0) {
        const tchild = dom.$text.cast(child)
        child = tchild.splitText(childOffset)
        childIndex++
        childOffset = 0
      }
      el.insertBefore(dom.fragment(change.insert.map(deltaToDom)), child?.nextSibling)
    } else if (delta.$modifyOp.check(change)) {
      applyDeltaToDom(dom.$element.cast(child), change.modify)
    } else {
      error.unexpectedCase()
    }
  })
}

export const $domDelta = delta.$node(s.$string, s.$record(s.$string, s.$string), s.$never, { recursive: true, withText: true })

/**
 * @typedef {delta.RecursiveNode<string, { [key:string]: string }, never, true>} DomDelta
 */

/**
 * @template {DomDelta} [D=DomDelta]
 * @implements RDT<D>
 * @extends {ObservableV2<{ change: (delta: D)=>void, destroy: (rdt:DomRDT<D>)=>void }>}>}
 */
class DomRDT extends ObservableV2 {
  /**
   * @param {Element} observedNode
   */
  constructor (observedNode) {
    super()
    this.observedNode = observedNode
    this._mux = mux.createMutex()
    this.observer = new MutationObserver(this._mutationHandler)
    this.observer.observe(observedNode, {
      subtree: true,
      childList: true,
      attributes: true,
      characterDataOldValue: true
    })
  }

  _mutationHandler = /** @param {MutationRecord[]} mutations */ mutations =>
    this._mux(() => {
      /**
       * @typedef {{ removedBefore: Map<Node?,number>, added: Set<Node>, modified: number, d: D }} ChangedNodeInfo
       */
      /**
       * Compute all deltas without recursion.
       *
       * 1. mark all changed parents in parentsChanged
       * 2. fill out necessary information for each changed parent ()
       */
      //
      /**
       * @type {Map<Node,ChangedNodeInfo>}
       */
      const changedNodes = map.create()
      /**
       * @param {Node} node
       * @return {ChangedNodeInfo}
       */
      const getChangedNodeInfo = node => map.setIfUndefined(changedNodes, node, () => ({ removedBefore: map.create(), added: set.create(), modified: 0, d: /** @type {D} */ (delta.node(node.nodeName)) }))
      const observedNodeInfo = getChangedNodeInfo(this.observedNode)
      mutations.forEach(mutation => {
        const target = /** @type {HTMLElement} */ (mutation.target)
        const parent = target.parentNode
        const attrName = /** @type {string} */ (mutation.attributeName)
        const newVal = target.getAttribute(attrName)
        const info = getChangedNodeInfo(target)
        const d = info.d
        d.origin = this
        // go up the tree and mark that a child has been modified
        for (let changedParent = parent; changedParent != null && getChangedNodeInfo(changedParent).modified++ > 1 && changedParent !== this.observedNode; changedParent = changedParent.parentNode) {
          // nop
        }
        switch (mutation.type) {
          case 'attributes': {
            const attrs = /** @type {delta.Node<any,any,any>} */ (d).attributes
            if (newVal == null) {
              attrs.delete(attrName)
            } else {
              attrs.set(/** @type {string} */ (attrName), newVal)
            }
            break
          }
          case 'characterData': {
            error.methodUnimplemented()
            break
          }
          case 'childList': {
            const targetInfo = getChangedNodeInfo(target)
            mutation.addedNodes.forEach(node => {
              targetInfo.added.add(node)
            })
            const removed = mutation.removedNodes.length
            if (removed > 0) {
              // @todo this can't work because next can be null
              targetInfo.removedBefore.set(mutation.nextSibling, removed)
            }
            break
          }
        }
      })
      changedNodes.forEach((info, node) => {
        const numOfChildChanges = info.modified + info.removedBefore.size + info.added.size
        const d = /** @type {delta.Node<any,any,any>} */ (info.d)
        if (numOfChildChanges > 0) {
          node.childNodes.forEach(nchild => {
            if (info.removedBefore.has(nchild)) { // can happen separately
              d.children.delete(/** @type {number} */ (info.removedBefore.get(nchild)))
            }
            if (info.added.has(nchild)) {
              d.children.insert([domToDelta(nchild)])
            } else if (changedNodes.has(nchild)) {
              d.children.modify(getChangedNodeInfo(nchild).d)
            }
          })
          // remove items to the end, if necessary
          d.children.delete(info.removedBefore.get(null) ?? 0)
        }
        d.done()
      })
      this.emit('change', [observedNodeInfo.d])
    })

  /**
   * @param {D} delta
   */
  update = delta => {
    if (delta.origin !== this) {
      // @todo the retrieved changes must be transformed agains the updated changes. need a proper
      // transaction system
      this._mutationHandler(this.observer.takeRecords())
      this._mux(() => {
        applyDeltaToDom(this.observedNode, delta)
        this.observer.takeRecords()
      })
    }
  }

  destroy () {
    this.emit('destroy', [this])
    super.destroy()
    this.observer.disconnect()
  }
}

/**
 * @param {Element} dom
 */
export const domRDT = dom => new DomRDT(dom)
