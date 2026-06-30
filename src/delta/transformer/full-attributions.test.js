import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { fullAttributions } from './full-attributions.js'

/**
 * A retain that only adds a key re-emits the COMPLETE accumulated attribution for that position, not
 * just the increment — the defining behaviour (`insert('a',{insert:[]})` then `retain(1,{insertAt:4})`
 * ⇒ `retain(1,{insert:[],insertAt:4})`).
 */
export const testFullAttributionsAccumulate = () => {
  const $d = delta.$delta({ text: true })
  const it = fullAttributions($d).init()
  // a fresh insert already carries its full attribution ⇒ passes through unchanged
  t.compare(it.applyA(delta.create().insert('a', undefined, { insert: [] })).b, delta.create().insert('a', undefined, { insert: [] }))
  // the later retain only carries `insertAt`, but the output carries the accumulated `insert` too
  t.compare(it.applyA(delta.create().retain(1, undefined, { insertAt: 4 })).b, delta.create().retain(1, undefined, { insert: [], insertAt: 4 }))
}

/** A retain spanning positions with different accumulated attributions splits into per-run retains. */
export const testFullAttributionsSplit = () => {
  const $d = delta.$delta({ text: true })
  const it = fullAttributions($d).init()
  it.applyA(delta.create().insert('ab', undefined, { insert: ['alice'] }))
  it.applyA(delta.create().retain(2, undefined, { insert: ['alice'] }).insert('cd', undefined, { insert: ['bob'] }))
  // positions 0-1 are alice's, 2-3 are bob's; one retain over all four ⇒ two retains, each with its own full attr
  t.compare(it.applyA(delta.create().retain(4, undefined, { insertAt: 9 })).b, delta.create()
    .retain(2, undefined, { insert: ['alice'], insertAt: 9 })
    .retain(2, undefined, { insert: ['bob'], insertAt: 9 }))
}

/**
 * Clearing a key re-emits the remaining keys AND an explicit `{k:null}` for the cleared one ("set
 * present + clear removed"), so wholesale downstream consumers converge.
 */
export const testFullAttributionsClear = () => {
  const $d = delta.$delta({ text: true })
  const it = fullAttributions($d).init()
  it.applyA(delta.create().insert('x', undefined, { insert: ['a'], insertAt: 1 }))
  // a per-key `{insert:null}` removal isn't in the canonical `Attribution` type — cast it (test-any convention)
  t.compare(it.applyA(delta.create().retain(1, undefined, /** @type {any} */ ({ insert: null }))).b, delta.create()
    .retain(1, undefined, /** @type {any} */ ({ insert: null, insertAt: 1 })))
}

/** The nested `attribution.format` sub-key accumulates and clears one level deep (mirrors `mergeAttr`). */
export const testFullAttributionsNestedFormat = () => {
  const $d = delta.$delta({ text: true })
  const it = fullAttributions($d).init()
  it.applyA(delta.create().insert('a', undefined, { format: { bold: ['u1'] } }))
  t.compare(it.applyA(delta.create().retain(1, undefined, { format: { italic: ['u2'] } })).b, delta.create()
    .retain(1, undefined, { format: { bold: ['u1'], italic: ['u2'] } }))
  // clearing one inner key keeps the other and re-emits the removal
  t.compare(it.applyA(delta.create().retain(1, undefined, { format: { bold: /** @type {any} */ (null) } })).b, delta.create()
    .retain(1, undefined, { format: /** @type {any} */ ({ bold: null, italic: ['u2'] }) }))
}

/**
 * A scalar node attribute set via `setAttr` already carries its full attribution (a data op that
 * *replaces* the attr), so it passes through unchanged; a delta-valued attribute updated via
 * `modifyAttr` is an instruction whose attribution increment IS expanded against the accumulated value.
 */
export const testFullAttributionsNodeAttr = () => {
  const $p = delta.$delta('p', { attrs: { style: s.$string }, text: true })
  const $doc = delta.$delta({ name: s.$literal('doc'), children: $p })
  const it = fullAttributions($doc).init()
  it.applyA(delta.create().insert([delta.create('p').setAttr('style', 'x', { insert: ['a'] })]))
  // a later `setAttr` replaces wholesale ⇒ its own full attribution, NOT merged with the prior `insert:['a']`
  const set = /** @type {any} */ (it.applyA(delta.create().modify(delta.create().setAttr('style', 'y', { insert: ['b'], insertAt: 9 }))).b)
  t.compare(set.children.start.value.attrs.style.attribution, { insert: ['b'], insertAt: 9 })

  // a delta-valued attribute: `modifyAttr` carries only `insertAt`, but the output accumulates `insert:['a']`
  const $body = delta.$delta({ text: true })
  const $d2 = delta.$delta({ attrs: { body: $body } })
  const it2 = fullAttributions($d2).init()
  it2.applyA(delta.create($d2).setAttr('body', delta.create().insert('hi'), { insert: ['a'] }))
  const mod = /** @type {any} */ (it2.applyA(delta.create($d2).modifyAttr('body', delta.create().retain(2), { insertAt: 4 })).b)
  t.compare(mod.attrs.body.attribution, { insert: ['a'], insertAt: 4 })
}

