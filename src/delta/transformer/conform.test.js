import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as position from '../position.js'
import * as s from '../../schema.js'
import { transformerWith } from '../transformer.js'
import { conform } from './conform.js'

/**
 * @param {delta.DeltaBuilderAny?} a
 * @param {delta.DeltaBuilderAny?} b
 */
const cmp = (a, b) => t.compare(a, b)

/**
 * @param {any} d
 */
const mp = d => position.marksToPositions(d)

export const testConformBasics = () => {
  const $d3 = delta.$delta({ children: 42, attrs: { a: s.$string } })
  t.assert(conform($d3, delta.$delta({ attrs: { a: s.$string } })).name === 'lib0:conform')
  // schema-first: conform($in, $schema) — the output type is the target schema (conform guarantees it)
  const i3 = conform($d3, delta.$delta({ attrs: { a: [s.$number, s.$string] } })).init()
  t.assert(transformerWith($d3, delta.$delta({ attrs: { a: [s.$number, s.$string] } })).validate(i3))
  // template form builds a fresh transformer per init
  const i3b = conform($d3, delta.$delta({ attrs: { a: [s.$number, s.$string] } })).init()
  t.assert(transformerWith($d3, delta.$delta({ attrs: { a: [s.$number, s.$string] } })).validate(i3b))
}

