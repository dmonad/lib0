import * as t from 'lib0/testing'
import * as prng from 'lib0/prng'
import * as s from '../../schema.js'
import * as delta from '../delta.js'
import { pipe, transformerWith } from '../transformer.js'
import { inline } from './inline.js'

// ---------------------------------------------------------------------------
// inline
//
// Inlines child nodes whose name is in the configured `names` set (splicing each one's children into
// the parent, one level). `inline([null])` is the anonymous-node case used by most tests below:
// A = structured (inline nodes present, e.g. <p>some<>text</></p>)
// B = inlined (inline nodes flattened, e.g. <p>sometext</p>)
// Named inlining (e.g. inline(['b'])) is covered by testInlineNamed / testInlineMixed / the named fuzz.
// ---------------------------------------------------------------------------

/**
 * The structured document `some<>text</>` - the text "some" followed by a null node holding "text".
 *
 * @return {delta.DeltaBuilderAny}
 */
const structuredSomeText = () => delta.create().insert('some').insert([delta.create().insert('text')])

export const testInlineNullNodesRender = () => {
  const it = inline([null]).init(delta.$deltaAny)
  const res = it.applyA(structuredSomeText())
  // null node is inlined: <p>some<>text</></p> -> <p>sometext</p>
  t.compare(res.b, delta.create().insert('sometext'))
  t.assert(res.a === null)
}

export const testInlineNullNodesBackwardInterior = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // insert 'X' at inlined position 5 -> inside the null node at offset 1
  const res = it.applyB(delta.create().retain(5).insert('X'))
  t.compare(res.a, delta.create().retain(4).modify(delta.create().retain(1).insert('X')))
  t.assert(res.b === null)
  // end to end: applying res.a to the structured doc yields <p>some<>tXext</></p>
  const doc = structuredSomeText()
  doc.apply(res.a)
  t.compare(doc, delta.create().insert('some').insert([delta.create().insert('tXext')]))
}

export const testInlineNullNodesBackwardBoundary = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // insert 'Y' at inlined position 4 -> the boundary; prefer the root node
  const res = it.applyB(delta.create().retain(4).insert('Y'))
  t.compare(res.a, delta.create().retain(4).insert('Y'))
  const doc = structuredSomeText()
  doc.apply(res.a)
  t.compare(doc, delta.create().insert('someY').insert([delta.create().insert('text')]))
}

export const testInlineNullNodesWholeNodeDelete = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // delete the whole inlined null node content (positions 4..8) from its boundary
  const res = it.applyB(delta.create().retain(4).delete(4))
  t.compare(res.a, delta.create().retain(4).delete(1))
  const doc = structuredSomeText()
  doc.apply(res.a)
  t.compare(doc, delta.create().insert('some'))
}

export const testInlineNullNodesDeleteAcrossBoundary = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // delete positions 3..6 of "sometext" -> "e" (root) + "te" (inside null node)
  const res = it.applyB(delta.create().retain(3).delete(3))
  t.compare(res.a, delta.create().retain(3).delete(1).modify(delta.create().delete(2)))
  const doc = structuredSomeText()
  doc.apply(res.a)
  t.compare(doc, delta.create().insert('som').insert([delta.create().insert('xt')]))
}

export const testInlineNullNodesInsertAtEnd = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  const res = it.applyB(delta.create().retain(8).insert('!'))
  t.compare(res.a, delta.create().retain(5).insert('!'))
}

export const testInlineNullNodesInteriorDeleteToEnd = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // delete from inside the null node (offset 1) to its end -> interior delete crossing the boundary
  const res = it.applyB(delta.create().retain(5).delete(3))
  t.compare(res.a, delta.create().retain(4).modify(delta.create().retain(1).delete(3)))
  const doc = structuredSomeText()
  doc.apply(res.a)
  t.compare(doc, delta.create().insert('some').insert([delta.create().insert('t')]))
}

export const testInlineNullNodesRetainPastEnd = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // a retain past the document end exits the retain loop via its end-guard; the insert then appends to root
  const res = it.applyB(delta.create().retain(20).insert('!'))
  t.compare(res.a, delta.create().retain(5).insert('!'))
}

