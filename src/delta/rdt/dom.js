/* global MutationObserver */

/**
 * # DOM delta RDT
 *
 * {@link domRDT} creates an RDT (see `../rdt.js`) backed by a live DOM subtree. DOM mutations are
 * observed with a `MutationObserver`, turned into deltas (by diffing the new DOM state against the
 * last-known one) and emitted as `'delta'` events (with the RDT itself as their
 * {@link import('../rdt.js').RDT origin}); incoming deltas are applied back onto the DOM. This lets a
 * DOM subtree be bound to any other RDT.
 *
 * @module delta/rdt/dom
 */

import { ObservableV2 } from '../../observable.js'
import * as delta from '../delta.js'
import * as dom from '../../dom.js'
import * as error from '../../error.js'
import * as math from '../../math.js'
import * as s from '../../schema.js'

/**
 * @template T
 * @typedef {import('../../schema.js').Schema<T>} Schema
 */

/**
 * @template {delta.DeltaConf} Conf
 * @typedef {import('../rdt.js').RDT<Conf>} RDT
 */

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
  /* c8 ignore next */ // defensive: only element nodes are ever rendered/observed
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
  /* c8 ignore next */ // defensive: deltaToDom is only ever called on delta nodes
  error.unexpectedCase()
}

/**
 * Apply a {@link DomDelta} as an incremental change onto an existing DOM element, mutating it in place.
 *
 * The element's children are addressed in *content* coordinates: each element child is one position,
 * each character of a text node is one position. `childIndex` walks `el.childNodes`; `childOffset` is
 * the offset within the current text node. `child` is re-read on every loop step because the previous
 * step may have inserted, removed or split nodes.
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
    if (delta.$retainOp.check(change)) {
      let len = change.retain
      while (len > 0) {
        const child = el.childNodes[childIndex]
        /* c8 ignore next */ // defensive: a well-formed delta never advances past the children
        if (child == null) break
        if (dom.$text.check(child)) {
          const remaining = child.length - childOffset
          if (remaining <= len) {
            len -= remaining
            childOffset = 0
            childIndex++
          } else {
            childOffset += len
            len = 0
          }
        } else {
          childIndex++
          len--
        }
      }
    } else if (delta.$deleteOp.check(change)) {
      let len = change.length
      while (len > 0) {
        const child = el.childNodes[childIndex]
        /* c8 ignore next */ // defensive: a well-formed delta never deletes past the children
        if (child == null) break
        if (dom.$text.check(child)) {
          const childLen = child.length
          if (childOffset === 0 && childLen <= len) {
            child.remove()
            len -= childLen
          } else {
            const spliceLen = math.min(len, childLen - childOffset)
            child.deleteData(childOffset, spliceLen)
            len -= spliceLen
            if (child.length <= childOffset) {
              childOffset = 0
              childIndex++
            }
          }
        } else {
          child.remove()
          len--
        }
      }
    } else if (delta.$insertOp.check(change) || delta.$textOp.check(change)) {
      if (childOffset > 0) {
        dom.$text.cast(el.childNodes[childIndex]).splitText(childOffset)
        childIndex++
        childOffset = 0
      }
      const ref = el.childNodes[childIndex] ?? null
      if (delta.$textOp.check(change)) {
        el.insertBefore(dom.text(change.insert), ref)
        childIndex++
      } else {
        el.insertBefore(dom.fragment(change.insert.map(c => deltaToDom(/** @type {DomDelta} */ (c)))), ref)
        childIndex += change.insert.length
      }
    } else if (delta.$modifyOp.check(change)) {
      applyDeltaToDom(dom.$element.cast(el.childNodes[childIndex]), /** @type {DomDelta} */ (change.value))
      childIndex++
    /* c8 ignore next 3 */ // unreachable: $domDelta children are only retain/delete/insert/text/modify
    } else {
      error.unexpectedCase()
    }
  })
}

/**
 * Schema describing the deltas produced/consumed by a {@link DomRDT}: a recursive node with a string
 * name, string→string attributes, and text content.
 */
export const $domDelta = /* @__PURE__ */ delta.$delta({ name: s.$string, attrs: s.$record(s.$string, s.$string), children: s.$never, text: true, recursiveChildren: true })

