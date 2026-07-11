/* global MutationObserver */

/**
 * # DOM delta RDT
 *
 * {@link domRDT} creates an RDT (see `../rdt.js`) backed by a live DOM subtree. A `MutationObserver`
 * reports which nodes changed; the mirror ({@link DomRDT#_state}) is reconciled *incrementally* — only
 * the changed paths are re-read from the DOM, every unchanged subtree is reused by reference (via the
 * {@link DomRDT#_nodes} `WeakMap`), and the rebuilt tree is diffed against the previous mirror to emit a
 * minimal `'delta'` (with the RDT itself as its {@link import('../rdt.js').RDT origin}). Incoming deltas
 * are applied back onto the DOM. This lets a DOM subtree be bound to any other RDT.
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
 * A shared, never-mutated empty `onPath` set for the initial full read (see {@link reconcile}), where an
 * empty `_nodes` map means nothing is reused anyway.
 *
 * @type {Set<Node>}
 */
const EMPTY_ON_PATH = new Set()

/**
 * Render a {@link DomDelta} into a fresh DOM element (the inverse of {@link reconcile}).
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

// The mirror is maintained by these module-private functions (kept as functions, not methods, per the
// lib0 style guide — methods are reserved for the duck-typed RDT interface: `applyDelta`/`delta`/
// `destroy`). Each takes the {@link DomRDT} whose `_state`/`_nodes`/`observedNode` it reads or advances.

/**
 * Reconcile `node` against the DOM, reusing subtrees by reference. When `node` is not on the dirty
 * `onPath` and is already mapped in `rdt._nodes`, its existing mirror subtree is returned unread;
 * otherwise the node's shell (name + attributes + child list) is rebuilt — text children become an
 * `insert` of their content (adjacent text coalesces, normalising `splitText`), element children recurse
 * — and re-registered in `rdt._nodes`. Purely constructive: it never mutates an existing mirror node,
 * only allocates fresh shells and shares unchanged subtrees.
 *
 * @param {DomRDT} rdt
 * @param {Node} node
 * @param {Set<Node>} onPath dirty elements ∪ their ancestors up to the observed root
 * @return {DomDelta}
 */
const reconcile = (rdt, node, onPath) => {
  if (!onPath.has(node) && rdt._nodes.has(node)) {
    return /** @type {DomDelta} */ (rdt._nodes.get(node))
  }
  if (dom.$element.check(node)) {
    const d = delta.create(node.nodeName.toLowerCase())
    for (let i = 0; i < node.attributes.length; i++) {
      const attr = /** @type {Attr} */ (node.attributes.item(i))
      d.setAttr(attr.nodeName, attr.value)
    }
    node.childNodes.forEach(child => {
      d.insert(dom.$text.check(child) ? (child.textContent ?? '') : [reconcile(rdt, child, onPath)])
    })
    rdt._nodes.set(node, /** @type {DomDelta} */ (d))
    return /** @type {DomDelta} */ (d)
  }
  /* c8 ignore next */ // defensive: only element nodes are ever rendered/observed
  error.unexpectedCase()
}

/**
 * The set of elements whose OWN content (attributes, character data, or child list) a mutation batch
 * changed: a `characterData` record dirties the text node's parent, every other record its target.
 * Targets no longer under the observed root (removed in this same batch) are dropped — their removal is
 * captured by a surviving ancestor's `childList` record.
 *
 * @param {DomRDT} rdt
 * @param {MutationRecord[]} records
 * @return {Set<Element>}
 */
const dirtyElements = (rdt, records) => {
  /** @type {Set<Element>} */
  const dirty = new Set()
  for (const r of records) {
    const el = r.type === 'characterData' ? r.target.parentNode : r.target
    // `contains` is reflexive, so it admits the observed root itself and drops disconnected targets
    if (el != null && dom.$element.check(el) && rdt.observedNode.contains(el)) {
      dirty.add(el)
    }
  }
  return dirty
}

/**
 * The dirty elements together with all their ancestors up to (and including) the observed root — the
 * nodes whose shells {@link reconcile} must rebuild (everything off this path is reused).
 *
 * @param {DomRDT} rdt
 * @param {Set<Element>} dirty
 * @return {Set<Node>}
 */
const computeOnPath = (rdt, dirty) => {
  /** @type {Set<Node>} */
  const onPath = new Set()
  for (const el of dirty) {
    /** @type {Node?} */
    let p = el
    while (p != null && !onPath.has(p)) {
      onPath.add(p)
      if (p === rdt.observedNode) break
      p = p.parentNode
    }
  }
  return onPath
}

/**
 * Reconcile the mirror against the DOM described by `records`, returning the freshly-rebuilt root — or
 * `null` when nothing relevant changed (in which case no `rdt._nodes` entries were touched, so the
 * caller may safely leave `rdt._state` as-is).
 *
 * @param {DomRDT} rdt
 * @param {MutationRecord[]} records
 * @return {DomDelta?}
 */