export const testInlineNullNodesDeletePastEnd = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // a delete past the document end exits the delete loop via its end-guard; the whole document is deleted
  const res = it.applyB(delta.create().delete(20))
  t.compare(res.a, delta.create().delete(5))
}

export const testInlineNullNodesModifyAccumulation = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // two inserts that both fall inside the same null node must coalesce into one modify
  const res = it.applyB(delta.create().retain(5).insert('X').retain(1).insert('Z'))
  t.compare(res.a, delta.create().retain(4).modify(delta.create().retain(1).insert('X').retain(1).insert('Z')))
}

export const testInlineNullNodesNamedNodePassThrough = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // a named node among the children is NOT inlined (opaque, length 1)
  const structured = delta.create().insert('a').insert([delta.create('span').insert('x')]).insert('b')
  const res = it.applyA(structured)
  t.compare(res.b, delta.create().insert('a').insert([delta.create('span').insert('x')]).insert('b'))
  // a modify in B targeting the named node passes through verbatim
  const res2 = it.applyB(delta.create().retain(1).modify(delta.create().retain(1).insert('Y')))
  t.compare(res2.a, delta.create().retain(1).modify(delta.create().retain(1).insert('Y')))
}

export const testInlineNullNodesForwardModifyIntoNull = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // data-side edit inside the null node maps to an inlined insert
  const res = it.applyA(delta.create().retain(4).modify(delta.create().retain(1).insert('Q')))
  t.compare(res.b, delta.create().retain(5).insert('Q'))
}

export const testInlineNullNodesForwardModifyNamedInNull = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // null node holding text and a named node; named node stays opaque in the inlined view
  it.applyA(delta.create().insert([delta.create().insert('x').insert([delta.create('b').insert('y')])]))
  // data-side modify into the null node whose inner modify edits the nested named node
  const res = it.applyA(delta.create().modify(delta.create().retain(1).modify(delta.create().retain(1).insert('Z'))))
  t.compare(res.b, delta.create().retain(1).modify(delta.create().retain(1).insert('Z')))
}

export const testInlineNullNodesEmptyNull = () => {
  const it = inline([null]).init(delta.$deltaAny)
  const structured = delta.create().insert('ab').insert([delta.create()]).insert('cd')
  const res = it.applyA(structured)
  // the empty null node is zero-width inlined
  t.compare(res.b, delta.create().insert('abcd'))
  // an insert at the empty node's position lands in the root (after the empty node)
  const res2 = it.applyB(delta.create().retain(2).insert('X'))
  t.compare(res2.a, delta.create().retain(3).insert('X'))
}

export const testInlineNullNodesAttrs = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // node attributes pass through; only the children are transformed
  const structured = delta.create().setAttr('k', 1).insert('a').insert([delta.create().insert('b')])
  const res = it.applyA(structured)
  t.compare(res.b, delta.create().setAttr('k', 1).insert('ab'))
  const res2 = it.applyB(delta.create().setAttr('k', 2))
  t.compare(res2.a, delta.create().setAttr('k', 2))
}

export const testInlineNullNodesForwardDelete = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // a structured delete of the null node maps to deleting its whole inlined span
  const res = it.applyA(delta.create().retain(4).delete(1))
  t.compare(res.b, delta.create().retain(4).delete(4))
}

export const testInlineNullNodesForwardModifyDelete = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // data-side delete inside the null node maps to an inlined delete
  const res = it.applyA(delta.create().retain(4).modify(delta.create().retain(1).delete(1)))
  t.compare(res.b, delta.create().retain(5).delete(1))
}

export const testInlineNullNodesForwardModifyNamed = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // a named node at the root is opaque; a data-side modify of it is forwarded verbatim
  it.applyA(delta.create().insert([delta.create('span').insert('x')]))
  const res = it.applyA(delta.create().modify(delta.create().retain(1).insert('Z')))
  t.compare(res.b, delta.create().modify(delta.create().retain(1).insert('Z')))
}

