/* global MutationObserver */

/**
 * # DOM delta RDT
 *
 * {@link domRDT} creates an RDT (see `../binding.js`) backed by a live DOM subtree. DOM mutations are
 * observed with a `MutationObserver`, turned into deltas and emitted as `'delta'` events; incoming
 * deltas are applied back onto the DOM. This lets a DOM subtree be bound to any other RDT.
 *
 * The whole module is browser-only (it needs a real DOM + `MutationObserver`), so it is excluded from
 * line coverage; its behavior is exercised by the browser-only tests in `./dom.test.js`
 * (`npm run debug`).
 *
 * @module delta/rdt/dom
 */

import { ObservableV2 } from '../../observable.js'
import * as delta from '../delta.js'
import * as dom from '../../dom.js'
import * as set from '../../set.js'
import * as map from '../../map.js'
import * as error from '../../error.js'
import * as math from '../../math.js'
import * as mux from '../../mutex.js'
import * as s from '../../schema.js'

/**
 * @template T
 * @typedef {import('../../schema.js').Schema<T>} Schema
 */

/**
 * @template {delta.DeltaAny} D
 * @typedef {import('../binding.js').RDT<D>} RDT
 */

/* c8 ignore start */

/**
 * Recursively convert a DOM node into a {@link DomDelta} (an "insert everything" delta describing the
 * node, its attributes, and its subtree).
 *
 * @param {Node} domNode
 * @return {DomDelta}
 */
const domToDelta = domNode => {
  if (dom.$element.check(domNode)) {
    const d = delta.create(domNode.nodeName.toLowerCase())
    for (let i = 0; i < domNode.attributes.length; i++) {
      const attr = /** @type {Attr} */ (domNode.attributes.item(i))
      d.setAttr(attr.nodeName, attr.value)
    }
    domNode.childNodes.forEach(child => {
      d.insert(dom.$text.check(child) ? (child.textContent ?? '') : [domToDelta(child)])
    })
    return /** @type {DomDelta} */ (d)
  }
  error.unexpectedCase()
}

/**
 * Render a {@link DomDelta} into a fresh DOM element (the inverse of {@link domToDelta}).
 *
 * @param {DomDelta} d
 * @return {Element}
 */
const deltaToDom = d => {
  if (delta.$deltaAny.check(d)) {
    const n = dom.element(/** @type {string} */ (d.name))
    for (const change of d.attrs) {
      if (delta.$setAttrOp.check(change)) {
        n.setAttribute(change.key, change.value)
      }
    }
    d.children.forEach(child => {
      if (delta.$insertOp.check(child)) {
        n.append(...child.insert.map(el => deltaToDom(/** @type {DomDelta} */ (el))))
      } else if (delta.$textOp.check(child)) {
        n.append(dom.text(child.insert))
      }
    })
    return n
  }
  error.unexpectedCase()
}

/**
 * Apply a {@link DomDelta} as an incremental change onto an existing DOM element, mutating it in place.
 *
 * @param {Element} el
 * @param {DomDelta} d
 */
const applyDeltaToDom = (el, d) => {
  for (const change of d.attrs) {
    if (delta.$deleteAttrOp.check(change)) {
      el.removeAttribute(change.key)
    } else if (delta.$setAttrOp.check(change)) {
      el.setAttribute(change.key, change.value)
    }
  }
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
      el.insertBefore(dom.fragment(change.insert.map(el => deltaToDom(/** @type {DomDelta} */ (el)))), child)
    } else if (delta.$modifyOp.check(change)) {
      applyDeltaToDom(dom.$element.cast(child), /** @type {DomDelta} */ (change.value))
    } else if (delta.$textOp.check(change)) {
      el.insertBefore(dom.text(change.insert), child)
    } else {
      error.unexpectedCase()
    }
  })
}

/* c8 ignore stop */

/**
 * Schema describing the deltas produced/consumed by a {@link DomRDT}: a recursive node with a string
 * name, string→string attributes, and text content.
 */
export const $domDelta = /* @__PURE__ */ delta.$delta({ name: s.$string, attrs: s.$record(s.$string, s.$string), children: s.$never, text: true, recursiveChildren: true })

/**
 * @typedef {delta.Delta<{ name: string, attrs: { [key:string]: string }, text: true, recursiveChildren: true }>} DomDelta
 */

/* c8 ignore start */

