import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as dt from '../transformer.js'
import * as env from '../../environment.js'
import * as dom from '../../dom.js'
import * as promise from '../../promise.js'
import { bind } from '../rdt.js'
import { deltaRDT } from './delta.js'
import { domRDT, $domDelta } from './dom.js'

// ---------------------------------------------------------------------------
// DomRDT
//
// A live DOM subtree as an RDT: incoming deltas are applied to the DOM, and DOM mutations are
// observed (via MutationObserver) and emitted as deltas. These tests need a real DOM +
// MutationObserver, provided by a jsdom shim under Node (see `src/test-setup.js`) and by the
// browser itself in `npm run debug`; they skip everywhere else.
// ---------------------------------------------------------------------------

/**
 * `dt.renameAttrs($d, {})` is the identity transformer: it maps every change verbatim in both
 * directions, so a binding using it keeps both sides bit-for-bit equal. Returns a `TemplateFactory`
 * (a `$d => Template`) as expected by {@link bind}.
 */
const identity = () => (/** @type {import('../../schema.js').Schema<import('../delta.js').DeltaAny>} */ $d) => dt.renameAttrs($d, /** @type {const} */ ({}))

export const testDomRDTRoundTrip = () => {
  t.skip(!env.hasDom)
  const el = dom.element('div')
  const dr = domRDT(el)
  const d = deltaRDT($domDelta)
  bind(d, dr, identity())
  // pushing a delta through the delta RDT renders it onto the DOM element
  d.applyDelta(delta.create('div', { id: '1' }, [delta.create('p', {}, 'text')]))
  t.compare(el.outerHTML, '<div id="1"><p>text</p></div>', 'delta rendered to DOM')
}

/**
 * Drive incremental change deltas (set/delete attr, retain, delete, insert, modify, text edits)
 * through a binding so each is `applyDeltaToDom`-ed onto the DOM, and assert the resulting markup.
 * This deterministically exercises every branch of the apply path.
 */
export const testDomApplyOps = () => {
  t.skip(!env.hasDom)
  const el = dom.element('div')
  const dr = domRDT(el)
  const d = deltaRDT($domDelta)
  bind(d, dr, identity())

  /**
   * @param {delta.DeltaAny} change
   * @param {string} expected
   * @param {string} description
   */
  const step = (change, expected, description) => {
    d.applyDelta(change)
    t.compare(el.outerHTML, expected, description)
  }

  step(delta.create('div', { id: '1' }, [delta.create('p', {}, 'abcde'), delta.create('span', {}, 'z')]),
    '<div id="1"><p>abcde</p><span>z</span></div>', 'initial render')
  step(delta.create('div').setAttr('class', 'c').deleteAttr('id'),
    '<div class="c"><p>abcde</p><span>z</span></div>', 'set + delete attribute')
  // modify first child, delete from an offset to the end of the text node ("abcde" -> "ab")
  step(delta.create('div').modify(delta.create().retain(2).delete(3)),
    '<div class="c"><p>ab</p><span>z</span></div>', 'modify child: delete tail of text node')
  // retain first child, modify second child appending text ("z" -> "z!")
  step(delta.create('div').retain(1).modify(delta.create().retain(1).insert('!')),
    '<div class="c"><p>ab</p><span>z!</span></div>', 'retain element + modify text append')
  // modify first child, insert mid-text ("ab" -> "aXb") — exercises splitText
  step(delta.create('div').modify(delta.create().retain(1).insert('X')),
    '<div class="c"><p>aXb</p><span>z!</span></div>', 'modify child: mid-text insert (splitText)')
  // delete the first child element
  step(delta.create('div').delete(1),
    '<div class="c"><span>z!</span></div>', 'delete element child')
  // modify the (now first) child, deleting all of its text — full text-node delete
  step(delta.create('div').modify(delta.create().delete(2)),
    '<div class="c"><span></span></div>', 'modify child: full text delete')
  // retain the span and insert a fresh element child (with attributes + a nested element) after it
  step(delta.create('div').retain(1).insert([delta.create('ul', { id: 'L' }, [delta.create('li', {}, 'one')])]),
    '<div class="c"><span></span><ul id="L"><li>one</li></ul></div>', 'retain element + insert nested element')
}