export const testInlineNullNodesBackwardModifyIntoNull = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // null node holding text and a named node
  it.applyA(delta.create().insert([delta.create().insert('x').insert([delta.create('b').insert('y')])]))
  // a B-edit modifying the named node (inlined position 1, inside the null node) descends via modify
  const res = it.applyB(delta.create().retain(1).modify(delta.create().retain(1).insert('Z')))
  t.compare(res.a, delta.create().modify(delta.create().retain(1).modify(delta.create().retain(1).insert('Z'))))
}

export const testInlineNullNodesBackwardModifyNamedAtEnd = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // a named node immediately followed by a null node: modifying the named node crosses the boundary
  it.applyA(delta.create().insert([delta.create('span').insert('x')]).insert([delta.create().insert('t')]))
  const res = it.applyB(delta.create().modify(delta.create().retain(1).insert('Z')))
  t.compare(res.a, delta.create().modify(delta.create().retain(1).insert('Z')))
}

// --- deleting a null node maps to deleting its whole inlined range ---

export const testInlineNullNodesDeleteNullTypeNested = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // null node holding text 'x', a named <b>y</b> and text 'z' => inlined length 1+1+1 = 3
  it.applyA(delta.create().insert('a').insert([delta.create().insert('x').insert([delta.create('b').insert('y')]).insert('z')]).insert('c'))
  // delete the null node (one structured position) => delete its whole mapped inline range
  const res = it.applyA(delta.create().retain(1).delete(1))
  t.compare(res.b, delta.create().retain(1).delete(3))
}

export const testInlineNullNodesDeleteAcrossNullTypes = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // 'a' + null('xy') + null('z') + 'b'  => inline 'a'(1) 'xy'(2) 'z'(1) 'b'(1)
  it.applyA(delta.create().insert('a').insert([delta.create().insert('xy')]).insert([delta.create().insert('z')]).insert('b'))
  // delete both null nodes (two structured positions) => delete their combined inline range (2+1)
  const res = it.applyA(delta.create().retain(1).delete(2))
  t.compare(res.b, delta.create().retain(1).delete(3))
}

// --- format passthrough ---

export const testInlineNullNodesFormatRender = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // a null node whose text is bold; the surrounding text is plain
  const res = it.applyA(delta.create().insert('a').insert([delta.create().insert('x', { bold: true })]))
  // the inlined view keeps the null node child's own format
  t.compare(res.b, delta.create().insert('a').insert('x', { bold: true }))
}

export const testInlineNullNodesFormatForwardInsert = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // a formatted insert at the root maps straight through
  const res = it.applyA(delta.create().retain(2).insert('Q', { bold: true }))
  t.compare(res.b, delta.create().retain(2).insert('Q', { bold: true }))
}

export const testInlineNullNodesFormatForwardRetain = () => {
  const it = inline([null]).init(delta.$deltaAny)
  // 'some' + null('text') + 'end'
  it.applyA(delta.create().insert('some').insert([delta.create().insert('text')]).insert('end'))
  // format 'some' bold; format the null node wrapper italic (dropped - no inlined wrapper); 'end' under
  const res = it.applyA(delta.create().retain(4, { bold: true }).retain(1, { italic: true }).retain(3, { under: true }))
  t.assert(res.a === null)
  // bold passes through, the null node's inline range is retained plain, under passes through
  t.compare(res.b, delta.create().retain(4, { bold: true }).retain(4).retain(3, { under: true }))
}

export const testInlineNullNodesBackwardFormatRetainRoot = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // format inline positions 2..3 (root text 'me') bold => pass-through retain on A
  const res = it.applyB(delta.create().retain(2).retain(2, { bold: true }))
  t.compare(res.a, delta.create().retain(2).retain(2, { bold: true }))
}

export const testInlineNullNodesBackwardFormatRetainIntoNull = () => {
  const it = inline([null]).init(delta.$deltaAny)
  it.applyA(structuredSomeText())
  // format inline positions 5..7 ('ext', inside the null node) bold => a modify on the null node
  const res = it.applyB(delta.create().retain(5).retain(3, { bold: true }))
  t.compare(res.a, delta.create().retain(4).modify(delta.create().retain(1).retain(3, { bold: true })))
}

