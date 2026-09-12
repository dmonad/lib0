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

/**
 * A from-scratch conform of `aState` to `$schema` — what the B state must equal after any sequence of
 * incremental A- and B-side edits.
 *
 * @param {import('../../schema.js').Schema<any>} $schema
 * @param {delta.DeltaAny} aState
 * @return {delta.DeltaBuilderAny}
 */
const renderConformed = ($schema, aState) => /** @type {any} */ (delta.create()).apply(conform(delta.$deltaAny, $schema).init().applyA(delta.clone(aState)).b)

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
  const resA = it.applyA(delta.setAttr('a', 'x').setAttr('b', 'y'))
  t.assert(resA.a === null)
  cmp(resA.b, delta.setAttr('a', 'x')) // `b` is gone, not merely "present"
}

export const testConformApplyB = () => {
  // applyB (B -> A): a conformant B-side change passes straight through to A (nothing on B); any op that
  // would break conformance throws.
  const it = conform(delta.$delta({ attrs: { a: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  const r = it.applyB(delta.setAttr('a', 'z'))
  cmp(r.a, delta.setAttr('a', 'z')) // donated to A verbatim
  t.assert(r.b === null) // nothing on B
  cmp(it.applyB(delta.deleteAttr('a')).a, delta.deleteAttr('a')) // removal always conforms
  t.fails(() => it.applyB(/** @type {any} */ (delta.setAttr('b', 'z')))) // unknown attribute key
  t.fails(() => it.applyB(/** @type {any} */ (delta.setAttr('a', 5)))) // known key, wrong value type
  t.fails(() => it.applyB(/** @type {any} */ (delta.modifyAttr('a', delta.insert('x'))))) // scalar attr: nothing to modify

  // text + a named delta child are allowed; structural ops and a matching child pass; a foreign child throws
  const $p = delta.$delta('p', { attrs: { q: s.$number } })
  const it2 = conform(delta.$deltaAny, delta.$delta({ text: true, children: $p })).init()
  cmp(it2.applyB(delta.insert('hi')).a, delta.insert('hi')) // text allowed
  cmp(it2.applyB(delta.retain(2).delete(1)).a, delta.retain(2).delete(1)) // structural (past the layout: unseen content passes through)
  cmp(it2.applyB(delta.insert([delta.create('p')])).a, delta.insert([delta.create('p')])) // matching child
  cmp(it2.applyB(/** @type {any} */ (delta.modify(delta.setAttr('q', 1)))).a, delta.modify(delta.setAttr('q', 1))) // modify routes through the child's nested conform: deep-validated (`q` is in $p)...
  t.fails(() => it2.applyB(/** @type {any} */ (delta.modify(delta.setAttr('nope', 1))))) // ...so an attr $p does not know throws
  t.fails(() => it2.applyB(/** @type {any} */ (delta.insert([delta.create('nope')])))) // foreign child name
  t.fails(() => it2.applyB(/** @type {any} */ (delta.insert([99])))) // foreign scalar child
  t.fails(() => it2.applyB(/** @type {any} */ (delta.insert([delta.create()])))) // anonymous node: passes $Delta.check but matches no named child (a re-render would drop it)

  // no text, scalar-only children: a text op and a modify both throw; a matching scalar passes
  const it3 = conform(delta.$deltaAny, delta.$delta({ children: s.$literal(1, 2, 3) })).init()
  t.fails(() => it3.applyB(/** @type {any} */ (delta.insert('x')))) // text not allowed
  t.fails(() => it3.applyB(/** @type {any} */ (delta.modify(delta.setAttr('q', 1))))) // no delta child to modify
  cmp(it3.applyB(/** @type {any} */ (delta.insert([2]))).a, delta.insert([2])) // matching scalar (literal narrows)

  // loose attrs ($any) accept any key/value verbatim
  const it4 = conform(delta.$deltaAny, delta.$delta({ attrs: s.$any })).init()
  cmp(it4.applyB(delta.setAttr('whatever', 123)).a, delta.setAttr('whatever', 123))

  // a delta-valued attribute: setAttr of a matching value and modifyAttr both pass (modify is deep-validated)
  const it5 = conform(delta.$deltaAny, delta.$delta({ attrs: { meta: delta.$delta('m', { attrs: { q: s.$number } }) } })).init()
  cmp(it5.applyB(delta.setAttr('meta', delta.create('m'))).a, delta.setAttr('meta', delta.create('m')))
  cmp(it5.applyB(/** @type {any} */ (delta.modifyAttr('meta', delta.setAttr('q', 1)))).a, delta.modifyAttr('meta', delta.setAttr('q', 1)))
  t.fails(() => it5.applyB(/** @type {any} */ (delta.modifyAttr('meta', delta.setAttr('nope', 1)))))

  // $deltaAny target is the identity: applyB returns its very input on A, never throws
  const it6 = conform(delta.$delta({ text: true }), delta.$deltaAny).init()
  const d = delta.insert('hi')
  const r6 = it6.applyB(d)
  t.assert(r6.a === d) // same object - zero overhead
  t.assert(r6.b === null)
}

export const testConformDropsInvalidValue = () => {
  // `a` is a known key but the schema requires a string; a number value fails validation and is dropped
  const it = conform(delta.$delta({ attrs: { a: [s.$number, s.$string] } }), delta.$delta({ attrs: { a: s.$string } })).init()
  cmp(it.applyA(delta.setAttr('a', 'ok')).b, delta.setAttr('a', 'ok'))
  cmp(it.applyA(delta.setAttr('a', 42)).b, delta.create())
}

export const testConformDropsUnknownDeleteAndModify = () => {
  // deleteAttr / modifyAttr of an unknown key are dropped; of a known delta-valued key are kept and
  // recursively conformed (modifyAttr lazily builds the nested conform when no setAttr was seen first)
  const it = conform(
    delta.$delta({ attrs: { a: delta.$delta({ attrs: { x: s.$number } }), b: delta.$delta({ attrs: { y: s.$number } }) } }),
    delta.$delta({ attrs: { a: delta.$delta({ attrs: { x: s.$number } }) } })
  ).init()
  cmp(it.applyA(delta.deleteAttr('b')).b, delta.create())
  cmp(it.applyA(delta.deleteAttr('a')).b, delta.deleteAttr('a'))
  cmp(it.applyA(delta.modifyAttr('a', delta.setAttr('x', 1))).b, delta.modifyAttr('a', delta.setAttr('x', 1)))
  // second modify on `a` reuses the cached nested conform; the inner change is conformed (extra key `z`
  // is invalid input -> cast, and the conform drops it)
  cmp(it.applyA(/** @type {any} */ (delta.modifyAttr('a', delta.setAttr('x', 2).setAttr('z', 9)))).b, delta.modifyAttr('a', delta.setAttr('x', 2)))
  cmp(it.applyA(delta.modifyAttr('b', delta.setAttr('y', 2))).b, delta.create())
}

export const testConformAttrModifyScalarDropped = () => {
  // modifyAttr on a known *scalar* attribute has no sub-document to descend into -> dropped
  const it = conform(delta.$delta({ attrs: { a: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  cmp(it.applyA(/** @type {any} */ (delta.modifyAttr('a', delta.insert('x')))).b, delta.create())
}

export const testConformRecursesDeltaAttr = () => {
  // a delta-valued attribute is recursively conformed: the inner `label` (absent from the target) is dropped
  const $inner = delta.$delta('m', { attrs: { v: s.$number, label: s.$string } })
  const $innerC = delta.$delta('m', { attrs: { v: s.$number } })
  const it = conform(delta.$delta({ attrs: { meta: $inner } }), delta.$delta({ attrs: { meta: $innerC } })).init()
  cmp(
    it.applyA(delta.setAttr('meta', delta.create('m', { v: 1, label: 'hi' }))).b,
    delta.setAttr('meta', delta.create('m', { v: 1 }))
  )
}

export const testConformLooseSchemaAttrs = () => {
  // a target schema with loose attrs ($any) keeps every attribute verbatim
  const it = conform(delta.$delta({ attrs: { a: s.$string } }), delta.$delta({ attrs: s.$any })).init()
  cmp(it.applyA(/** @type {any} */ (delta.setAttr('a', 'x').setAttr('b', 'y'))).b, delta.setAttr('a', 'x').setAttr('b', 'y'))
}

export const testConformDropsForbiddenContent = () => {
  // the schema permits no content, so a text/child change keeps only the recognized attr
  const it = conform(delta.$delta({ text: true, attrs: { a: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  cmp(it.applyA(delta.setAttr('a', 'x').insert('hello')).b, delta.setAttr('a', 'x'))
  cmp(it.applyA(delta.insert('hello')).b, delta.create())
}

export const testConformForwardsPermittedContent = () => {
  // the schema permits text, so content is forwarded verbatim
  const it = conform(delta.$delta({ text: true }), delta.$delta({ text: true })).init()
  cmp(it.applyA(delta.insert('hello')).b, delta.insert('hello'))
  cmp(it.applyA(delta.retain(2).insert('XY').delete(1)).b, delta.retain(2).insert('XY').delete(1))
}

export const testConformLooseInput = () => {
  // a loose input schema still filters by the target schema at runtime (the drop list comes from `$schema`)
  const it = conform(delta.$deltaAny, delta.$delta({ attrs: { a: s.$string } })).init()
  cmp(it.applyA(delta.setAttr('a', 'x').setAttr('b', 'y')).b, delta.setAttr('a', 'x'))
}

export const testConformDropsUnknownChild = () => {
  // a child node whose name is not one of the schema's child node-names is dropped; the surviving
  // children keep their order (retain/positions map across the drop)
  const $p = delta.$delta('p', { text: true })
  const it = conform(
    delta.$delta({ children: s.$union($p, delta.$delta('aside', { text: true })) }),
    delta.$delta({ children: $p })
  ).init()
  const res = it.applyA(delta.insert([delta.create('p', null, 'keep'), delta.create('aside', null, 'drop'), delta.create('p', null, 'keep2')]))
  cmp(res.b, delta.insert([delta.create('p', null, 'keep'), delta.create('p', null, 'keep2')]))
}

export const testConformStripsChildAttrs = () => {
  // a kept child node is recursively conformed - its unknown attribute is stripped, not the whole node
  const it = conform(
    delta.$delta({ children: delta.$delta('p', { attrs: { keep: s.$string, drop: s.$string } }) }),
    delta.$delta({ children: delta.$delta('p', { attrs: { keep: s.$string } }) })
  ).init()
  const res = it.applyA(delta.insert([delta.create('p', { keep: 'k', drop: 'd' })]))
  cmp(res.b, delta.insert([delta.create('p', { keep: 'k' })]))
}

export const testConformNestedChildAndModify = () => {
  // recursion descends into a kept child, and a later modify of that child routes to its nested conform
  const $li = delta.$delta('li', { attrs: { ok: s.$string, bad: s.$string }, text: true })
  const $liC = delta.$delta('li', { attrs: { ok: s.$string }, text: true })
  const it = conform(delta.$delta({ children: $li }), delta.$delta({ children: $liC })).init()
  it.applyA(delta.insert([delta.create('li', { ok: 'a', bad: 'b' }, 'hi')]))
  // modify the first child: set `ok` (kept) and `bad` (dropped) inside it
  const upd = it.applyA(delta.modify(delta.setAttr('ok', 'a2').setAttr('bad', 'b2')))
  cmp(upd.b, delta.modify(delta.setAttr('ok', 'a2')))
}

export const testConformPassthroughIdentity = () => {
  // conform(_, $deltaAny) is the identity: applyA returns its very input, no walk, no copy
  const it = conform(delta.$delta({ text: true, attrs: { a: s.$string } }), delta.$deltaAny).init()
  const d = delta.setAttr('a', 'x').insert('hi')
  const r = it.applyA(d)
  t.assert(r.a === null)
  t.assert(r.b === d) // same object - zero overhead
}

export const testConformDeltaAnyChild = () => {
  // a `$deltaAny` member in the children schema is a pass-through wildcard: an unmatched node is kept
  // verbatim (no stripping) and its later modify is forwarded verbatim; a named match is still conformed
  const $p = delta.$delta('p', {})
  const it = conform(delta.$deltaAny, delta.$delta({ children: s.$union($p, delta.$deltaAny) })).init()
  const r = it.applyA(delta.insert([delta.create('p', { x: '1' }), delta.create('weird', { y: '2' })]))
  // 'p' is conformed ({} schema -> x stripped); 'weird' passes through verbatim (y kept)
  cmp(r.b, delta.insert([delta.create('p'), delta.create('weird', { y: '2' })]))
  // retain over the transformed 'p', then modify the pass-through 'weird' -> forwarded verbatim
  cmp(it.applyA(delta.retain(1).modify(delta.setAttr('z', '3'))).b, delta.retain(1).modify(delta.setAttr('z', '3')))
  // a STRUCTURAL change (it inserts) that also modifies the pass-through 'weird' -> the modify is still
  // forwarded verbatim and the inserted node passes through
  cmp(
    it.applyA(delta.retain(1).modify(delta.setAttr('q', '9')).insert([delta.create('extra')])).b,
    delta.retain(1).modify(delta.setAttr('q', '9')).insert([delta.create('extra')])
  )
}

export const testConformDeltaAnyAttr = () => {
  // a `$deltaAny` attribute value schema passes the value through verbatim, and forwards modifyAttr
  const it = conform(delta.$deltaAny, delta.$delta({ attrs: { meta: delta.$deltaAny, n: s.$any } })).init()
  cmp(it.applyA(delta.setAttr('meta', delta.create('x', { w: 5 })).setAttr('n', 7)).b, delta.setAttr('meta', delta.create('x', { w: 5 })).setAttr('n', 7))
  cmp(it.applyA(delta.modifyAttr('meta', delta.setAttr('w', 6))).b, delta.modifyAttr('meta', delta.setAttr('w', 6)))
}

export const testConformWildcardChild = () => {
  // a child schema with a loose (unconstrained) name acts as a wildcard: an anonymous OR any-named
  // child node matches it and is recursively conformed (its unknown `extra` attr is stripped)
  const it = conform(
    delta.$delta({ children: delta.$delta({ attrs: { k: s.$string, extra: s.$string } }) }),
    delta.$delta({ children: delta.$delta({ attrs: { k: s.$string } }) })
  ).init()
  const res = it.applyA(delta.insert([
    delta.setAttr('k', 'a').setAttr('extra', 'b'), // anonymous (name === null)
    delta.create('named', { k: 'c' }) // a name not in any literal map
  ]))
  cmp(res.b, delta.insert([delta.setAttr('k', 'a'), delta.create('named', { k: 'c' })]))
}

export const testConformModifyNamedDeltaAttr = () => {
  // modifyAttr on a known delta-valued attr with a *named* sub-schema (no prior setAttr) lazily builds
  // the nested conform from the by-name map and routes the change through it
  const it = conform(
    delta.$delta({ attrs: { box: delta.$delta('box', { attrs: { w: s.$number, h: s.$number } }) } }),
    delta.$delta({ attrs: { box: delta.$delta('box', { attrs: { w: s.$number } }) } })
  ).init()
  cmp(
    it.applyA(delta.modifyAttr('box', delta.setAttr('w', 1).setAttr('h', 2))).b,
    delta.modifyAttr('box', delta.setAttr('w', 1))
  )
}

export const testConformAttrMarks = () => {
  // a mark on a kept attribute rides; a mark on a dropped attribute is gone
  const it = conform(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  const d = delta.setAttr('a', 'x').setAttr('b', 'y')
  d.addMark(position.create(['a']), 'KA') // on the kept attr
  d.addMark(position.create(['b']), 'DB') // on the dropped attr
  t.compare(mp(it.applyA(d).b), [{ id: 'KA', path: ['a'], assoc: 1 }])
}

export const testConformTextMark = () => {
  // a content mark inside a pass-through text run maps straight through (B-offset == A-offset); the
  // trailing node makes the offset walk stop early (it reaches the mark before the end of the layout)
  const $n = delta.$delta('n', {})
  const it = conform(delta.$delta({ text: true, children: $n }), delta.$delta({ text: true, children: $n })).init()
  const d = delta.insert('hello').insert([delta.create('n')])
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
  const d = delta.insert([delta.create('p'), delta.create('x'), delta.create('p')])
  d.addMark(position.create([1]), 'KEPT') // gap after the first kept `p`
  const r = it.applyA(d)
  // the dropped `x` collapses, so the cursor lands at gap 1 in the conformed output (two `p`s)
  t.compare(mp(r.b), [{ id: 'KEPT', path: [1], assoc: 1 }])
}

// ---------------------------------------------------------------------------
// applyB (B -> A): positions of a change authored on the conformed view are remapped across the content
// the schema hid on B (see the conventions in ConformTransformer#applyB).

export const testConformApplyBRemapsDroppedChild = () => {
  // A = [p, div] conformed to B = [div]: B positions are remapped across the hidden `p`
  const $schema = delta.$delta({ children: delta.$delta('div', { attrs: { x: s.$number } }) })
  const it = conform(delta.$deltaAny, $schema).init()
  let aState = /** @type {delta.DeltaAny} */ (delta.insert([delta.create('p'), delta.create('div')]).done())
  const bState = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  bState.apply(it.applyA(delta.clone(aState)).b)
  cmp(bState, delta.insert([delta.create('div')]))
  /**
   * @param {delta.DeltaBuilderAny} ch a B-side change
   * @param {delta.DeltaBuilderAny} expectedA
   */
  const editB = (ch, expectedA) => {
    const r = it.applyB(delta.clone(ch))
    t.assert(r.b === null)
    cmp(r.a, expectedA)
    aState = delta.clone(aState).apply(/** @type {delta.DeltaBuilderAny} */ (r.a))
    bState.apply(ch)
    cmp(bState, renderConformed($schema, aState)) // the conformed view of A is B
  }
  editB(delta.modify(delta.setAttr('x', 1)), delta.retain(1).modify(delta.setAttr('x', 1))) // the div is A[1]
  editB(delta.insert([delta.create('div', { x: 2 })]), delta.retain(1).insert([delta.create('div', { x: 2 })])) // a B insert lands after the hidden content at its position
  editB(delta.retain(2).insert([delta.create('div', { x: 3 })]), delta.retain(3).insert([delta.create('div', { x: 3 })]))
  editB(delta.retain(1).delete(1), delta.retain(2).delete(1)) // deletes the first div, not the p
  cmp(/** @type {any} */ (aState), delta.insert([delta.create('p'), delta.create('div', { x: 2 }), delta.create('div', { x: 3 })]))
}

export const testConformApplyBKeepsHiddenInDeleteRange = () => {
  const it = conform(delta.$deltaAny, delta.$delta({ children: delta.$delta('div', {}) })).init()
  it.applyA(delta.insert([delta.create('div'), delta.create('p'), delta.create('div')])) // B = [div, div]
  // B deletes both divs: the hidden `p` in between survives on A (the view only deletes what it can see)
  cmp(it.applyB(delta.delete_(2)).a, delta.delete_(1).retain(1).delete(1))
  // A = [p]. Add a visible div and another hidden p, then delete the div on B: the two hidden runs merge
  // and the cursor lands inside the merged run — the following insert steps over its remainder
  it.applyA(delta.retain(1).insert([delta.create('div'), delta.create('p')])) // A = [p, div, p], B = [div]
  cmp(it.applyB(delta.delete_(1).insert([delta.create('div')])).a, delta.retain(1).delete(1).retain(1).insert([delta.create('div')]))
  cmp(it.applyB(delta.delete_(1)).a, delta.retain(2).delete(1)) // A = [p, p, div]
}

export const testConformApplyBFormatSkipsHidden = () => {
  // a B-side format over a range never touches the hidden content inside it: a plain retain covers the
  // hidden node, and neither a format nor a blanket `null` clear merges onto it
  const it = conform(delta.$deltaAny, delta.$delta({ text: true })).init()
  it.applyA(delta.insert('ab').insert([delta.create('aside')]).insert('cd')) // B = "abcd"
  cmp(it.applyB(delta.retain(4, { bold: true })).a, delta.retain(2, { bold: true }).retain(1).retain(2, { bold: true }))
  cmp(it.applyB(delta.retain(4, null)).a, delta.retain(2, null).retain(1).retain(2, null))
}

export const testConformApplyBNestedModify = () => {
  // a modify of a kept child is remapped inside that child by its nested conform: the `aside` hidden
  // inside the `li` shifts B offset 2 to A offset 3, and the nested layout stays in step
  const it = conform(delta.$deltaAny, delta.$delta({ children: delta.$delta('li', { text: true }) })).init()
  const li = delta.create('li').insert('ab').insert([delta.create('aside')]).insert('cd')
  cmp(it.applyA(delta.insert([li])).b, delta.insert([delta.create('li').insert('abcd')]))
  cmp(it.applyB(delta.modify(delta.retain(2).insert('z'))).a, delta.modify(delta.retain(3).insert('z'))) // B li = "abzcd"
  cmp(it.applyB(delta.modify(delta.retain(3).delete(2))).a, delta.modify(delta.retain(4).delete(2)))
}

export const testConformApplyBInsertWarmsNestedState = () => {
  // a node inserted on B gets a nested conform warmed on it, so its later edits on either side are
  // remapped: an A-side modify hides an `aside` inside it, and a B-side modify past that point shifts
  const it = conform(delta.$deltaAny, delta.$delta({ children: delta.$delta('li', { text: true }) })).init()
  cmp(it.applyB(delta.insert([delta.create('li').insert('ab')])).a, delta.insert([delta.create('li').insert('ab')]))
  cmp(it.applyA(delta.modify(delta.retain(1).insert([delta.create('aside')]))).b, delta.modify(delta.create())) // A li = "a" aside "b"
  cmp(it.applyB(delta.modify(delta.retain(2).insert('z'))).a, delta.modify(delta.retain(3).insert('z')))
}

export const testConformApplyBDeltaAttr = () => {
  // a delta-valued attribute set on B gets a nested conform warmed on the value; a modifyAttr routes
  // through it (remapped across content A hides inside the value); deleteAttr clears it
  const it = conform(delta.$deltaAny, delta.$delta({ attrs: { meta: delta.$delta('m', { attrs: { v: s.$number }, text: true }) } })).init()
  const m = delta.create('m', { v: 1 }).insert('ab')
  cmp(it.applyB(/** @type {any} */ (delta.setAttr('meta', m))).a, delta.setAttr('meta', m))
  cmp(it.applyA(delta.modifyAttr('meta', delta.retain(1).insert([delta.create('aside')]))).b, delta.modifyAttr('meta', delta.create())) // A meta = "a" aside "b"
  cmp(it.applyB(delta.modifyAttr('meta', delta.retain(2).insert('z'))).a, delta.modifyAttr('meta', delta.retain(3).insert('z')))
  cmp(it.applyB(delta.deleteAttr('meta')).a, delta.deleteAttr('meta'))
  // after the delete the nested conform is gone: a modifyAttr without a preceding setAttr lazily builds a
  // fresh one, whose (unseen) content passes through
  cmp(it.applyB(delta.modifyAttr('meta', delta.retain(2).insert('z'))).a, delta.modifyAttr('meta', delta.retain(2).insert('z')))
  // the lazy build from a wildcard (anonymous) sub-schema — deep-validated against it
  const itW = conform(delta.$deltaAny, delta.$delta({ attrs: { any: delta.$delta({ attrs: { k: s.$string } }) } })).init()
  cmp(itW.applyB(delta.modifyAttr('any', delta.setAttr('k', 'x'))).a, delta.modifyAttr('any', delta.setAttr('k', 'x')))
  t.fails(() => itW.applyB(/** @type {any} */ (delta.modifyAttr('any', delta.setAttr('zz', 'x')))))
  // a loose ($any) attrs schema copies every attr op verbatim
  const itL = conform(delta.$deltaAny, delta.$delta({ attrs: s.$any })).init()
  cmp(itL.applyB(delta.setAttr('w', 1).deleteAttr('q')).a, delta.setAttr('w', 1).deleteAttr('q'))
}

export const testConformApplyBDeltaAny = () => {
  // B-side twin of the $deltaAny pass-through cases: an unmatched node inserted on B is a pass-through
  // position (no nested conform) and its later modify forwards verbatim; a $deltaAny attr is verbatim too
  const $p = delta.$delta('p', { attrs: { x: s.$string } })
  const it = conform(delta.$deltaAny, delta.$delta({ children: s.$union($p, delta.$deltaAny), attrs: { meta: delta.$deltaAny } })).init()
  cmp(it.applyB(delta.insert([delta.create('weird', { y: '2' }), delta.create('p', { x: '1' })])).a, delta.insert([delta.create('weird', { y: '2' }), delta.create('p', { x: '1' })]))
  cmp(it.applyB(delta.modify(delta.setAttr('z', '3'))).a, delta.modify(delta.setAttr('z', '3'))) // pass-through child: verbatim
  t.fails(() => it.applyB(/** @type {any} */ (delta.retain(1).modify(delta.setAttr('z', '3'))))) // the `p` is conformed: `z` is unknown to $p
  cmp(it.applyB(delta.setAttr('meta', delta.create('x', { w: 5 }))).a, delta.setAttr('meta', delta.create('x', { w: 5 })))
  cmp(it.applyB(delta.modifyAttr('meta', delta.setAttr('w', 6))).a, delta.modifyAttr('meta', delta.setAttr('w', 6)))
}

export const testConformApplyBRejects = () => {
  // a rejected B change throws before any state is touched: the layout still maps the next change right
  const it = conform(delta.$deltaAny, delta.$delta({ children: delta.$delta('p', { attrs: { q: s.$number } }) })).init()
  it.applyA(delta.insert([delta.create('x'), delta.create('p')])) // A = [x, p], B = [p]
  t.fails(() => it.applyB(/** @type {any} */ (delta.insert([delta.create()])))) // anonymous node
  t.fails(() => it.applyB(/** @type {any} */ (delta.insert([delta.create('p')]).modify(delta.setAttr('nope', 1))))) // a valid insert followed by an invalid nested modify: nothing of it sticks
  cmp(it.applyB(delta.modify(delta.setAttr('q', 1))).a, delta.retain(1).modify(delta.setAttr('q', 1))) // still [x, p]: the p is A[1]
}

export const testConformUnseenTailPassesThrough = () => {
  // a conform that never saw the initial render (or a lazily built nested one) knows no positions: ops
  // past the end of its layout pass through in both directions, and the walked-over content is recorded
  // as pass-through
  const it = conform(delta.$deltaAny, delta.$delta({ text: true, children: delta.$delta('n', {}) })).init()
  cmp(it.applyA(delta.retain(2).insert('x')).b, delta.retain(2).insert('x'))
  cmp(it.applyA(delta.retain(3).modify(delta.create()).delete(1)).b, delta.retain(3).modify(delta.create()).delete(1))
  cmp(it.applyB(delta.retain(5).insert('y')).a, delta.retain(5).insert('y'))
  cmp(it.applyB(delta.retain(6).modify(delta.create()).delete(1)).a, delta.retain(6).modify(delta.create()).delete(1))
  cmp(it.applyB(delta.retain(9).insert([delta.create('n')])).a, delta.retain(9).insert([delta.create('n')]))
  t.compare(layoutWidths(it), [10, 10])
}

export const testConformApplyBMarks = () => {
  // B positions map to A across hidden content — the hidden run at a boundary is stepped over (where a
  // B insert at that offset lands); attr-keyed marks ride verbatim
  const it = conform(delta.$deltaAny, delta.$delta({ children: delta.$delta('div', {}), attrs: { a: s.$string } })).init()
  it.applyA(delta.insert([delta.create('p'), delta.create('div'), delta.create('div')]))
  t.compare(
    position.mapPositionsB(it, [position.create([0]), position.create([1]), position.create([2]), position.create(['a'])]),
    [position.create([1]), position.create([2]), position.create([3]), position.create(['a'])]
  )
}

export const testConformAttrMarkRidesUntouchedAttr = () => {
  // an attr-keyed mark rides through applyA iff the schema knows the attr — whether or not the change
  // touches it (a mark-only change, as `mapPositionsA` sends, touches nothing)
  const it = conform(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  t.compare(position.mapPositionsA(it, [position.create(['a']), position.create(['b'])]), [position.create(['a']), null])
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
 * The layout's run widths `[A-width, B-width]` — hidden (delete) runs have no B width. The incremental
 * layout must track both states exactly.
 *
 * @param {any} it a ConformTransformer
 * @return {[number, number]}
 */
const layoutWidths = it => {
  let a = 0
  let b = 0
  for (const op of it.cmap.children) { a += op.length; if (!delta.$deleteOp.check(op)) b += op.length }
  return [a, b]
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomConform = tc => {
  const it = conform($dFuzz, $schemaFuzz).init()
  let aState = /** @type {delta.DeltaAny} */ (delta.random(tc.prng, $dFuzz, { minChildOps: 3, maxChildOps: 10 }).done())
  const bState = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  bState.apply(it.applyA(delta.clone(aState)).b)
  t.assert($schemaFuzz.check(bState), 'initial render conforms')
  cmp(bState, renderConformed($schemaFuzz, aState))
  for (let i = 0; i < 6; i++) {
    const ch = delta.random(tc.prng, $dFuzz, { source: aState, minChildOps: 1, maxChildOps: 6 })
    aState = delta.clone(aState).apply(delta.clone(ch))
    bState.apply(it.applyA(ch).b)
    t.assert($schemaFuzz.check(bState), 'incremental state conforms')
    cmp(bState, renderConformed($schemaFuzz, aState))
  }
}

/**
 * Fuzz both directions on one persistent conform: random A-side changes (`$dFuzz`, mapped with `applyA`)
 * alternate with random B-side changes (`$schemaFuzz` — valid edits of the conformed view, mapped back
 * with `applyB`, which must never throw and put nothing on B). After every step the B state must satisfy
 * `$schemaFuzz`, equal a from-scratch conform of the A state (so the B→A remapping across hidden content
 * is exact and B-inserted content is recorded in the layout), and the layout's widths must match both
 * states.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatRandomConformBidirectional = tc => {
  const it = conform($dFuzz, $schemaFuzz).init()
  let aState = /** @type {delta.DeltaAny} */ (delta.random(tc.prng, $dFuzz, { minChildOps: 3, maxChildOps: 10 }).done())
  const bState = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  bState.apply(it.applyA(delta.clone(aState)).b)
  const check = () => {
    t.assert($schemaFuzz.check(bState), 'state conforms')
    cmp(bState, renderConformed($schemaFuzz, aState))
    t.compare(layoutWidths(it), [aState.childCnt, bState.childCnt])
  }
  check()
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) { // an A-side edit
      const ch = delta.random(tc.prng, $dFuzz, { source: aState, minChildOps: 1, maxChildOps: 6 })
      aState = delta.clone(aState).apply(delta.clone(ch))
      bState.apply(it.applyA(ch).b)
    } else { // a B-side edit of the conformed view
      const ch = delta.random(tc.prng, $schemaFuzz, { source: bState, minChildOps: 1, maxChildOps: 6 })
      const r = it.applyB(delta.clone(ch))
      t.assert(r.b === null, 'applyB puts nothing on B')
      aState = delta.clone(aState).apply(/** @type {delta.DeltaBuilderAny} */ (r.a))
      bState.apply(ch)
    }
    check()
  }
}
