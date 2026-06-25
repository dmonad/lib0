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