/**
 * The {@link delta.DeltaConf} of the deltas a {@link DomRDT} produces/consumes (see {@link $domDelta}).
 *
 * @typedef {{ name: string, attrs: { [key:string]: string }, text: true, recursiveChildren: true }} DomConf
 */

/**
 * @typedef {delta.Delta<DomConf>} DomDelta
 */

/**
 * An RDT backed by a live DOM subtree. DOM mutations observed via `MutationObserver` are diffed
 * against the last-known state and emitted as deltas; incoming deltas are applied back onto the DOM.
 *
 * @implements {RDT<DomConf>}
 * @extends {ObservableV2<{ delta: (delta: delta.Delta<DomConf>, origin: any) => void, destroy: (rdt: DomRDT) => void }>}
 */
class DomRDT extends ObservableV2 {
  /**
   * @param {Element} observedNode
   */
  constructor (observedNode) {
    super()
    /**
     * @type {Schema<DomDelta>}
     */
    this.$delta = /** @type {any} */ ($domDelta)
    this.observedNode = observedNode
    /**
     * Last-known DOM state. The observe path diffs the live DOM against this to compute the change to
     * emit, then advances it; `applyDelta` re-syncs it after mutating the DOM.
     *
     * @type {DomDelta}
     */
    this._state = domToDelta(observedNode)
    this.observer = new MutationObserver(this._mutationHandler)
    this.observer.observe(observedNode, {
      subtree: true,
      childList: true,
      attributes: true,
      characterDataOldValue: true
    })
  }

  /**
   * Pull the local DOM changes accumulated since the last sync as a delta (by diffing the live DOM
   * against `_state`), advancing `_state` to the current DOM.
   *
   * @return {DomDelta}
   */
  _pull () {
    const next = domToDelta(this.observedNode)
    const change = delta.diff(this._state, next)
    this._state = next
    return change
  }

  /**
   * @param {MutationRecord[]} mutations
   */
  _mutationHandler = mutations => {
    if (mutations.length === 0) return
    const change = this._pull()
    // a locally-observed DOM edit: this RDT is the producer, so it is the origin (see {@link RDT})
    if (!change.isEmpty()) this.emit('delta', [change, this])
  }

  /**
   * Apply a foreign delta onto the DOM.
   *
   * The DOM may have been edited locally (`b`) since the last sync, concurrently with the incoming
   * change (`d`). We pull `b` first and rebase the two against each other (OT) so neither is lost:
   * `d` rebased onto `b` is applied to the DOM, and `b` rebased onto `d` is returned as the fix so the
   * binding pipes it back through the transformer to the other side.
   *
   * @param {delta.Delta<DomConf>} d
   * @param {any} [origin] who produced `d`; forwarded verbatim on the emitted `'delta'` event so
   * listeners can recognise (and skip) their own changes — see {@link RDT} “Origins”. Defaults to `null`
   * (an anonymous/local change).
   * @return {delta.DeltaBuilder<DomConf> | null} the rebased local change (`b`), or `null` when there
   * were no concurrent edits
   */
  applyDelta (d, origin = null) {
    const b = this._pull()
    /** @type {DomDelta} */
    let toApply = d
    /** @type {DomDelta?} */
    let fix = null
    if (!b.isEmpty()) {
      // clone both sides so neither original is mutated by the in-place `rebase`
      toApply = delta.clone(d).rebase(b, true) // d on top of the local DOM (which has b)
      const bOnD = delta.clone(b).rebase(d, false) // b on top of d, for the other side
      fix = bOnD.isEmpty() ? null : bOnD
    }
    applyDeltaToDom(this.observedNode, toApply)
    this._state = domToDelta(this.observedNode)
    // MutationObserver callbacks are async, so the Binding's (synchronous) mutex cannot suppress the
    // echo of our own write — draining the self-caused records here is what prevents it.
    this.observer.takeRecords()
    // Forward the effective change so a chained binding on the other side picks it up; the binding
    // that fed us `d` swallows this re-emit via its own mutex (see ../rdt.js). `fix` is a freshly
    // rebased builder at runtime, returned as the owned change the binding maps on.
    this.emit('delta', [toApply, origin])
    return /** @type {delta.DeltaBuilder<DomConf>?} */ (fix)
  }

  /**
   * The current state as a delta: an "insert everything" delta describing the observed subtree.
   *
   * @return {delta.Delta<DomConf>}
   */
  get delta () {
    return domToDelta(this.observedNode)
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