export const testInlineNullNodesInPipe = () => {
  // composes as a pipe Template: Pipe construction reads each template's `stateless`, and the
  // resulting pipe is stateful because inline is.
  const tpl = pipe(inline([null]))
  t.assert(tpl.stateless === false)
  t.assert(inline([null]).stateless === false)
}

/**
 * The transformer is typed loosely: `init($in)` yields a `Transformer<IN, any>`, so it validates
 * against the input schema with a `DeltaAny` output side. (Precise compile-time output shapes were
 * intentionally dropped when inlining became configurable via `names`.)
 */
export const testInlineNullNodesTyping = () => {
  const $in = delta.$delta({
    name: 'p',
    children: [delta.$delta({ name: 'span' }), delta.$delta({ text: true, children: delta.$delta({ name: 'b' }) })]
  })
  const it = inline([null]).init($in)
  t.assert(transformerWith($in, delta.$deltaAny).validate(it))
}

// --- named-node inlining (the configurable `names`) ---

export const testInlineNamed = () => {
  const it = inline(['b']).init(delta.$deltaAny)
  // <b> is inlined by name: a<b>xy</b>c -> axyc
  const structured = delta.create().insert('a').insert([delta.create('b').insert('xy')]).insert('c')
  const res = it.applyA(structured)
  t.compare(res.b, delta.create().insert('axyc'))
  // a B-side insert interior to the inlined <b> (inlined offset 2) maps back to a modify on <b>
  const res2 = it.applyB(delta.create().retain(2).insert('Y'))
  t.compare(res2.a, delta.create().retain(1).modify(delta.create().retain(1).insert('Y')))
  const doc = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('a').insert([delta.create('b').insert('xy')]).insert('c'))
  doc.apply(res2.a)
  t.compare(doc, delta.create().insert('a').insert([delta.create('b').insert('xYy')]).insert('c'))
}

export const testInlineMixed = () => {
  const it = inline(['b', null]).init(delta.$deltaAny)
  // both a named <b> and an anonymous null node are inlined; <span> stays opaque
  const structured = delta.create()
    .insert([delta.create('b').insert('x')])
    .insert([delta.create('span').insert('s')])
    .insert([delta.create().insert('y')])
  const res = it.applyA(structured)
  t.compare(res.b, delta.create().insert('x').insert([delta.create('span').insert('s')]).insert('y'))
  // deleting the opaque <span> at inlined position 1 (after the inlined <b>'s 'x') passes through as a
  // structural delete after the retained <b>
  const res2 = it.applyB(delta.create().retain(1).delete(1))
  t.compare(res2.a, delta.create().retain(1).delete(1))
}

// --- fuzz round-trip ---

/**
 * Reference one-level inliner, used as an independent oracle: splice the children of every direct
 * child whose name is in `names` into the parent verbatim; leave text and opaque (non-inlined) nodes
 * alone.
 *
 * @param {delta.DeltaAny} d
 * @param {Array<string|null>} names
 * @return {delta.DeltaAny}
 */
const refInline = (d, names) => {
  const out = delta.create()
  for (const op of d.children) {
    if (delta.$textOp.check(op)) {
      out.insert(op.insert, op.format, op.attribution)
    } else if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (delta.$deltaAny.check(el) && names.includes(el.name)) {
          // an inline node's children are spliced in verbatim (keeping their own formats); the
          // wrapper - and any format on it - has no inlined representation and is dropped.
          out.append(el)
        } else {
          out.insert([el], op.format, op.attribution)
        }
      }
    }
  }
  return out.done(false)
}

/**
 * @param {prng.PRNG} gen
 */
const genNullNode = gen => {
  const nn = delta.create()
  for (let i = prng.int32(gen, 0, 3); i > 0; i--) {
    prng.oneOf(gen, [
      () => { nn.insert(prng.word(gen, 1, 4)) },
      () => { nn.insert([delta.create('b').insert(prng.word(gen, 1, 3))]) }
    ])()
  }
  return nn
}

