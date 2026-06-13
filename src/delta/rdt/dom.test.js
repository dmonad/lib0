import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as dt from '../transformer.js'
import * as env from '../../environment.js'
import * as dom from '../../dom.js'
import { bind } from '../binding.js'
import { deltaRDT } from './delta.js'
import { domRDT, $domDelta } from './dom.js'

// ---------------------------------------------------------------------------
// DomRDT (browser only)
//
// These need a real DOM + MutationObserver, so they `t.skip(!env.isBrowser)`
// and only run in the browser (`npm run debug`).
//
// NOTE: these tests are LLM-generated and need review.
// ---------------------------------------------------------------------------

/**
 * `dt.rename({})` is the identity transformer: it maps every change verbatim in
 * both directions, so a binding using it keeps both sides bit-for-bit equal.
 */
const identity = () => dt.rename(/** @type {const} */ ({}))

export const testDomRDTRoundTrip = () => {
  t.skip(!env.isBrowser)
  const el = dom.element('div')
  const dr = domRDT(el)
  const d = deltaRDT($domDelta)
  bind(d, dr, identity())
  // pushing a delta through the delta RDT renders it onto the DOM element
  d.applyDelta(delta.create('div', { id: '1' }, [delta.create('p', {}, 'text')]))
  t.compare(el.outerHTML, '<div id="1"><p>text</p></div>', 'delta rendered to DOM')
}

export const testDomBindingBackAndForth = () => {
  t.skip(!env.isBrowser)
  const $d = $domDelta
  const el1 = dom.element('div')
  const domRDT1 = domRDT(el1)
  const el2 = dom.element('div')
  const domRDT2 = domRDT(el2)
  const deltaRDT1 = deltaRDT($d)
  const deltaRDT2 = deltaRDT($d)
  // chain: el1 <-> deltaRDT1 <-> deltaRDT2 <-> el2, all wired with identity
  bind(deltaRDT1, domRDT1, identity())
  bind(domRDT1, deltaRDT2, identity())
  bind(deltaRDT2, domRDT2, identity())

  /**
   * @param {string} description
   * @param {() => void} f
   */
  const test = (description, f) =>
    t.group(description, () => {
      f()
      t.compare(el1.outerHTML, el2.outerHTML, 'dom nodes match')
      t.compare(deltaRDT1.state, deltaRDT2.state, 'generated deltas match')
    })
  test('insert paragraph', () => {
    deltaRDT1.applyDelta(delta.create('div', { id: '43' }, [delta.create('p', {}, 'text')]))
  })
}