/**
 * DOM edits flow the other way: mutate one DOM tree directly and the observer turns the mutation into
 * a delta that propagates through a chain `el1 <-> deltaRDT1 <-> deltaRDT2 <-> el2`, so `el2` ends up
 * identical to `el1`. This exercises the observe path (`MutationObserver` + `diff`) for every kind of
 * change, while the deterministic apply path is covered by {@link testDomApplyOps}.
 */
export const testDomBindingBackAndForth = async () => {
  t.skip(!env.hasDom)
  const el1 = dom.element('div')
  const domRDT1 = domRDT(el1)
  const el2 = dom.element('div')
  const domRDT2 = domRDT(el2)
  const deltaRDT1 = deltaRDT($domDelta)
  const deltaRDT2 = deltaRDT($domDelta)
  // chain: el1 <-> deltaRDT1 <-> deltaRDT2 <-> el2, all wired with identity
  bind(deltaRDT1, domRDT1, identity())
  bind(domRDT1, deltaRDT2, identity())
  bind(deltaRDT2, domRDT2, identity())

  /**
   * @param {string} description
   * @param {() => void} f
   */
  const test = async (description, f) =>
    t.groupAsync(description, async () => {
      f()
      await promise.resolve() // flush the (microtask-scheduled) MutationObserver callback
      t.compare(el1.outerHTML, el2.outerHTML, 'dom nodes match')
      t.compare(deltaRDT1.state, deltaRDT2.state, 'generated deltas match')
    })

  // data-driven render (synchronous): el1 <- deltaRDT1
  await test('insert paragraph', () => {
    deltaRDT1.applyDelta(delta.create('div', { id: '1' }, [delta.create('p', {}, 'ab')]))
  })
  // the rest are DOM edits on el1, observed and propagated to el2
  await test('edit text node (mid-string insert)', () => {
    dom.$text.cast(/** @type {Element} */ (el1.querySelector('p')).firstChild).textContent = 'aXb'
  })
  await test('set attribute', () => {
    el1.setAttribute('class', 'big')
  })
  await test('delete attribute', () => {
    el1.removeAttribute('class')
  })
  await test('append child element', () => {
    el1.appendChild(dom.element('span', [], [dom.text('hi')]))
  })
  await test('edit nested grandchild text', () => {
    dom.$text.cast(/** @type {Element} */ (el1.querySelector('span')).firstChild).textContent = 'yo'
  })
  await test('remove child element', () => {
    /** @type {Element} */ (el1.querySelector('p')).remove()
  })
  await test('replace element (name change)', () => {
    /** @type {Element} */ (el1.querySelector('span')).replaceWith(dom.element('h1', [], [dom.text('yo')]))
  })
}

/**
 * A local DOM edit that the observer hasn't delivered yet is concurrent with an incoming change from
 * the bound side. `applyDelta` must pull the local edit, rebase it against the incoming change (and
 * vice versa), apply the rebased incoming change to the DOM, and pipe the rebased local edit back to
 * the data side — so neither edit is lost and both sides converge.
 */
export const testDomConcurrentRebase = async () => {
  t.skip(!env.hasDom)
  const el = dom.element('div')
  const dr = domRDT(el)
  const d = deltaRDT($domDelta)
  bind(d, dr, identity())
  d.applyDelta(delta.create('div', {}, [delta.create('p', {}, 'x')])) // initial: <div><p>x</p></div>
  // a local DOM edit (add an attribute) whose MutationObserver callback has NOT fired yet ...
  el.setAttribute('data-local', '1')
  // ... and, synchronously (so the edit above is still pending), a remote change through the binding
  d.applyDelta(delta.create('div').modify(delta.create().retain(1).insert('y'))) // edit the text "x" -> "xy"
  await promise.resolve() // settle the observer (it finds nothing new — the edit was already pulled)
  t.compare(el.outerHTML, '<div data-local="1"><p>xy</p></div>', 'DOM has both concurrent edits')
  t.compare(d.state, delta.create('div', { 'data-local': '1' }, [delta.create('p', {}, 'xy')]),
    'data side received the rebased local edit')
}