export const testConformDropsUnknownAttr = () => {
  // only attr `a` is in the schema; `b` is unknown and must be dropped from the output
  const it = conform(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  const resA = it.applyA(delta.create().setAttr('a', 'x').setAttr('b', 'y'))
  t.assert(resA.a === null)
  cmp(resA.b, delta.create().setAttr('a', 'x')) // `b` is gone, not merely "present"
}

export const testConformApplyB = () => {
  // applyB (B -> A): a conformant B-side change passes straight through to A (nothing on B); any op that
  // would break conformance throws.
  const it = conform(delta.$delta({ attrs: { a: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  const r = it.applyB(delta.create().setAttr('a', 'z'))
  cmp(r.a, delta.create().setAttr('a', 'z')) // donated to A verbatim
  t.assert(r.b === null) // nothing on B
  cmp(it.applyB(delta.create().deleteAttr('a')).a, delta.create().deleteAttr('a')) // removal always conforms
  t.fails(() => it.applyB(/** @type {any} */ (delta.create().setAttr('b', 'z')))) // unknown attribute key
  t.fails(() => it.applyB(/** @type {any} */ (delta.create().setAttr('a', 5)))) // known key, wrong value type
  t.fails(() => it.applyB(/** @type {any} */ (delta.create().modifyAttr('a', delta.create().insert('x'))))) // scalar attr: nothing to modify

  // text + a named delta child are allowed; structural ops and a matching child pass; a foreign child throws
  const $p = delta.$delta('p', {})
  const it2 = conform(delta.$deltaAny, delta.$delta({ text: true, children: $p })).init()
  cmp(it2.applyB(delta.create().insert('hi')).a, delta.create().insert('hi')) // text allowed
  cmp(it2.applyB(delta.create().retain(2).delete(1)).a, delta.create().retain(2).delete(1)) // structural
  cmp(it2.applyB(delta.create().insert([delta.create('p')])).a, delta.create().insert([delta.create('p')])) // matching child
  cmp(it2.applyB(/** @type {any} */ (delta.create().modify(delta.create().setAttr('q', 1)))).a, delta.create().modify(delta.create().setAttr('q', 1))) // modify ok: schema has a delta child (nested change is arbitrary - shallow)
  t.fails(() => it2.applyB(/** @type {any} */ (delta.create().insert([delta.create('nope')])))) // foreign child name
  t.fails(() => it2.applyB(/** @type {any} */ (delta.create().insert([99])))) // foreign scalar child

  // no text, scalar-only children: a text op and a modify both throw; a matching scalar passes
  const it3 = conform(delta.$deltaAny, delta.$delta({ children: s.$literal(1, 2, 3) })).init()
  t.fails(() => it3.applyB(/** @type {any} */ (delta.create().insert('x')))) // text not allowed
  t.fails(() => it3.applyB(/** @type {any} */ (delta.create().modify(delta.create().setAttr('q', 1))))) // no delta child to modify
  cmp(it3.applyB(/** @type {any} */ (delta.create().insert([2]))).a, delta.create().insert([2])) // matching scalar (literal narrows)

  // loose attrs ($any) accept any key/value verbatim
  const it4 = conform(delta.$deltaAny, delta.$delta({ attrs: s.$any })).init()
  cmp(it4.applyB(delta.create().setAttr('whatever', 123)).a, delta.create().setAttr('whatever', 123))

  // a delta-valued attribute: setAttr of a matching value and modifyAttr both pass (modify is shallow)
  const it5 = conform(delta.$deltaAny, delta.$delta({ attrs: { meta: delta.$delta('m', {}) } })).init()
  cmp(it5.applyB(delta.create().setAttr('meta', delta.create('m'))).a, delta.create().setAttr('meta', delta.create('m')))
  cmp(it5.applyB(/** @type {any} */ (delta.create().modifyAttr('meta', delta.create().setAttr('q', 1)))).a, delta.create().modifyAttr('meta', delta.create().setAttr('q', 1)))

  // $deltaAny target is the identity: applyB returns its very input on A, never throws
  const it6 = conform(delta.$delta({ text: true }), delta.$deltaAny).init()
  const d = delta.create().insert('hi')
  const r6 = it6.applyB(d)
  t.assert(r6.a === d) // same object - zero overhead
  t.assert(r6.b === null)
}

export const testConformDropsInvalidValue = () => {
  // `a` is a known key but the schema requires a string; a number value fails validation and is dropped
  const it = conform(delta.$delta({ attrs: { a: [s.$number, s.$string] } }), delta.$delta({ attrs: { a: s.$string } })).init()
  cmp(it.applyA(delta.create().setAttr('a', 'ok')).b, delta.create().setAttr('a', 'ok'))
  cmp(it.applyA(delta.create().setAttr('a', 42)).b, delta.create())
}

export const testConformDropsUnknownDeleteAndModify = () => {
  // deleteAttr / modifyAttr of an unknown key are dropped; of a known delta-valued key are kept and
  // recursively conformed (modifyAttr lazily builds the nested conform when no setAttr was seen first)
  const it = conform(
    delta.$delta({ attrs: { a: delta.$delta({ attrs: { x: s.$number } }), b: delta.$delta({ attrs: { y: s.$number } }) } }),
    delta.$delta({ attrs: { a: delta.$delta({ attrs: { x: s.$number } }) } })
  ).init()
  cmp(it.applyA(delta.create().deleteAttr('b')).b, delta.create())
  cmp(it.applyA(delta.create().deleteAttr('a')).b, delta.create().deleteAttr('a'))
  cmp(it.applyA(delta.create().modifyAttr('a', delta.create().setAttr('x', 1))).b, delta.create().modifyAttr('a', delta.create().setAttr('x', 1)))
  // second modify on `a` reuses the cached nested conform; the inner change is conformed (extra key `z`
  // is invalid input -> cast, and the conform drops it)
  cmp(it.applyA(/** @type {any} */ (delta.create().modifyAttr('a', delta.create().setAttr('x', 2).setAttr('z', 9)))).b, delta.create().modifyAttr('a', delta.create().setAttr('x', 2)))
  cmp(it.applyA(delta.create().modifyAttr('b', delta.create().setAttr('y', 2))).b, delta.create())
}

export const testConformAttrModifyScalarDropped = () => {
  // modifyAttr on a known *scalar* attribute has no sub-document to descend into -> dropped
  const it = conform(delta.$delta({ attrs: { a: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  cmp(it.applyA(/** @type {any} */ (delta.create().modifyAttr('a', delta.create().insert('x')))).b, delta.create())
}

export const testConformRecursesDeltaAttr = () => {
  // a delta-valued attribute is recursively conformed: the inner `label` (absent from the target) is dropped
  const $inner = delta.$delta('m', { attrs: { v: s.$number, label: s.$string } })
  const $innerC = delta.$delta('m', { attrs: { v: s.$number } })
  const it = conform(delta.$delta({ attrs: { meta: $inner } }), delta.$delta({ attrs: { meta: $innerC } })).init()
  cmp(
    it.applyA(delta.create().setAttr('meta', delta.create('m').setAttr('v', 1).setAttr('label', 'hi'))).b,
    delta.create().setAttr('meta', delta.create('m').setAttr('v', 1))
  )
}

export const testConformLooseSchemaAttrs = () => {
  // a target schema with loose attrs ($any) keeps every attribute verbatim
  const it = conform(delta.$delta({ attrs: { a: s.$string } }), delta.$delta({ attrs: s.$any })).init()
  cmp(it.applyA(/** @type {any} */ (delta.create().setAttr('a', 'x').setAttr('b', 'y'))).b, delta.create().setAttr('a', 'x').setAttr('b', 'y'))
}

export const testConformDropsForbiddenContent = () => {
  // the schema permits no content, so a text/child change keeps only the recognized attr
  const it = conform(delta.$delta({ text: true, attrs: { a: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  cmp(it.applyA(delta.create().setAttr('a', 'x').insert('hello')).b, delta.create().setAttr('a', 'x'))
  cmp(it.applyA(delta.create().insert('hello')).b, delta.create())
}

export const testConformForwardsPermittedContent = () => {
  // the schema permits text, so content is forwarded verbatim
  const it = conform(delta.$delta({ text: true }), delta.$delta({ text: true })).init()
  cmp(it.applyA(delta.create().insert('hello')).b, delta.create().insert('hello'))
  cmp(it.applyA(delta.create().retain(2).insert('XY').delete(1)).b, delta.create().retain(2).insert('XY').delete(1))
}

export const testConformLooseInput = () => {
  // a loose input schema still filters by the target schema at runtime (the drop list comes from `$schema`)
  const it = conform(delta.$deltaAny, delta.$delta({ attrs: { a: s.$string } })).init()
  cmp(it.applyA(delta.create().setAttr('a', 'x').setAttr('b', 'y')).b, delta.create().setAttr('a', 'x'))
}

export const testConformDropsUnknownChild = () => {
  // a child node whose name is not one of the schema's child node-names is dropped; the surviving
  // children keep their order (retain/positions map across the drop)
  const $p = delta.$delta('p', { text: true })
  const it = conform(
    delta.$delta({ children: s.$union($p, delta.$delta('aside', { text: true })) }),
    delta.$delta({ children: $p })
  ).init()
  const res = it.applyA(delta.create().insert([delta.create('p').insert('keep'), delta.create('aside').insert('drop'), delta.create('p').insert('keep2')]))
  cmp(res.b, delta.create().insert([delta.create('p').insert('keep'), delta.create('p').insert('keep2')]))
}

export const testConformStripsChildAttrs = () => {
  // a kept child node is recursively conformed - its unknown attribute is stripped, not the whole node
  const it = conform(
    delta.$delta({ children: delta.$delta('p', { attrs: { keep: s.$string, drop: s.$string } }) }),
    delta.$delta({ children: delta.$delta('p', { attrs: { keep: s.$string } }) })
  ).init()
  const res = it.applyA(delta.create().insert([delta.create('p').setAttr('keep', 'k').setAttr('drop', 'd')]))
  cmp(res.b, delta.create().insert([delta.create('p').setAttr('keep', 'k')]))
}

export const testConformNestedChildAndModify = () => {
  // recursion descends into a kept child, and a later modify of that child routes to its nested conform
  const $li = delta.$delta('li', { attrs: { ok: s.$string, bad: s.$string }, text: true })
  const $liC = delta.$delta('li', { attrs: { ok: s.$string }, text: true })
  const it = conform(delta.$delta({ children: $li }), delta.$delta({ children: $liC })).init()
  it.applyA(delta.create().insert([delta.create('li').setAttr('ok', 'a').setAttr('bad', 'b').insert('hi')]))
  // modify the first child: set `ok` (kept) and `bad` (dropped) inside it
  const upd = it.applyA(delta.create().modify(delta.create().setAttr('ok', 'a2').setAttr('bad', 'b2')))
  cmp(upd.b, delta.create().modify(delta.create().setAttr('ok', 'a2')))
}

export const testConformPassthroughIdentity = () => {
  // conform(_, $deltaAny) is the identity: applyA returns its very input, no walk, no copy
  const it = conform(delta.$delta({ text: true, attrs: { a: s.$string } }), delta.$deltaAny).init()
  const d = delta.create().setAttr('a', 'x').insert('hi')
  const r = it.applyA(d)
  t.assert(r.a === null)
  t.assert(r.b === d) // same object - zero overhead
}

export const testConformDeltaAnyChild = () => {
  // a `$deltaAny` member in the children schema is a pass-through wildcard: an unmatched node is kept
  // verbatim (no stripping) and its later modify is forwarded verbatim; a named match is still conformed
  const $p = delta.$delta('p', {})
  const it = conform(delta.$deltaAny, delta.$delta({ children: s.$union($p, delta.$deltaAny) })).init()
  const r = it.applyA(delta.create().insert([delta.create('p').setAttr('x', '1'), delta.create('weird').setAttr('y', '2')]))
  // 'p' is conformed ({} schema -> x stripped); 'weird' passes through verbatim (y kept)
  cmp(r.b, delta.create().insert([delta.create('p'), delta.create('weird').setAttr('y', '2')]))
  // retain over the transformed 'p', then modify the pass-through 'weird' -> forwarded verbatim
  cmp(it.applyA(delta.create().retain(1).modify(delta.create().setAttr('z', '3'))).b, delta.create().retain(1).modify(delta.create().setAttr('z', '3')))
  // a STRUCTURAL change (it inserts) that also modifies the pass-through 'weird' -> the modify is still
  // forwarded verbatim and the inserted node passes through
  cmp(
    it.applyA(delta.create().retain(1).modify(delta.create().setAttr('q', '9')).insert([delta.create('extra')])).b,
    delta.create().retain(1).modify(delta.create().setAttr('q', '9')).insert([delta.create('extra')])
  )
}

export const testConformDeltaAnyAttr = () => {
  // a `$deltaAny` attribute value schema passes the value through verbatim, and forwards modifyAttr
  const it = conform(delta.$deltaAny, delta.$delta({ attrs: { meta: delta.$deltaAny, n: s.$any } })).init()
  cmp(it.applyA(delta.create().setAttr('meta', delta.create('x').setAttr('w', 5)).setAttr('n', 7)).b, delta.create().setAttr('meta', delta.create('x').setAttr('w', 5)).setAttr('n', 7))
  cmp(it.applyA(delta.create().modifyAttr('meta', delta.create().setAttr('w', 6))).b, delta.create().modifyAttr('meta', delta.create().setAttr('w', 6)))
}

export const testConformWildcardChild = () => {
  // a child schema with a loose (unconstrained) name acts as a wildcard: an anonymous OR any-named
  // child node matches it and is recursively conformed (its unknown `extra` attr is stripped)
  const it = conform(
    delta.$delta({ children: delta.$delta({ attrs: { k: s.$string, extra: s.$string } }) }),
    delta.$delta({ children: delta.$delta({ attrs: { k: s.$string } }) })
  ).init()
  const res = it.applyA(delta.create().insert([
    delta.create().setAttr('k', 'a').setAttr('extra', 'b'), // anonymous (name === null)
    delta.create('named').setAttr('k', 'c') // a name not in any literal map
  ]))
  cmp(res.b, delta.create().insert([delta.create().setAttr('k', 'a'), delta.create('named').setAttr('k', 'c')]))
}

export const testConformModifyNamedDeltaAttr = () => {
  // modifyAttr on a known delta-valued attr with a *named* sub-schema (no prior setAttr) lazily builds
  // the nested conform from the by-name map and routes the change through it
  const it = conform(
    delta.$delta({ attrs: { box: delta.$delta('box', { attrs: { w: s.$number, h: s.$number } }) } }),
    delta.$delta({ attrs: { box: delta.$delta('box', { attrs: { w: s.$number } }) } })
  ).init()
  cmp(
    it.applyA(delta.create().modifyAttr('box', delta.create().setAttr('w', 1).setAttr('h', 2))).b,
    delta.create().modifyAttr('box', delta.create().setAttr('w', 1))
  )
}

export const testConformAttrMarks = () => {
  // a mark on a kept attribute rides; a mark on a dropped attribute is gone
  const it = conform(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  const d = delta.create().setAttr('a', 'x').setAttr('b', 'y')
  d.addMark(position.create(['a']), 'KA') // on the kept attr
  d.addMark(position.create(['b']), 'DB') // on the dropped attr
  t.compare(mp(it.applyA(d).b), [{ id: 'KA', path: ['a'], assoc: 1 }])
}

export const testConformTextMark = () => {
  // a content mark inside a pass-through text run maps straight through (B-offset == A-offset); the
  // trailing node makes the offset walk stop early (it reaches the mark before the end of the layout)
  const $n = delta.$delta('n', {})
  const it = conform(delta.$delta({ text: true, children: $n }), delta.$delta({ text: true, children: $n })).init()
  const d = delta.create().insert('hello').insert([delta.create('n')])
  d.addMark(position.create([3]), 'M')
  t.compare(mp(it.applyA(d).b), [{ id: 'M', path: [3], assoc: 1 }])
}

export const testConformMarks = () => {
  // best-effort marks: a mark on a kept child rides through; a mark on a dropped child is gone
  const $p = delta.$delta('p', {})
  const it = conform(
    delta.$delta({ children: s.$union($p, delta.$delta('x', {})) }),
    delta.$delta({ children: $p })
  ).init()
  const d = delta.create().insert([delta.create('p'), delta.create('x'), delta.create('p')])
  d.addMark(position.create([1]), 'KEPT') // gap after the first kept `p`
  const r = it.applyA(d)
  // the dropped `x` collapses, so the cursor lands at gap 1 in the conformed output (two `p`s)
  t.compare(mp(r.b), [{ id: 'KEPT', path: [1], assoc: 1 }])
}

// ---------------------------------------------------------------------------
// Fuzz: a rich input schema `$d` (superset) conformed to a narrowing `$schema`. Every random change is
// fed through one persistent conform; after each step the conformed B-state must (1) satisfy `$schema`
// and (2) equal a from-scratch conform of the whole A-state (incremental == fresh).

const $item = delta.$delta('item', { attrs: { v: s.$number, label: s.$string }, text: true })
const $note = delta.$delta('note', { attrs: { n: s.$number }, text: true })
const $aside = delta.$delta('aside', { attrs: { a: s.$string } })
const $dFuzz = delta.$delta('root', {
  attrs: { meta: $item, title: s.$string, extra: s.$string },
  children: s.$union($item, $note, $aside, s.$number),
  text: true
})
const $itemC = delta.$delta('item', { attrs: { v: s.$number }, text: true }) // drops `label`
const $noteC = delta.$delta('note', { attrs: { n: s.$number } }) // drops text
const $schemaFuzz = delta.$delta('root', {
  attrs: { meta: $itemC, title: s.$string }, // drops `extra`
  children: s.$union($itemC, $noteC, s.$literal(1, 2, 3)), // drops `aside`; narrows numbers
  text: true
})

/**
 * @param {delta.DeltaAny} aState
 * @return {delta.DeltaBuilderAny}
 */
const freshConform = aState => /** @type {any} */ (delta.create()).apply(conform($dFuzz, $schemaFuzz).init().applyA(delta.clone(aState)).b)

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomConform = tc => {
  const it = conform($dFuzz, $schemaFuzz).init()
  let aState = /** @type {delta.DeltaAny} */ (delta.random(tc.prng, $dFuzz, { minChildOps: 3, maxChildOps: 10 }).done())
  const bState = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  bState.apply(it.applyA(delta.clone(aState)).b)
  t.assert($schemaFuzz.check(bState), 'initial render conforms')
  cmp(bState, freshConform(aState))
  for (let i = 0; i < 6; i++) {
    const ch = delta.random(tc.prng, $dFuzz, { source: aState, minChildOps: 1, maxChildOps: 6 })
    aState = delta.clone(aState).apply(delta.clone(ch))
    bState.apply(it.applyA(ch).b)
    t.assert($schemaFuzz.check(bState), 'incremental state conforms')
    cmp(bState, freshConform(aState))
  }
}

/**
 * Fuzz applyB (B -> A): a change generated to conform to `$schemaFuzz` is a valid edit of the conformed
 * view, so `applyB` must never throw, put nothing on B, and donate the change to A verbatim. The
 * transformer is first warmed with an `applyA` render so its `cmap` is non-trivial — `applyB` must
 * ignore it.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatConformApplyBPassthrough = tc => {
  const it = conform($dFuzz, $schemaFuzz).init()
  const aState = /** @type {delta.DeltaAny} */ (delta.random(tc.prng, $dFuzz, { minChildOps: 3, maxChildOps: 10 }).done())
  const bState = /** @type {delta.DeltaAny} */ (/** @type {any} */ (delta.create()).apply(it.applyA(delta.clone(aState)).b).done())
  for (let i = 0; i < 6; i++) {
    const ch = delta.random(tc.prng, $schemaFuzz, { source: bState, minChildOps: 1, maxChildOps: 6 })
    const r = it.applyB(delta.clone(ch))
    t.assert(r.b === null, 'applyB puts nothing on B')
    cmp(r.a, ch) // verbatim passthrough to A
  }
}
