/* global MutationObserver */
import { ObservableV2 } from '../observable.js'
import * as delta from './index.js'
import * as dt from './transformer.js' // eslint-disable-line
import * as dom from '../dom.js'
import * as set from '../set.js'
import * as map from '../map.js'
import * as error from '../error.js'
import * as math from '../math.js'

/**
 * @template {delta.AbstractDelta} A
 * @template {delta.AbstractDelta} B
 * @param {Binding<A,B>} binding
 * @param {dt.TransformResult<A?,B?>} result
 */
const _emitBindingResult = (binding, result) => {
  result.a && binding.emit('a', [result.a, binding])
  result.b && binding.emit('b', [result.b, binding])
  return result
}

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {delta.AbstractDelta} DeltaB
 * @template [State=any]
 * @extends ObservableV2<{ 'a': (deltaA: DeltaA, binding: Binding<DeltaA,DeltaB,State>) => void, 'b': (deltaB: DeltaB, binding: Binding<DeltaA,DeltaB,State>) => void }>
 */
export class Binding extends ObservableV2 {
  /**
   * @param {dt.Template<any,DeltaA,DeltaB>} template
   * @param {State} state
   */
  constructor (template, state) {
    super()
    /**
     * @type {dt.Transformer<any,DeltaA,DeltaB>}
     */
    this.t = template.init()
    this.state = state
  }

  /**
   * @param {DeltaA} deltaA
   * @return {dt.TransformResult<DeltaA?,DeltaB?>}
   */
  applyA = (deltaA) => {
    return _emitBindingResult(this, this.t.applyA(deltaA))
  }

  /**
   * @param {DeltaB} deltaB
   * @return {dt.TransformResult<DeltaA?,DeltaB?>}
   */
  applyB = (deltaB) => {
    return _emitBindingResult(this, this.t.applyB(deltaB))
  }
}

/**
 * @template {delta.AbstractDelta} Delta
 * @typedef {ObservableV2<{ 'change': (delta: Delta) => void }> & { update: (delta: Delta) => any }} DeltaEmitter
 */

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {delta.AbstractDelta} DeltaB
 * @template {any} [State=any]
 * @param {object} opts
 * @param {dt.Template<any,DeltaA,DeltaB>} opts.template
 * @param {State?} [opts.state]
 * @param {((deltaA: NoInfer<DeltaA>,binding:Binding<DeltaA,DeltaB,State>)=>void) | null | DeltaEmitter<NoInfer<DeltaA>>} [opts.a]
 * @param {((deltaB: NoInfer<DeltaB>,binding:Binding<DeltaA,DeltaB,State>)=>void) | null | DeltaEmitter<NoInfer<DeltaB>>} [opts.b]
 */
export const bind = ({ template, state = null, a = null, b = null }) => {
  const binding = /** @type {Binding<DeltaA,DeltaB,State>} */ (new Binding(template, state))
  a != null && binding.on('a', a instanceof ObservableV2 ? a.update : a)
  b != null && binding.on('b', b instanceof ObservableV2 ? b.update : b)
  return binding
}

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
 * @param {delta.Node} d
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
      }
    })
    return n
  }
  error.unexpectedCase()
}

/**
 * @param {Element} el
 * @param {delta.Node<string,any,any,"done">} d
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
    let child = el.childNodes[childIndex]
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
      el.insertBefore(dom.fragment(change.insert.map(deltaToDom)), child.nextSibling)
    } else if (delta.$modifyOp.check(change)) {
      applyDeltaToDom(dom.$element.cast(child), change.modify)
    }
    error.unexpectedCase()
  })
}

/**
 * @implements DeltaEmitter<delta.Node<string,any,any,"done">>
 * @extends {ObservableV2<{ change: (delta: delta.AbstractDelta) => void }>}
 */
class DomEventEmitter extends ObservableV2 {
  /**
   * @param {Element} observedNode
   */
  constructor (observedNode) {
    super()
    this.observedNode = observedNode
    this.observer = new MutationObserver(/** @param {MutationRecord[]} mutations */ mutations => {
      /**
       * @typedef {{ removedBefore: Map<Node?,number>, added: Set<Node>, modified: number, d: delta.Node<any, any,any> | delta.Text }} ChangedNodeInfo
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
      const getChangedNodeInfo = node => map.setIfUndefined(changedNodes, node, () => ({ removedBefore: map.create(), added: set.create(), modified: 0, d: delta.node(node.nodeName) }))
      const observedNodeInfo = getChangedNodeInfo(observedNode)
      mutations.forEach(mutation => {
        const target = /** @type {HTMLElement} */ (mutation.target)
        const parent = target.parentNode
        const attrName = /** @type {string} */ (mutation.attributeName)
        const newVal = target.getAttribute(attrName)
        const info = getChangedNodeInfo(target)
        const d = info.d
        d.origin = this
        // go up the tree and mark that a child has been modified
        for (let changedParent = parent; changedParent != null && getChangedNodeInfo(changedParent).modified++ > 1 && changedParent !== observedNode; changedParent = changedParent.parentNode) {
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
    this.observer.observe(observedNode, {
      subtree: true,
      childList: true,
      attributes: true,
      characterDataOldValue: true
    })
  }

  /**
   * @param {delta.Node<string,any,any,"done">} delta
   */
  update = delta => {
    if (delta.origin != this) applyDeltaToDom(this.observedNode, delta)
  }

  destroy () {
    this.observer.disconnect()
  }
}

/**
 * @param {Element} dom
 */
export const domEventEmitter = dom => new DomEventEmitter(dom)