export const testDomRDTDestroy = () => {
  t.skip(!env.hasDom)
  const el = dom.element('div')
  const dr = domRDT(el)
  let destroyed = null
  dr.on('destroy', r => { destroyed = r })
  dr.destroy()
  t.assert(destroyed === dr, "'destroy' event fired with the RDT")
  // after destroy the observer is disconnected: a DOM mutation no longer produces a 'delta'
  let changed = false
  dr.on('delta', () => { changed = true })
  el.setAttribute('id', 'x')
  t.assert(!changed, 'no delta after destroy')
}

/**
 * A change the RDT observes locally (a DOM edit picked up by the `MutationObserver`) is produced by the
 * RDT itself, so it emits its `'delta'` with the RDT as the origin (see the "Origins" section of the
 * `RDT` typedef). A consumer uses this to recognise edits that originated on this side.
 */
export const testDomLocalEditOrigin = async () => {
  t.skip(!env.hasDom)
  const el = dom.element('div')
  const dr = domRDT(el)
  /** @type {Array<any>} */
  const origins = []
  dr.on('delta', (_d, origin) => origins.push(origin))
  el.setAttribute('id', 'x') // a local DOM edit
  await promise.resolve() // flush the (microtask-scheduled) MutationObserver callback
  t.assert(origins.length === 1 && origins[0] === dr, 'a locally-observed DOM edit uses the DomRDT itself as origin')
}

/**
 * A deep edit re-reads only the changed path: every unchanged sibling subtree is reused by reference
 * (its `_nodes` mirror entry is untouched), so the emitted delta is a single minimal modify-path — the
 * core of the incremental reconcile.
 */
export const testDomDeepEditReusesSiblings = async () => {
  t.skip(!env.hasDom)
  const el = dom.element('div', [], [
    dom.element('ul', [], [
      dom.element('li', [], [dom.text('a')]),
      dom.element('li', [], [dom.text('b')])
    ]),
    dom.element('section', [], [dom.text('keep')])
  ])
  const dr = domRDT(el)
  const section = /** @type {Element} */ (el.querySelector('section'))
  const firstLi = el.querySelectorAll('li')[0]
  const sectionMirror = dr._nodes.get(section)
  const firstLiMirror = dr._nodes.get(firstLi)
  /** @type {Array<any>} */
  const changes = []
  dr.on('delta', d => changes.push(d))
  // edit only the second <li>'s text: 'b' -> 'bX'
  dom.$text.cast(/** @type {Element} */ (el.querySelectorAll('li')[1]).firstChild).textContent = 'bX'
  await promise.resolve()
  t.assert(changes.length === 1, 'exactly one delta emitted')
  // the untouched subtrees are reused by reference (never re-read into a fresh mirror node)
  t.assert(dr._nodes.get(section) === sectionMirror, '<section> mirror reused by reference')
  t.assert(dr._nodes.get(firstLi) === firstLiMirror, 'first <li> mirror reused by reference')
  // and the live mirror reflects the deep edit
  t.compare(dr.delta, delta.create('div', {}, [
    delta.create('ul', {}, [delta.create('li', {}, 'a'), delta.create('li', {}, 'bX')]),
    delta.create('section', {}, 'keep')
  ]), 'mirror reflects the deep edit')
}

/**
 * Moving a subtree to a new parent (one childList record on each parent) converges on the other side;
 * the moved subtree is reused by identity, so its inner content survives the delete+insert unchanged.
 */
export const testDomMovedSubtreeConverges = async () => {
  t.skip(!env.hasDom)
  const el1 = dom.element('div', [], [
    dom.element('a', [], [dom.element('b', [], [dom.text('x')])]),
    dom.element('c', [], [])
  ])
  const domRDT1 = domRDT(el1)
  const el2 = dom.element('div')
  const domRDT2 = domRDT(el2)
  // domRDT1 is the source of truth: its state is projected onto el2 at bind time
  bind(domRDT1, domRDT2, identity())
  t.compare(el2.outerHTML, el1.outerHTML, 'el2 mirrors el1 initially')
  // move <b> from <a> into <c>
  const b = /** @type {Element} */ (el1.querySelector('b'))
  ;/** @type {Element} */ (el1.querySelector('c')).appendChild(b)
  await promise.resolve()
  t.compare(el1.outerHTML, '<div><a></a><c><b>x</b></c></div>', 'el1 reflects the move')
  t.compare(el2.outerHTML, el1.outerHTML, 'el2 converged after the move')
}