/**
 * A random settled structured document: a mix of text runs, named nodes and null nodes.
 *
 * @param {prng.PRNG} gen
 */
const genStructured = gen => {
  const d = delta.create()
  for (let i = prng.int32(gen, 0, 5); i > 0; i--) {
    prng.oneOf(gen, [
      () => { d.insert(prng.word(gen, 1, 5)) },
      () => { d.insert([delta.create('span').insert(prng.word(gen, 1, 4))]) },
      () => { d.insert([genNullNode(gen)]) }
    ])()
  }
  return d
}

/**
 * Positions of node (delta) children within a state, for targeting `modify` ops.
 *
 * @param {delta.DeltaAny} state
 * @return {Array<{ pos: number, node: delta.DeltaAny }>}
 */
const nodePositions = state => {
  /**
   * @type {Array<{ pos: number, node: delta.DeltaAny }>}
   */
  const out = []
  let pos = 0
  for (const op of state.children) {
    if (delta.$textOp.check(op)) {
      pos += op.insert.length
    } else if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (delta.$deltaAny.check(el)) out.push({ pos, node: el })
        pos += 1
      }
    }
  }
  return out
}

/**
 * A random change valid for a state of length `state.childCnt`. `allowNullNodes` is only enabled for
 * structured (A-side) edits - a raw null node in an inlined (B-side) edit would not round-trip,
 * because the reference inliner would flatten it. `depth` bounds nested `modify` ops.
 *
 * @param {prng.PRNG} gen
 * @param {delta.DeltaAny} state
 * @param {boolean} allowNullNodes
 * @param {number} depth
 * @return {delta.DeltaBuilderAny}
 */
const genEdit = (gen, state, allowNullNodes, depth = 2) => {
  const nodes = depth > 0 ? nodePositions(state) : []
  if (nodes.length > 0 && prng.int32(gen, 0, 2) === 0) {
    // modify a random child node, recursing into its children
    const target = prng.oneOf(gen, nodes)
    const m = /** @type {delta.DeltaBuilderAny} */ (delta.create())
    m.retain(target.pos)
    m.modify(genEdit(gen, target.node, allowNullNodes, depth - 1))
    return m
  }
  const edit = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  const len = state.childCnt
  let pos = 0
  for (let i = prng.int32(gen, 1, 5); i > 0; i--) {
    const remaining = len - pos
    /**
     * @type {Array<() => void>}
     */
    const ops = [
      () => { edit.insert(prng.word(gen, 1, 4)) },
      () => { edit.insert([delta.create('em').insert(prng.word(gen, 1, 3))]) }
    ]
    if (allowNullNodes) {
      ops.push(() => { edit.insert([genNullNode(gen)]) })
    }
    if (remaining > 0) {
      ops.push(() => { const r = prng.int32(gen, 1, remaining); edit.retain(r); pos += r })
      ops.push(() => { const dl = prng.int32(gen, 1, remaining); edit.delete(dl); pos += dl })
    }
    prng.oneOf(gen, ops)()
  }
  return edit
}

/**
 * Drive random changes through the transformer in both directions and assert that the inlined view
 * stays equal to the reference inlining of the structured view after every step.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatInlineNullNodes = tc => {
  const gen = tc.prng
  const it = inline([null]).init(delta.$deltaAny)
  const myA = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  const myB = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  const check = () => t.compare(refInline(myA, [null]), myB, 'inline(A) === B')
  /**
   * @param {delta.DeltaBuilderAny} da
   */
  const stepA = da => {
    const res = it.applyA(da)
    myA.apply(da)
    if (res.b) myB.apply(res.b)
    check()
  }
  /**
   * @param {delta.DeltaBuilderAny} db
   */
  const stepB = db => {
    const res = it.applyB(db)
    myB.apply(db)
    if (res.a) myA.apply(res.a)
    check()
  }
  // initial render
  stepA(genStructured(gen))
  for (let i = prng.int32(gen, 1, 10); i > 0; i--) {
    if (prng.bool(gen)) {
      stepA(genEdit(gen, myA, true))
    } else {
      stepB(genEdit(gen, myB, false))
    }
  }
}