const reconcileFromRecords = (rdt, records) => {
  const dirty = dirtyElements(rdt, records)
  if (dirty.size === 0) return null
  return reconcile(rdt, rdt.observedNode, computeOnPath(rdt, dirty))
}

/**
 * Reconcile against the DOM described by `records` and return the change to emit (the diff of the
 * previous mirror against the rebuilt one), advancing `rdt._state`. Returns an empty delta when nothing
 * relevant changed.
 *
 * @param {DomRDT} rdt
 * @param {MutationRecord[]} records
 * @return {DomDelta}
 */
const pull = (rdt, records) => {
  const fresh = reconcileFromRecords(rdt, records)
  if (fresh == null) return /** @type {DomDelta} */ (delta.create())
  // `clone: true` is REQUIRED here (not merely an optimisation as on a throwaway diff): `fresh` becomes
  // the persistent `_state`, so the emitted change must share none of its subtrees — a consumer that
  // freezes/mutates a shared child would otherwise corrupt the live mirror.
  const change = /** @type {DomDelta} */ (delta.diff(rdt._state, fresh, { clone: true }))
  // MUST commit: `reconcile` already re-pointed `rdt._nodes` at the rebuilt shells, so keeping the old
  // `_state` would desync it. (Skipping is safe only when nothing was reconciled — the `fresh == null`
  // short-circuit above.)
  rdt._state = fresh
  return change
}

/**
 * The `MutationObserver` callback: reconcile the batch and, if it produced a change, emit it with the
 * RDT itself as origin (a locally-observed DOM edit is produced by this RDT — see {@link RDT}).
 *
 * @param {DomRDT} rdt
 * @param {MutationRecord[]} mutations
 */
const mutationHandler = (rdt, mutations) => {
  const change = pull(rdt, mutations)
  if (!change.isEmpty()) rdt.emit('delta', [change, rdt])
}

/**
 * An RDT backed by a live DOM subtree. DOM mutations observed via `MutationObserver` reconcile the
 * mirror incrementally (re-reading only changed paths, reusing unchanged subtrees by reference) and the
 * resulting minimal diff is emitted as a delta; incoming deltas are applied back onto the DOM.
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
     * Maps each observed DOM node to its mirror delta node in {@link DomRDT#_state}. A {@link reconcile}
     * reuses an unchanged subtree by reference (skipping its DOM read) via this map; entries for removed
     * nodes are reclaimed automatically.
     *
     * @type {WeakMap<Node, DomDelta>}
     */
    this._nodes = new WeakMap()
    /**
     * The live delta mirror of the observed subtree, maintained incrementally. A reconcile rebuilds only
     * the changed paths and swaps this whole root (see {@link pull}); it is never mutated in place, so a
     * mirror handed out by {@link DomRDT#delta} stays a valid immutable snapshot.
     *
     * @type {DomDelta}
     */
    this._state = reconcile(this, observedNode, EMPTY_ON_PATH)
    this.observer = new MutationObserver(mutations => mutationHandler(this, mutations))
    this.observer.observe(observedNode, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true
    })
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
   * were no concurrent edits. A binding maps a returned fix back onto the other side with the
   * `correction` origin (see `../rdt.js`)
   */
  applyDelta (d, origin = null) {
    // Drain + diff any pending local edits (their async MutationObserver callback may not have fired).
    const b = pull(this, this.observer.takeRecords())
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
    // Re-sync `_state` from the DOM our own write produced, reconciling from its self-caused records
    // (taken here — MutationObserver callbacks are async, so the Binding's synchronous mutex cannot
    // suppress this echo; draining the records is what prevents it). We reconcile rather than
    // `_state.apply(toApply)` because apply's copy-on-write would re-clone nodes out of `_nodes`, and
    // its inserted nodes carry no mapping — the DOM (incl. its text coalescing) is the authority.
    const fresh = reconcileFromRecords(this, this.observer.takeRecords())
    if (fresh != null) this._state = fresh
    // Forward the effective change so a chained binding on the other side picks it up; the binding
    // that fed us `d` swallows this re-emit via its own mutex (see ../rdt.js). `fix` is a freshly
    // rebased builder at runtime, returned as the owned change the binding maps on.
    this.emit('delta', [toApply, origin])
    return /** @type {delta.DeltaBuilder<DomConf>?} */ (fix)
  }

  /**
   * The current state as a delta: the live mirror ({@link DomRDT#_state}), an "insert everything" delta
   * describing the observed subtree. A shared read snapshot — consumers clone before mutating (see
   * {@link RDT}); the mirror is never mutated in place, so a returned snapshot stays valid.
   *
   * @return {delta.Delta<DomConf>}
   */
  get delta () {
    return this._state
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