/** A modify into a child node accumulates the child's inner content attribution, recursing in one pass. */
export const testFullAttributionsChildModify = () => {
  const $p = delta.$delta('p', { text: true })
  const $d = delta.$delta({ name: s.$literal('doc'), children: $p })
  const it = fullAttributions($d).init()
  it.applyA(delta.create().insert([delta.create('p').insert('hi', undefined, { insert: ['a'] })]))
  t.compare(it.applyA(delta.create().modify(delta.create().retain(2, undefined, { insertAt: 5 }))).b, delta.create()
    .modify(delta.create().retain(2, undefined, { insert: ['a'], insertAt: 5 })))
}

/** Inserts/deletes shift positions; the overlay realigns so a later attribution change lands correctly. */
export const testFullAttributionsRealign = () => {
  const $d = delta.$delta({ text: true })
  // insert at the front shifts existing positions
  const it = fullAttributions($d).init()
  it.applyA(delta.create().insert('xy', undefined, { insert: ['a'] }))
  it.applyA(delta.create().insert('Z', undefined, { insert: ['b'] }))
  t.compare(it.applyA(delta.create().retain(1).retain(2, undefined, { insertAt: 5 })).b, delta.create()
    .retain(1).retain(2, undefined, { insert: ['a'], insertAt: 5 }))
  // a delete removes positions
  const it2 = fullAttributions($d).init()
  it2.applyA(delta.create().insert('abc', undefined, { insert: ['a'] }))
  it2.applyA(delta.create().delete(1))
  t.compare(it2.applyA(delta.create().retain(2, undefined, { insertAt: 7 })).b, delta.create()
    .retain(2, undefined, { insert: ['a'], insertAt: 7 }))
}

/** Reverse is passthrough (the view never attributes) and only realigns the overlay for view edits. */
export const testFullAttributionsReverse = () => {
  const $d = delta.$delta({ text: true })
  const it = fullAttributions($d).init()
  it.applyA(delta.create().insert('hi', undefined, { insert: ['a'] }))
  // a view insert passes through unchanged on the A-side; B-side is null
  const rb = it.applyB(delta.create().insert('Z'))
  t.assert(rb.b === null)
  t.compare(rb.a, delta.create().insert('Z'))
  // the overlay realigned, so the next forward change over the shifted position still accumulates `insert:[a]`
  t.compare(it.applyA(delta.create().retain(1).retain(2, undefined, { insertAt: 3 })).b, delta.create()
    .retain(1).retain(2, undefined, { insert: ['a'], insertAt: 3 }))
}

/**
 * Fuzz: the full-attribution outputs, composed, reconstruct EXACTLY the same document (content + every
 * accumulated attribution) as the original incremental changes — the transform is attribution-preserving
 * under composition (it catches both lost and over-accumulated attribution). Structure is preserved.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatFullAttributionsAccumulate = tc => {
  const $leaf = delta.$delta({ name: ['span', 'em'], text: true, attrs: { c: s.$string }, formats: { italic: s.$boolean.optional } })
  const $d = delta.$delta({ name: ['div', 'p'], text: true, attrs: { a: s.$string, b: s.$number }, formats: { bold: s.$boolean.optional }, children: s.$union(s.$number, s.$string, $leaf) })
  const it = fullAttributions($d).init()
  // `applyA` mutates its input, so feed it mutable clones; the precise recursive schema doesn't unify
  // with random/transformed deltas — cast at the boundary (a known type-system gap)
  const fwd = /** @param {any} d @return {delta.DeltaAny} */ d => /** @type {any} */ (it.applyA(d).b)

  const start = delta.random(tc.prng, $d, { attribution: true }).done()
  const change = delta.random(tc.prng, $d, { source: start, attribution: true })

  // reference final document, accumulated from the original incremental changes
  const ref = /** @type {any} */ (delta.clone(start)).apply(delta.clone(change))

  // feed the same two changes through the transformer, then rebuild the document from the FULL outputs
  const outStart = fwd(delta.clone(start))
  const outChange = fwd(delta.clone(change))
  t.assert(outChange.childCnt === /** @type {any} */ (delta.clone(change)).childCnt) // structure-preserving (splits keep length)
  const got = /** @type {any} */ (delta.clone(outStart)).apply(delta.clone(outChange))

  t.assert(ref.equals(got))
}
