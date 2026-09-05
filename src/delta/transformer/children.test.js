import * as t from 'lib0/testing'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { pipe } from '../transformer.js'
import { inline } from './inline.js'
import { renameAttrs } from './rename-attrs.js'
import { children } from './children.js'

// ---------------------------------------------------------------------------
// children
//
// Descends one level into a node's child *nodes* and applies a per-child sub-transformer chosen by
// the handler. Attributes and text pass through. Designed to compose recursively.
// ---------------------------------------------------------------------------

export const testChildrenRenameChild = () => {
  const it = children(delta.$delta({ children: delta.$delta('p', { attrs: { a: s.$number } }) }), (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  // inserting a child node transforms its initial content (attr a -> b)
  const r1 = it.applyA(delta.insert([delta.create('p', { a: 1 })]))
  t.compare(r1.b, delta.insert([delta.create('p', { b: 1 })]))
  t.assert(r1.a === null)
  // a modify on that child is routed through its sub-transformer
  const r2 = it.applyA(delta.modify(delta.setAttr('a', 2)))
  t.compare(r2.b, delta.modify(delta.setAttr('b', 2)))
  // and the reverse direction maps back
  const r3 = it.applyB(delta.modify(delta.setAttr('b', 3)))
  t.compare(r3.a, delta.modify(delta.setAttr('a', 3)))
}

export const testChildrenNullPassThrough = () => {
  // handler returning null leaves children untransformed and maintains no state for them
  const it = children(delta.$delta({ children: [delta.$delta('p', { attrs: { a: s.$number } }), s.$object({ embed: s.$number })] }), (_c, _$c) => null).init()
  const r1 = it.applyA(delta.insert([delta.create('p', { a: 1 })]).insert([{ embed: 1 }]))
  t.compare(r1.b, delta.insert([delta.create('p', { a: 1 })]).insert([{ embed: 1 }]))
  const r2 = it.applyA(delta.modify(delta.setAttr('a', 2)))
  t.compare(r2.b, delta.modify(delta.setAttr('a', 2)))
}

export const testChildrenAttrsAndTextUntouched = () => {
  // the parent's own attrs pass through; text children get no sub-transformer
  const it = children(delta.$delta({ attrs: { root: s.$number }, text: true, children: delta.$delta('p', { attrs: { a: s.$number } }) }), (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  const doc = delta.create(null, { root: 1 }).insert('hi').insert([delta.create('p', { a: 1 })])
  const r = it.applyA(doc)
  t.compare(r.b, delta.create(null, { root: 1 }).insert('hi').insert([delta.create('p', { b: 1 })]))
  // the node sits at position 2 (after "hi"): a retain over the text lands the cursor on it
  const r2 = it.applyA(delta.retain(2).modify(delta.setAttr('a', 9)))
  t.compare(r2.b, delta.retain(2).modify(delta.setAttr('b', 9)))
}

export const testChildrenDeleteAlignment = () => {
  const it = children(delta.$delta({ children: [delta.$delta('x', { attrs: { a: s.$number } }), delta.$delta('y', { attrs: { a: s.$number } })] }), (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  it.applyA(delta.insert([delta.create('x', { a: 1 }), delta.create('y', { a: 2 })]))
  // delete the first node, then modify what is now first (the former 'y') - childTs must stay aligned
  const r = it.applyA(delta.delete_(1).modify(delta.setAttr('a', 5)))
  t.compare(r.b, delta.delete_(1).modify(delta.setAttr('b', 5)))
}

export const testChildrenTrailingUntouched = () => {
  // the sparse childTs map must preserve sub-transformers for positions a change leaves untouched (the
  // implicit trailing retain). Regression: an earlier rebuild dropped the tail.
  const it = children(delta.$delta({ text: true, children: [delta.$delta('x', { attrs: { a: s.$number } }), delta.$delta('y', { attrs: { a: s.$number } })] }), (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  it.applyA(delta.insert([delta.create('x', { a: 1 }), delta.create('y', { a: 2 })]).insert('tail'))
  // a change that only modifies the FIRST node, leaving the second node and the trailing text untouched
  it.applyA(delta.modify(delta.setAttr('a', 9)))
  // the second node's sub-transformer still routes (a->b); the trailing text still maps positionally
  const r = it.applyA(delta.retain(1).modify(delta.setAttr('a', 7)))
  t.compare(r.b, delta.retain(1).modify(delta.setAttr('b', 7)))
  // and an edit landing in the trailing text passes through at the right offset
  const r2 = it.applyA(delta.retain(2).insert('!'))
  t.compare(r2.b, delta.retain(2).insert('!'))
}

export const testChildrenDeleteSpansNodeAndText = () => {
  // a delete that fully consumes a map op (the first node) and continues through the text gap into the
  // next node - exercises the cursor advancing across nodes inside `drop`
  const it = children(delta.$delta({ text: true, children: [delta.$delta('p', { attrs: { a: s.$number } }), delta.$delta('q', { attrs: { a: s.$number } })] }), (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  it.applyA(delta.insert([delta.create('p', { a: 1 })]).insert('hi').insert([delta.create('q', { a: 2 })]))
  const r = it.applyA(delta.delete_(3).modify(delta.setAttr('a', 5)))
  t.compare(r.b, delta.delete_(3).modify(delta.setAttr('b', 5)))
}

export const testChildrenInsertBackward = () => {
  // a child node inserted on the B side is transformed back to A through its sub-transformer
  const it = children(delta.$delta({ children: delta.$delta('p', { attrs: { a: s.$number } }) }), (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  const r = it.applyB(delta.insert([delta.create('p', { b: 1 })]))
  t.compare(r.a, delta.insert([delta.create('p', { a: 1 })]))
}

// Recursive composition: inline every anonymous node at every depth. `inlineAll` is the recurse-into-
// children half; the entry point pairs it with a top-level inline via pipe.
// reason: a recursive `const` has no inferable type, so the self-reference needs an explicit widened
// TemplateFactory<any,any> annotation to break the cycle.
/** @type {import('./core.js').TemplateFactory<any,any>} */
const inlineAll = $d => children($d, (_c, $c) => pipe($c, $c1 => inline($c1, [null]), inlineAll))

export const testChildrenInlineAllRecursive = () => {
  // reason: PipeTransformer narrows r.b to the pipe's normalized input conf (not `any`), so it won't
  // statically match the hand-built expected deltas; widen `it` to any for the structural comparisons.
  const it = /** @type {any} */ (pipe(delta.$deltaAny, $d => inline($d, [null]), inlineAll).init())
  // root -> p( "x", <>z</>, "y" ): the null node one level down is inlined
  const doc = delta.insert([
    delta.create('p').insert('x').insert([delta.insert('z')]).insert('y')
  ])
  const r = it.applyA(doc)
  t.compare(r.b, delta.insert([delta.create('p', null, 'xzy')]))
  // backward: an insert at the very start of p maps to p's root (boundary preference), through the
  // recursion
  const rb = it.applyB(delta.modify(delta.insert('!')))
  t.compare(rb.a, delta.modify(delta.insert('!')))
}

export const testChildrenInlineAllDeep = () => {
  // reason: same pipe-output narrowing as testChildrenInlineAllRecursive - widen `it` to any.
  const it = /** @type {any} */ (pipe(delta.$deltaAny, $d => inline($d, [null]), inlineAll).init())
  // three levels: root -> p -> q( "m", <>n</>, "o" )
  const doc = delta.insert([
    delta.create('p', null, [
      delta.create('q').insert('m').insert([delta.insert('n')]).insert('o')
    ])
  ])
  const r = it.applyA(doc)
  t.compare(r.b, delta.insert([
    delta.create('p', null, [delta.create('q', null, 'mno')])
  ]))
}

export const testChildrenInlineAllNestedGap = () => {
  // documented limitation: directly-nested same-type inline nodes only collapse one level per pass
  // reason: same pipe-output narrowing as testChildrenInlineAllRecursive - widen `it` to any.
  const it = /** @type {any} */ (pipe(delta.$deltaAny, $d => inline($d, [null]), inlineAll).init())
  // p( <> <>x</> </> ): outer null is inlined by p's inline; the inner null survives as p's child and
  // is recursed into (its text stays) but not itself flattened
  const doc = delta.insert([
    delta.create('p', null, [delta.insert([delta.insert('x')])])
  ])
  const r = it.applyA(doc)
  t.compare(r.b, delta.insert([
    delta.create('p', null, [delta.insert('x')])
  ]))
}

// Recursive null-node inlining built from `children`: at each level recurse into child nodes, then
// inline that level's null nodes (the user-requested `pipe(recurse, inline)` order - bottom-up, so
// nulls collapse at every depth).
// reason: a recursive `const` has no inferable type, so the self-reference needs an explicit widened
// TemplateFactory<any,any> annotation to break the cycle.
/** @type {import('./core.js').TemplateFactory<any,any>} */
const inlineNullNodesRecursive = $d => children($d, (_c, $c) => pipe($c, inlineNullNodesRecursive, $c1 => inline($c1, [null])))

/**
 * Concatenate all text in document order (depth-first), ignoring node boundaries.
 *
 * @param {delta.DeltaAny} d
 * @return {string}
 */
const allText = d => {
  let s = ''
  for (const op of d.children) {
    if (delta.$textOp.check(op)) {
      s += op.insert
    } else if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if (delta.$deltaAny.check(el)) s += allText(el)
      }
    }
  }
  return s
}

export const testChildrenInlineNullNodesRecursive = () => {
  // reason: PipeTransformer narrows r.b to the pipe's input conf (not `any`), so it won't statically
  // match the hand-built expected deltas; widen the entry transformer to any for the comparisons.
  const entry = () => /** @type {any} */ (pipe(delta.$deltaAny, inlineNullNodesRecursive, $d => inline($d, [null])).init())
  // <div><p>hello<null> world</null></p><null>!!</null></div> (wrapped in a root delta)
  const buildA = () => delta.insert([
    delta.create('div')
      .insert([delta.create('p').insert('hello').insert([delta.insert(' world')])])
      .insert([delta.insert('!!')])
  ])
  const it = entry()
  // initial render: every null node is inlined into its parent, recursively at every depth
  const r0 = it.applyA(buildA())
  t.compare(r0.b, delta.insert([
    delta.create('div').insert([delta.create('p', null, 'hello world')]).insert('!!')
  ]))
  t.compare(allText(r0.b), 'hello world!!', 'the inlined text reads "hello world!!"')

  // live states; a from-scratch transform of A must always equal B (incremental oracle)
  // reason: these accumulate edits across a recursive inline document; a precise type would need the
  // full self-referential doc conf, the same self-reference limit as inlineNullNodesRecursive above.
  const myA = /** @type {delta.DeltaBuilderAny} */ (buildA())
  const myB = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  myB.apply(r0.b)
  const fresh = () => entry().applyA(myA).b
  t.compare(fresh(), myB)

  // basic op on A: append "?" to the deep null node " world" (root -> div -> p -> the <null> at p[5])
  const aEdit = delta.modify(delta.modify(delta.retain(5).modify(delta.retain(6).insert('?'))))
  const rA = it.applyA(aEdit)
  myA.apply(aEdit)
  if (rA.b) myB.apply(rA.b)
  // maps to a modify descending div -> p, inserting into the inlined "hello world" text
  t.compare(rA.b, delta.modify(delta.modify(delta.retain(11).insert('?'))))
  t.compare(allText(myB), 'hello world?!!')
  t.compare(fresh(), myB, 'B == inline(A) after the A-side edit')

  // basic op on B: append "?" after the inlined "!!" (B: div = [ p@0, "!!"@1..2 ], insert at div[3])
  const bEdit = delta.modify(delta.retain(3).insert('?'))
  const rB = it.applyB(bEdit)
  myB.apply(bEdit)
  if (rB.a) myA.apply(rB.a)
  // boundary preference: the insert at the inlined null's end lands in the parent (div), after the
  // still-structured null node on side A
  t.compare(rB.a, delta.modify(delta.retain(2).insert('?')))
  t.compare(allText(myA), 'hello world?!!?')
  t.compare(fresh(), myB, 'B == inline(A) after the B-side edit')
}