/**
 * A richer settled structured document (guaranteed non-trivial): several text runs, named nodes -
 * some empty, some with children - and several null nodes holding text and nested named nodes.
 *
 * @param {prng.PRNG} gen
 */
const genComplexStructured = gen => {
  const d = delta.create()
  for (let i = prng.int32(gen, 4, 9); i > 0; i--) {
    prng.oneOf(gen, [
      () => { d.insert(prng.word(gen, 1, 6)) },
      () => { d.insert([delta.create('span').insert(prng.word(gen, 1, 4))]) },
      () => { d.insert([delta.create('img')]) },
      () => { d.insert([genNullNode(gen)]) },
      () => { d.insert([genNullNode(gen)]) }
    ])()
  }
  return d
}

/**
 * Fuzz the incremental transformer against a one-shot render. Render a complex document, then drive
 * randomly generated changes on either side, keeping the live structured (`myA`) and inlined
 * (`myB`) states in sync via the transformer. After every step, fully transform the entire current
 * `myA` with a *fresh* transformer and assert the result equals the live `myB` - i.e. the
 * incremental `applyA`/`applyB` never drift from a from-scratch transformation.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatInlineNullNodesFullTransform = tc => {
  const gen = tc.prng
  const it = inline([null]).init(delta.$deltaAny)
  const myA = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  const myB = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  /**
   * Transform the whole structured state in one shot with a fresh transformer.
   *
   * @param {delta.DeltaBuilderAny} a
   */
  const fullTransform = a => inline([null]).init(delta.$deltaAny).applyA(a).b
  const check = () => t.compare(fullTransform(myA), myB, 'fullTransform(A) === B')
  /**
   * @param {delta.DeltaBuilderAny} da
   */
  const stepA = da => {
    const res = it.applyA(da)
    myA.apply(da)
    if (res.b) myB.apply(res.b)
    check()
  }
  /**
   * @param {delta.DeltaBuilderAny} db
   */
  const stepB = db => {
    const res = it.applyB(db)
    myB.apply(db)
    if (res.a) myA.apply(res.a)
    check()
  }
  // 1. initial transformation of a complex document
  stepA(genComplexStructured(gen))
  // 2. apply several random changes on either side, checking the full-transform oracle each time
  for (let i = prng.int32(gen, 3, 12); i > 0; i--) {
    if (prng.bool(gen)) {
      stepA(genEdit(gen, myA, true))
    } else {
      stepB(genEdit(gen, myB, false))
    }
  }
}

// Schema-driven fuzz: instead of hand-built edits, generate whole random deltas with
// `delta.random` (which now also produces retain and node `modify` ops). Two schemas mirror the two
// sides: structured (A) admits null nodes; inlined (B) does not (a raw null node in a B-side change
// would not round-trip, since inlining flattens it). `<b>` is a leaf node that appears both inside
// null nodes (structured) and at the top level (inlined view of a null node's children).
// optional format keys so `delta.random` drops each ~50% of the time, varying the format sets it
// puts on text, inserts and retains - exercising the transformer's format passthrough.
const $fmt = { bold: s.$boolean.optional, em: s.$boolean.optional }
const $bNode = delta.$delta({ name: 'b', text: true, formats: $fmt })
const $spanNode = delta.$delta({ name: 'span', text: true, formats: $fmt })
const $nullNode = delta.$delta({ text: true, children: $bNode, formats: $fmt })
const $structuredDoc = delta.$delta({ text: true, children: s.$union($nullNode, $spanNode), formats: $fmt })
const $inlinedDoc = delta.$delta({ text: true, children: s.$union($bNode, $spanNode), formats: $fmt })