/**
 * Compute the delta describing a batch of DOM `MutationRecord`s relative to `observedNode`.
 *
 * Builds the deltas without recursion: first every changed parent is registered (and its ancestors
 * marked as having a modified child), then each changed node's child operations are emitted in document
 * order.
 *
 * @param {Element} observedNode
 * @param {MutationRecord[]} mutations
 * @param {any} origin assign this origin to the generated delta
 * @return {DomDelta}
 */
const _mutationsToDelta = (observedNode, mutations, origin) => {
  /**
   * @typedef {{ removedBefore: Map<Node?,number>, added: Set<Node>, modified: number, d: delta.DeltaBuilderAny }} ChangedNodeInfo
   */
  /**
   * @type {Map<Node,ChangedNodeInfo>}
   */
  const changedNodes = map.create()
  /**
   * @param {Node} node
   * @return {ChangedNodeInfo}
   */
  const getChangedNodeInfo = node => map.setIfUndefined(changedNodes, node, () => ({ removedBefore: map.create(), added: set.create(), modified: 0, d: delta.create(node.nodeName.toLowerCase()) }))
  const observedNodeInfo = getChangedNodeInfo(observedNode)
  mutations.forEach(mutation => {
    const target = /** @type {HTMLElement} */ (mutation.target)
    const parent = target.parentNode
    const attrName = /** @type {string} */ (mutation.attributeName)
    const newVal = target.getAttribute(attrName)
    const info = getChangedNodeInfo(target)
    const d = info.d
    // go up the tree and mark that a child has been modified
    for (let changedParent = parent; changedParent != null && getChangedNodeInfo(changedParent).modified++ > 1 && changedParent !== observedNode; changedParent = changedParent.parentNode) {
      // nop
    }
    switch (mutation.type) {
      case 'attributes': {
        if (newVal == null) {
          d.deleteAttr(attrName)
        } else {
          d.setAttr(attrName, newVal)
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
    const d = info.d
    if (numOfChildChanges > 0) {
      node.childNodes.forEach(nchild => {
        if (info.removedBefore.has(nchild)) { // can happen separately
          d.delete(/** @type {number} */ (info.removedBefore.get(nchild)))
        }
        if (info.added.has(nchild)) {
          d.insert(dom.$text.check(nchild) ? (nchild.textContent ?? '') : [domToDelta(nchild)])
        } else if (changedNodes.has(nchild)) {
          d.modify(getChangedNodeInfo(nchild).d)
        }
      })
      // remove items to the end, if necessary
      d.delete(info.removedBefore.get(null) ?? 0)
    }
    d.done()
  })
  observedNodeInfo.d.origin = origin
  return /** @type {DomDelta} */ (observedNodeInfo.d)
}

/**
 * An RDT backed by a live DOM subtree. DOM mutations observed via `MutationObserver` are emitted as
 * deltas; incoming deltas are applied back onto the DOM.
 *
 * @template {DomDelta} [D=DomDelta]
 * @implements {RDT<D>}
 * @extends {ObservableV2<{ delta: (delta: D) => void, destroy: (rdt: DomRDT<D>) => void }>}
 */
class DomRDT extends ObservableV2 {
  /**
   * @param {Element} observedNode
   */
  constructor (observedNode) {
    super()
    /**
     * @type {Schema<D>}
     */
    this.$schema = /** @type {any} */ ($domDelta)
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

  /**
   * @param {MutationRecord[]} mutations
   */
  _mutationHandler = mutations =>
    mutations.length > 0 && this._mux(() => {
      const d = /** @type {D} */ (_mutationsToDelta(this.observedNode, mutations, this))
      this.emit('delta', [d])
    })

  /**
   * @param {D} d
   */
  applyDelta (d) {
    if (d.origin !== this) {
      // @todo the retrieved changes must be transformed against the updated changes. need a proper
      // transaction system
      this._mutationHandler(this.observer.takeRecords())
      this._mux(() => {
        applyDeltaToDom(this.observedNode, d)
        const mutations = this.observer.takeRecords()
        const change = /** @type {D} */ (_mutationsToDelta(this.observedNode, mutations, d.origin))
        this.emit('delta', [change])
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
 * Create a {@link DomRDT} that observes and edits `dom`.
 *
 * @param {Element} dom
 */
export const domRDT = dom => new DomRDT(dom)

/* c8 ignore stop */