/**
 * A node appended and removed again within one synchronous block is a net no-op: reconcile reads the
 * current (restored) child list, the diff is empty, and nothing is emitted.
 */
export const testDomBatchedAddRemoveNoDelta = async () => {
  t.skip(!env.hasDom)
  const el = dom.element('div', [], [dom.element('p', [], [dom.text('x')])])
  const dr = domRDT(el)
  let count = 0
  dr.on('delta', () => { count++ })
  const span = dom.element('span', [], [dom.text('hi')])
  el.appendChild(span) // add ...
  el.removeChild(span) // ... then remove, in the same batch
  await promise.resolve()
  t.assert(count === 0, 'a net add+remove in one batch emits no delta')
  t.compare(el.outerHTML, '<div><p>x</p></div>', 'DOM is unchanged')
}

/**
 * A concurrent rebase with edits DEEP in the tree: a pending local text edit on one child while an
 * incoming change edits a sibling child. Both must land and both sides converge.
 */
export const testDomConcurrentDeepRebase = async () => {
  t.skip(!env.hasDom)
  const el = dom.element('div')
  const dr = domRDT(el)
  const d = deltaRDT($domDelta)
  bind(d, dr, identity())
  // initial: <div><p>x</p><span>y</span></div>
  d.applyDelta(delta.create('div', {}, [delta.create('p', {}, 'x'), delta.create('span', {}, 'y')]))
  // a local DOM edit deep in the tree whose MutationObserver callback has NOT fired: <p> 'x' -> 'xL'
  dom.$text.cast(/** @type {Element} */ (el.querySelector('p')).firstChild).textContent = 'xL'
  // ... concurrently (edit still pending), a remote change to the SIBLING <span>: 'y' -> 'yR'
  d.applyDelta(delta.create('div').retain(1).modify(delta.create().retain(1).insert('R')))
  await promise.resolve()
  t.compare(el.outerHTML, '<div><p>xL</p><span>yR</span></div>', 'both concurrent deep edits landed on the DOM')
  t.compare(d.state, delta.create('div', {}, [delta.create('p', {}, 'xL'), delta.create('span', {}, 'yR')]),
    'data side received both edits')
}

/**
 * Splitting a text node (two adjacent Text nodes with the same combined content) reconciles to
 * identical, coalesced text — a no-op that emits no delta.
 */
export const testDomTextSplitNormalized = async () => {
  t.skip(!env.hasDom)
  const el = dom.element('div', [], [dom.text('abcdef')])
  const dr = domRDT(el)
  let count = 0
  dr.on('delta', () => { count++ })
  dom.$text.cast(el.firstChild).splitText(3) // 'abc' | 'def'
  await promise.resolve()
  t.assert(count === 0, 'splitText produces no net content change, so no delta')
  t.compare(dr.delta, delta.create('div').insert('abcdef'), 'mirror text is unchanged (adjacent text coalesced)')
}

/**
 * A delta previously returned by `get delta` is an immutable snapshot: reconcile only ever swaps the
 * whole `_state` root and never mutates existing mirror nodes, so a later edit leaves the snapshot intact.
 */
export const testDomDeltaSnapshotStable = async () => {
  t.skip(!env.hasDom)
  const el = dom.element('div', [], [dom.element('p', [], [dom.text('x')])])
  const dr = domRDT(el)
  const snap = dr.delta
  const before = delta.create('div', {}, [delta.create('p', {}, 'x')])
  t.compare(snap, before, 'snapshot matches the initial document')
  dom.$text.cast(/** @type {Element} */ (el.querySelector('p')).firstChild).textContent = 'xy'
  await promise.resolve()
  t.compare(snap, before, 'the previously-returned snapshot is unchanged by a later reconcile')
  t.compare(dr.delta, delta.create('div', {}, [delta.create('p', {}, 'xy')]), 'the live mirror reflects the edit')
}