/**
 * Fuzz the transformer with schema-generated random deltas (text, named/null node inserts, retains,
 * deletes and node `modify` ops). After every step assert both that the inlined view matches the
 * reference inlining of A and that a from-scratch transform of A reproduces the live B.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatInlineNullNodesRandom = tc => {
  const gen = tc.prng
  const it = inline([null]).init(delta.$deltaAny)
  const myA = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  const myB = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  const fullTransform = () => inline([null]).init(delta.$deltaAny).applyA(myA).b
  const check = () => {
    t.compare(refInline(myA, [null]), myB, 'inline(A) === B')
    t.compare(fullTransform(), myB, 'fullTransform(A) === B')
  }
  /**
   * @param {delta.DeltaBuilderAny} da
   */
  const stepA = da => {
    const res = it.applyA(da)
    myA.apply(da)
    if (res.b) myB.apply(res.b)
    check()
  }
  /**
   * @param {delta.DeltaBuilderAny} db
   */
  const stepB = db => {
    const res = it.applyB(db)
    myB.apply(db)
    if (res.a) myA.apply(res.a)
    check()
  }
  // initial render: a random structured document (no source => pure inserts)
  stepA(/** @type {delta.DeltaBuilderAny} */ (delta.random(gen, $structuredDoc)))
  for (let i = prng.int32(gen, 1, 10); i > 0; i--) {
    if (prng.bool(gen)) {
      stepA(/** @type {delta.DeltaBuilderAny} */ (delta.random(gen, $structuredDoc, { source: myA })))
    } else {
      stepB(/** @type {delta.DeltaBuilderAny} */ (delta.random(gen, $inlinedDoc, { source: myB })))
    }
  }
}

// Schema-driven fuzz for NAMED inlining (`inline(['b'])`): `<b>` nodes (holding text and opaque `<i>`
// leaves) are inlined; `<i>`/`<span>` stay opaque. The inlined side admits `<i>`/`<span>` but not
// `<b>` (a raw `<b>` in a B-side change would be flattened and not round-trip). This exercises the
// name-membership branch with a non-null name.
const $fmtNamed = { bold: s.$boolean.optional }
const $iLeaf = delta.$delta({ name: 'i', text: true, formats: $fmtNamed })
const $spanLeaf = delta.$delta({ name: 'span', text: true, formats: $fmtNamed })
const $bInline = delta.$delta({ name: 'b', text: true, children: $iLeaf, formats: $fmtNamed })
const $structuredNamed = delta.$delta({ text: true, children: s.$union($bInline, $spanLeaf), formats: $fmtNamed })
const $inlinedNamed = delta.$delta({ text: true, children: s.$union($iLeaf, $spanLeaf), formats: $fmtNamed })

/**
 * Fuzz `inline(['b'])` with schema-generated random deltas. After every step the inlined view must
 * equal both the reference inlining of A (with names `['b']`) and a from-scratch transform of A.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatInlineNamed = tc => {
  const gen = tc.prng
  const it = inline(['b']).init(delta.$deltaAny)
  const myA = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  const myB = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  const fullTransform = () => inline(['b']).init(delta.$deltaAny).applyA(myA).b
  const check = () => {
    t.compare(refInline(myA, ['b']), myB, 'inline(A) === B')
    t.compare(fullTransform(), myB, 'fullTransform(A) === B')
  }
  /**
   * @param {delta.DeltaBuilderAny} da
   */
  const stepA = da => {
    const res = it.applyA(da)
    myA.apply(da)
    if (res.b) myB.apply(res.b)
    check()
  }
  /**
   * @param {delta.DeltaBuilderAny} db
   */
  const stepB = db => {
    const res = it.applyB(db)
    myB.apply(db)
    if (res.a) myA.apply(res.a)
    check()
  }
  stepA(/** @type {delta.DeltaBuilderAny} */ (delta.random(gen, $structuredNamed)))
  for (let i = prng.int32(gen, 1, 10); i > 0; i--) {
    if (prng.bool(gen)) {
      stepA(/** @type {delta.DeltaBuilderAny} */ (delta.random(gen, $structuredNamed, { source: myA })))
    } else {
      stepB(/** @type {delta.DeltaBuilderAny} */ (delta.random(gen, $inlinedNamed, { source: myB })))
    }
  }
}
