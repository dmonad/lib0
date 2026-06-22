import * as t from 'lib0/testing'
import * as delta from './delta.js'
import * as position from './position.js'

// a sample document: text "x", a node holding "hello", text "y" (content length 3)
const markDoc = () => delta.create().insert('x').insert([delta.create().insert('hello')]).insert('y')
/** @param {Array<position.MarkPos>} ps */
const byId = ps => ps.slice().sort((a, b) => a.id < b.id ? -1 : 1)

/**
 * Build a mark-ADD change delta. `addMark` applied to an empty delta yields exactly the change delta
 * the binding would transmit (the internal `markChange`), so these are real mark changes for rebase.
 *
 * @param {Array<string|number>} path
 * @param {string} id
 * @param {-1|1} [assoc]
 * @return {delta.DeltaBuilderAny}
 */
const mkAdd = (path, id, assoc = 1) => {
  const c = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  c.addMark(position.createPos(path, assoc), id)
  return c
}

/**
 * Build a mark-REMOVE change delta. `removeMark` can't be used here: it applies the change with
 * `final: true`, which resolves the deletion away instead of leaving a transmittable delete-mark
 * change. So we construct the change directly — root/attribute-leaf deletes carry `deleteMarks` on the
 * (innermost) delta; a content-index leaf carries them on the leaf `ModifyOp` — mirroring the internal
 * `markChange` builder.
 *
 * @param {Array<string|number>} path
 * @param {string} id
 * @return {delta.DeltaBuilderAny}
 */
const mkDel = (path, id) => {
  /**
   * @param {number} i
   * @return {delta.DeltaBuilderAny}
   */
  const build = i => {
    const c = /** @type {delta.DeltaBuilderAny} */ (delta.create())
    if (i === path.length - 1) { c.deleteMarks = [id]; return c } // leaf carries the deletion on its own marks
    const step = path[i]
    return typeof step === 'string'
      ? /** @type {delta.DeltaBuilderAny} */ (c.modifyAttr(step, build(i + 1)))
      : /** @type {delta.DeltaBuilderAny} */ (c.retain(step).modify(build(i + 1)))
  }
  return build(0)
}

/**
 * TP1 rebase-convergence harness for marks. Two users start from `base` and concurrently produce `d1`
 * (which holds priority) and `d2`; each replays the other after rebasing it. Asserts the two final
 * states agree (structurally and via {@link position.marksToPositions}) and returns the converged
 * positions for the caller to check against the expected outcome.
 *
 * @param {delta.DeltaBuilderAny} base a settled (`done`) document
 * @param {delta.DeltaBuilderAny} d1 the priority side
 * @param {delta.DeltaBuilderAny} d2
 * @return {Array<position.MarkPos>}
 */
const conv = (base, d1, d2) => {
  const a = delta.clone(base).apply(delta.clone(d1), { final: true }).apply(delta.clone(d2).rebase(d1, false), { final: true })
  const b = delta.clone(base).apply(delta.clone(d2), { final: true }).apply(delta.clone(d1).rebase(d2, true), { final: true })
  t.compare(a, b, 'states converge (incl. marks)')
  const pa = byId(position.marksToPositions(a))
  t.compare(pa, byId(position.marksToPositions(b)), 'mark positions converge')
  return pa
}

/** A settled 10-char text document. */
const text10 = () => /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('0123456789').done())
/** A settled document with one child node holding "hello" at content index 0. */
const nodeDoc = () => /** @type {delta.DeltaBuilderAny} */ (delta.create().insert([delta.create().insert('hello')]).done())

export const testPositionConstructors = () => {
  // `pos(...)` is right gravity; `createPos` takes an explicit assoc
  t.compare(position.pos('a', 1), { path: ['a', 1], assoc: 1 })
  t.compare(position.pos(), { path: [], assoc: 1 })
  t.compare(position.createPos([2, 3], -1), { path: [2, 3], assoc: -1 })
  t.compare(position.createPos([2, 3]), { path: [2, 3], assoc: 1 })
}

export const testPositionEquals = () => {
  t.assert(position.equals(position.pos('a', 1), position.createPos(['a', 1], 1)))
  t.assert(position.equals(position.pos(), position.pos()))
  // differs by assoc / length / a step
  t.assert(!position.equals(position.pos('a', 1), position.createPos(['a', 1], -1)))
  t.assert(!position.equals(position.pos(1), position.pos(1, 2)))
  t.assert(!position.equals(position.pos('a', 1), position.pos('a', 2)))
  t.assert(!position.equals(position.pos('a'), position.pos('b')))
}

export const testPositionSchema = () => {
  t.assert(position.$pos.check(position.pos('a', 1)))
  t.assert(position.$pos.check(position.createPos([], -1)))
  t.assert(!position.$pos.check({ path: ['a', 1] })) // missing assoc
  t.assert(!position.$pos.check({ path: [{ child: 1 }], assoc: 1 })) // step must be string|number
  t.assert(!position.$pos.check({ path: [], assoc: 0 })) // assoc must be -1|1
}

export const testMarkAddAndReconstruct = () => {
  // root, nested-into-a-node, and attribute-leaf marks all round-trip through marksToPositions
  const d = markDoc()
  d.addMark(position.createPos([2], 1), 'root')
  d.addMark(position.createPos([1, 2], -1), 'nested')
  t.assert(d.maybeHasMarks === true)
  t.compare(byId(position.marksToPositions(d)), [
    { id: 'nested', path: [1, 2], assoc: -1 },
    { id: 'root', path: [2], assoc: 1 }
  ])
  // schema accepts a reconstructed position
  t.assert(position.$markPos.check(position.marksToPositions(d)[0]))
}

export const testMarkAutoIdAndCustomAttributes = () => {
  const d = markDoc()
  // addMark returns the id; without one it generates a fresh GUID
  const id = d.addMark(position.createPos([1, 2], 1))
  t.assert(typeof id === 'string' && id.length > 0)
  t.compare(position.marksToPositions(d), [{ id, path: [1, 2], assoc: 1 }])
  // customAttributes are carried with the mark and surfaced in the reconstructed position
  const d2 = markDoc()
  d2.addMark(position.createPos([2], 1), 'c', { color: 'red' })
  const ps = position.marksToPositions(d2)
  t.compare(ps, [{ id: 'c', path: [2], assoc: 1, customAttributes: { color: 'red' } }])
  t.assert(position.$markPos.check(ps[0]))
}

export const testMarkToJSON = () => {
  const d = markDoc()
  d.addMark(position.createPos([2], 1), 'root', { color: 'red' })
  d.addMark(position.createPos([1, 2], -1), 'nested')
  const json = /** @type {any} */ (d.toJSON())
  // a node's own marks are emitted (root marks here, with customAttributes), sorted by id
  t.compare(json.marks, [{ id: 'root', key: 2, assoc: 1, customAttributes: { color: 'red' } }])
  // a nested mark rides on the child node's JSON
  t.compare(json.children[1].insert[0].marks, [{ id: 'nested', key: 2, assoc: -1 }])
  // a nested mark in a change rides on the modify's value (its own root marks/deleteMarks)
  const inner = delta.create()
  inner.addMark(position.createPos([0], 1), 'm')
  inner.deleteMarks = ['gone']
  const change = delta.create().retain(1).modify(inner)
  const ch = /** @type {any} */ (change.toJSON())
  t.compare(ch.children[1].value.marks, [{ id: 'm', key: 0, assoc: 1 }])
  t.compare(ch.children[1].value.deleteMarks, ['gone'])
  // root deleteMarks serialize too
  const rd = delta.create()
  rd.deleteMarks = ['x']
  t.compare(/** @type {any} */ (rd.toJSON()).deleteMarks, ['x'])
  // cloning a change preserves the mark-bearing modify value
  const cl = /** @type {any} */ (delta.clone(change)).toJSON()
  t.compare(cl.children[1].value.marks, [{ id: 'm', key: 0, assoc: 1 }])
  t.compare(cl.children[1].value.deleteMarks, ['gone'])
}

export const testMarkClassCopyEquality = () => {
  const m = delta.createMark(5, 'x', 1, { a: 1 })
  // copy() is an identical Mark; copy(key) moves it — t.compare exercises the equality trait
  t.compare(m, m.copy())
  t.compare(m.copy(7), delta.createMark(7, 'x', 1, { a: 1 }))
  // (inequality by id / key / assoc / customAttributes is covered via delta equality below)
}

export const testMarkDeepAndAttrNested = () => {
  // a mark two levels deep
  const deep = delta.create().insert([delta.create().insert([delta.create().insert('abcde')])])
  deep.addMark(position.createPos([0, 0, 2], 1), 'x')
  t.assert(deep.maybeHasMarks === true)
  t.compare(position.marksToPositions(deep), [{ id: 'x', path: [0, 0, 2], assoc: 1 }])
  // a mark inside a delta-valued attribute
  const rich = delta.create().setAttr('rich', delta.create().insert('hi'))
  rich.addMark(position.createPos(['rich', 1], 1), 'a')
  t.assert(rich.maybeHasMarks === true)
  t.compare(position.marksToPositions(rich), [{ id: 'a', path: ['rich', 1], assoc: 1 }])
  // a mark pointing at a scalar attribute (attribute leaf)
  const div = delta.create('div').setAttr('title', 'hello')
  div.addMark(position.createPos(['title'], 1), 't')
  t.compare(position.marksToPositions(div), [{ id: 't', path: ['title'], assoc: 1 }])
}

export const testMarkRemove = () => {
  const d = markDoc()
  d.addMark(position.createPos([1, 2], 1), 'nested')
  d.addMark(position.createPos([0], 1), 'root')
  t.assert(d.maybeHasMarks === true)
  t.assert(position.marksToPositions(d).length === 2)
  // removing a non-existent id does not change the live marks (it records a pending, transmittable
  // delete intent instead - see removeMark / testMarkRemoveBuildsChange)
  d.removeMark(position.createPos([1, 2], 1), 'ghost')
  t.assert(position.marksToPositions(d).length === 2)
  d.removeMark(position.createPos([1, 2], 1), 'nested')
  d.removeMark(position.createPos([0], 1), 'root')
  t.compare(position.marksToPositions(d), [])
  // removing from an emptied node likewise leaves no reachable marks
  d.removeMark(position.createPos([1, 2], 1), 'ghost')
  t.compare(position.marksToPositions(d), [])
}

export const testMarkAddRootPositionThrows = () => {
  // a mark needs a terminal step; the root position [] cannot anchor one (regression: used to overflow)
  t.fails(() => { delta.create().insert('hi').addMark(position.createPos([], 1), 'x') })
}

export const testMarkRemoveBuildsChange = () => {
  // `create().removeMark(...)` yields a transmittable delete-mark change (symmetric to `addMark`),
  // at a root content offset, an attribute leaf, and a nested position
  const root = /** @type {delta.DeltaBuilderAny} */ (delta.create()); root.removeMark(position.pos(2), 'cur')
  t.compare(root.deleteMarks, ['cur'])
  const attr = /** @type {delta.DeltaBuilderAny} */ (delta.create()); attr.removeMark(position.createPos(['a'], 1), 'k')
  t.compare(attr.deleteMarks, ['k'])
  const nested = /** @type {delta.DeltaBuilderAny} */ (delta.create()); nested.removeMark(position.createPos([0, 'a'], 1), 'C')
  t.assert(nested.children.start != null) // a modify op carrying the nested deletion (not an empty no-op)
  // A adds a mark, B concurrently deletes it: both replay orders converge (add wins, per the rebase policy)
  const base = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('hello').done())
  const add = /** @type {delta.DeltaBuilderAny} */ (delta.create()); add.addMark(position.pos(1), 'X')
  const del = /** @type {delta.DeltaBuilderAny} */ (delta.create()); del.removeMark(position.pos(1), 'X')
  const a = delta.clone(base).apply(delta.clone(add), { final: true }).apply(delta.clone(del).rebase(add, false), { final: true })
  const b = delta.clone(base).apply(delta.clone(del), { final: true }).apply(delta.clone(add).rebase(del, true), { final: true })
  t.compare(position.marksToPositions(a), position.marksToPositions(b))
}

export const testMarkUpsertReplaces = () => {
  const d = markDoc()
  d.addMark(position.createPos([1, 2], 1), 'c')
  d.addMark(position.createPos([1, 4], 1), 'c') // same id replaces
  t.assert(d.maybeHasMarks === true)
  t.compare(position.marksToPositions(d), [{ id: 'c', path: [1, 4], assoc: 1 }]) // one mark, not two
}

export const testMarkShiftUnderEdits = () => {
  // right gravity at the very end shifts with an insert before it; deleting the node it follows shifts
  // its key left; and (below) a mark inside a wholly-deleted node is dropped
  const d = markDoc() // x(0) <node>(1) y(2)
  d.addMark(position.createPos([3], 1), 'end')
  d.apply(delta.create().insert('AB'), { final: true }) // insert 2 chars at the start
  t.compare(position.marksToPositions(d), [{ id: 'end', path: [5], assoc: 1 }])
  // delete the node (index 3 now) -> mark shifts left by 1
  d.apply(delta.create().retain(3).delete(1), { final: true })
  t.compare(position.marksToPositions(d), [{ id: 'end', path: [4], assoc: 1 }])

  // a mark inside a node is dropped when that node is deleted
  const d2 = markDoc()
  d2.addMark(position.createPos([1, 2], 1), 'in')
  t.assert(d2.maybeHasMarks === true)
  d2.apply(delta.create().retain(1).delete(1), { final: true }) // delete the node
  t.compare(position.marksToPositions(d2), []) // the mark inside the deleted node is gone
}

export const testMarkAssocBoundary = () => {
  const d = delta.create().insert('ab') // childCnt 2
  d.addMark(position.createPos([1], -1), 'L')
  d.addMark(position.createPos([1], 1), 'R')
  d.apply(delta.create().retain(1).insert('X'), { final: true }) // insert exactly at the marks
  // left gravity stays before the insert, right gravity moves after it
  t.compare(byId(position.marksToPositions(d)), [
    { id: 'L', path: [1], assoc: -1 },
    { id: 'R', path: [2], assoc: 1 }
  ])
}

export const testMarkEmptyPreservationAndClone = () => {
  // a content-empty, mark-only delta is not "empty" (so a mark change survives propagation)
  const e = delta.create()
  e.addMark(position.createPos([0], 1), 'r')
  t.assert(!e.isEmpty())
  const del = delta.create()
  del.deleteMarks = ['x'] // a change that only removes a mark is also non-empty
  t.assert(!del.isEmpty())
  // clone preserves marks + counts
  const d = markDoc()
  d.addMark(position.createPos([1, 2], 1), 'c')
  const c = /** @type {delta.DeltaBuilderAny} */ (delta.clone(d))
  t.assert(c.maybeHasMarks === true)
  t.compare(position.marksToPositions(c), [{ id: 'c', path: [1, 2], assoc: 1 }])
  // marks are excluded from equality: a marked doc equals the same content without marks, and marks
  // differing only by customAttributes don't affect equality either
  t.assert(d.equals(markDoc()))
  const a1 = markDoc(); a1.addMark(position.createPos([2], 1), 'c', { x: 1 })
  const a3 = markDoc(); a3.addMark(position.createPos([2], 1), 'c', { x: 2 })
  t.assert(a1.equals(a3))
}

export const testMarkLeafCollapsedAndStringKept = () => {
  // a number-keyed leaf mark covered by a delete collapses to the cut point (it is not dropped)
  const d = delta.create().insert('abcde')
  d.addMark(position.createPos([2], 1), 'm') // between b and c (right gravity)
  d.apply(delta.create().retain(1).delete(2), { final: true }) // delete "bc" — covers the mark
  t.assert(d.maybeHasMarks === true)
  t.compare(position.marksToPositions(d), [{ id: 'm', path: [1], assoc: 1 }])

  // left gravity inside the deletion also collapses to the cut
  const dl = delta.create().insert('abcde')
  dl.addMark(position.createPos([2], -1), 'm')
  dl.apply(delta.create().retain(1).delete(2), { final: true })
  t.compare(position.marksToPositions(dl), [{ id: 'm', path: [1], assoc: -1 }])

  // a string-keyed (attribute-leaf) mark is unaffected by content edits on the same node
  const d2 = /** @type {delta.DeltaBuilderAny} */ (delta.create().setAttr('k', 'v').insert('abc'))
  d2.addMark(position.createPos(['k'], 1), 's')
  d2.apply(delta.create().retain(1).insert('X'), { final: true })
  t.compare(position.marksToPositions(d2), [{ id: 's', path: ['k'], assoc: 1 }])
}

export const testMarkSliceAndClone = () => {
  // clone preserves a node's own root marks (an in-range number key and a string/attribute key)
  const d = /** @type {delta.DeltaBuilderAny} */ (delta.create().setAttr('k', 'v').insert('abcde'))
  d.addMark(position.createPos([3], 1), 'n')
  d.addMark(position.createPos(['k'], 1), 'k')
  const c = /** @type {delta.DeltaBuilderAny} */ (delta.clone(d))
  t.compare(byId(position.marksToPositions(c)), [{ id: 'k', path: ['k'], assoc: 1 }, { id: 'n', path: [3], assoc: 1 }])
  // a partial slice rebases the in-range number mark (3 - 2 = 1) and drops the out-of-range one
  d.addMark(position.createPos([0], 1), 'z')
  const sl = /** @type {delta.DeltaBuilderAny} */ (delta.slice(d, 2, 5))
  t.compare(byId(position.marksToPositions(sl)), [{ id: 'k', path: ['k'], assoc: 1 }, { id: 'n', path: [1], assoc: 1 }])
}

export const testMarkFingerprint = () => {
  // marks are local/ephemeral cursor state, EXCLUDED from the document fingerprint (and equality), so a
  // marked doc is fingerprint-identical to the same content without marks
  const a = markDoc()
  a.addMark(position.createPos([1, 2], 1), 'c')
  t.assert(a.fingerprint === markDoc().fingerprint)
  t.assert(a.equals(markDoc()))
  // moving a mark (different key) or changing its id leaves the fingerprint untouched
  const moved = markDoc(); moved.addMark(position.createPos([1, 3], 1), 'c')
  const other = markDoc(); other.addMark(position.createPos([1, 2], 1), 'd')
  t.assert(a.fingerprint === moved.fingerprint && a.fingerprint === other.fingerprint)
  // a mark on a modify's value does not leak into the parent fingerprint via the value either
  const mv1 = delta.create(); mv1.addMark(position.createPos([0], 1), 'm')
  const mv2 = delta.create(); mv2.addMark(position.createPos([1], 1), 'm')
  t.assert(delta.create().modify(mv1).fingerprint === delta.create().modify(mv2).fingerprint)
  // mark deletions are excluded too, at the delta root
  const rd1 = delta.create(); rd1.deleteMarks = ['m']
  const rd2 = delta.create(); rd2.deleteMarks = ['n']
  t.assert(rd1.fingerprint === rd2.fingerprint)
  // mutating a node's marks does not change its (cached) fingerprint
  const fp = markDoc()
  const before = fp.fingerprint
  fp.addMark(position.createPos([0], 1), 'z')
  t.assert(fp.fingerprint === before)
}

export const testMarkChangeAccumulation = () => {
  // accumulate a mark-add change onto a change that already modifies the same child, then apply both
  const c1 = /** @type {delta.DeltaBuilderAny} */ (delta.create()).retain(1).modify(delta.create().retain(1).insert('Z'))
  // a mark-add change for [1,0]: the mark rides on the modify value's own root marks
  const mv = delta.create(); mv.addMark(position.createPos([0], 1), 'm')
  c1.apply(delta.create().retain(1).modify(mv))
  const d = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('q').insert([delta.create().insert('abc')]))
  d.apply(c1, { final: true })
  t.assert(d.maybeHasMarks === true)
  const ps = position.marksToPositions(d)
  t.assert(ps.length === 1 && ps[0].id === 'm')
}

export const testMarkRebaseRootConflicts = () => {
  const base = text10()
  // add vs add, same id: the priority side's placement wins
  t.compare(conv(base, mkAdd([3], 'M'), mkAdd([7], 'M')), [{ id: 'M', path: [3], assoc: 1 }])
  // add vs add, different ids: both survive
  t.compare(conv(base, mkAdd([3], 'A'), mkAdd([7], 'B')), [{ id: 'A', path: [3], assoc: 1 }, { id: 'B', path: [7], assoc: 1 }])
  // add vs delete, same id: the add wins (a re-placed cursor is not killed by a stale removal)
  t.compare(conv(base, mkAdd([3], 'M'), mkDel([7], 'M')), [{ id: 'M', path: [3], assoc: 1 }])
  // delete vs add, same id: again the add wins
  t.compare(conv(base, mkDel([3], 'M'), mkAdd([7], 'M')), [{ id: 'M', path: [7], assoc: 1 }])
  // delete vs delete, same id: the mark (present in base) ends up removed on both sides
  const withM = delta.clone(base)
  withM.addMark(position.createPos([5], 1), 'M')
  withM.done()
  t.compare(conv(/** @type {delta.DeltaBuilderAny} */ (withM), mkDel([5], 'M'), mkDel([5], 'M')), [])
}

export const testMarkRebaseRootShift = () => {
  const base = text10()
  // a concurrent insert before the mark pushes its key right
  t.compare(conv(base, mkAdd([5], 'M'), /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('XYZ'))), [{ id: 'M', path: [8], assoc: 1 }])
  // a concurrent delete covering the mark's anchor collapses the add to the cut point (pos 3)
  t.compare(conv(base, mkAdd([5], 'M'), /** @type {delta.DeltaBuilderAny} */ (delta.create().retain(3).delete(4))), [{ id: 'M', path: [3], assoc: 1 }])
  // a concurrent delete before the mark shifts its key left
  t.compare(conv(base, mkAdd([7], 'M'), /** @type {delta.DeltaBuilderAny} */ (delta.create().retain(1).delete(3))), [{ id: 'M', path: [4], assoc: 1 }])
  // assoc tie-break at the exact insertion point: right gravity moves, left gravity stays
  t.compare(conv(base, mkAdd([5], 'R', 1), /** @type {delta.DeltaBuilderAny} */ (delta.create().retain(5).insert('Z'))), [{ id: 'R', path: [6], assoc: 1 }])
  t.compare(conv(base, mkAdd([5], 'L', -1), /** @type {delta.DeltaBuilderAny} */ (delta.create().retain(5).insert('Z'))), [{ id: 'L', path: [5], assoc: -1 }])
}

export const testMarkRebaseNested = () => {
  const base = nodeDoc() // child node "hello" at [0]
  // nested add vs add, same id: priority side wins
  t.compare(conv(base, mkAdd([0, 1], 'M'), mkAdd([0, 4], 'M')), [{ id: 'M', path: [0, 1], assoc: 1 }])
  // nested add vs a concurrent content-modify of the same child: the key shifts by the other's content
  const insXY = /** @type {delta.DeltaBuilderAny} */ (delta.create().modify(delta.create().retain(1).insert('XY')))
  t.compare(conv(base, mkAdd([0, 2], 'M'), insXY), [{ id: 'M', path: [0, 4], assoc: 1 }])
  // a content-modify entirely after the mark leaves the key unchanged
  const insTail = /** @type {delta.DeltaBuilderAny} */ (delta.create().modify(delta.create().retain(3).insert('!')))
  t.compare(conv(base, mkAdd([0, 1], 'M'), insTail), [{ id: 'M', path: [0, 1], assoc: 1 }])
  // the other side deletes the whole marked child: the add is dropped
  t.compare(conv(base, mkAdd([0, 2], 'M'), /** @type {delta.DeltaBuilderAny} */ (delta.create().delete(1))), [])
  // a string-keyed (attribute-leaf) nested mark is immune to the child's content edits
  t.compare(conv(base, mkAdd([0, 'a'], 'S'), insXY), [{ id: 'S', path: [0, 'a'], assoc: 1 }])
}

export const testMarkRebaseNestedConflicts = () => {
  // base with the child node carrying a mark, so a delete-vs-delete has something to remove
  const base = delta.clone(nodeDoc())
  base.addMark(position.createPos([0, 2], 1), 'M')
  base.done()
  const b = /** @type {delta.DeltaBuilderAny} */ (base)
  // nested delete vs delete, same id: removed on both sides
  t.compare(conv(b, mkDel([0, 2], 'M'), mkDel([0, 2], 'M')), [])
  // nested delete vs add, same id: the add wins
  t.compare(conv(b, mkDel([0, 2], 'M'), mkAdd([0, 4], 'M')), [{ id: 'M', path: [0, 4], assoc: 1 }])
}

export const testMarkEqualityAndCounting = () => {
  // marks are local/ephemeral cursor state, excluded from document identity: deltas with the same
  // content but different mark sets still compare EQUAL (and fingerprint-equal — see testMarkFingerprint)
  // insertion order a,c,b is non-monotonic so the toJSON sort below exercises a deterministic ordering
  const two = delta.clone(text10())
  two.addMark(position.createPos([1], 1), 'a'); two.addMark(position.createPos([2], 1), 'c'); two.addMark(position.createPos([3], 1), 'b')
  const one = delta.clone(text10()); one.addMark(position.createPos([1], 1), 'a')
  const otherId = delta.clone(text10()); otherId.addMark(position.createPos([1], 1), 'd')
  t.assert(two.equals(one)) // different mark sets, same content ⇒ still equal
  t.assert(one.equals(otherId)) // different mark id, same content ⇒ still equal
  // several marks on one node ⇒ toJSON sorts them deterministically by id
  t.compare(/** @type {any} */ (two.toJSON()).marks.map((/** @type {any} */ m) => m.id), ['a', 'b', 'c'])
  // the builder flags `maybeHasMarks` for marks carried on a ModifyOp value and on delta-valued
  // attributes (set or modified) — the representation a sub-transformer emits — and clone preserves it
  const mv = delta.create(); mv.addMark(position.createPos([0], 1), 'x')
  const av = delta.create(); av.addMark(position.createPos([0], 1), 'y')
  const av2 = delta.create(); av2.addMark(position.createPos([0], 1), 'w')
  const change = /** @type {delta.DeltaBuilderAny} */ (delta.create().retain(1).modify(mv).setAttr('k', av).modifyAttr('m', av2))
  change.addMark(position.createPos([5], 1), 'z') // a root mark too
  t.assert(change.maybeHasMarks === true && delta.clone(change).maybeHasMarks === true) // flag set + preserved by clone
}

export const testMarkInDeltaValuedAttr = () => {
  // marks inside a delta-valued attribute ride through apply (setAttr add/replace, deleteAttr) and stay
  // reachable via marksToPositions; the conservative `maybeHasMarks` flag is set and self-corrected
  /** @param {string} id @param {number} off */
  const mk = (id, off) => { const v = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('hello')); v.addMark(position.createPos([off], 1), id); return v }
  const d = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('abc'))
  // set a marked delta-valued attribute ⇒ its mark is reachable
  d.apply(delta.create().setAttr('a', mk('M1', 1)), { final: true })
  t.assert(d.maybeHasMarks === true)
  t.compare(position.marksToPositions(d), [{ id: 'M1', path: ['a', 1], assoc: 1 }])
  // replace it with another marked delta value ⇒ only the new mark is reachable
  d.apply(delta.create().setAttr('a', mk('M2', 2)), { final: true })
  t.compare(position.marksToPositions(d), [{ id: 'M2', path: ['a', 2], assoc: 1 }])
  // deleting the attribute drops its subtree's marks (flag self-corrects to false)
  d.apply(delta.create().deleteAttr('a'), { final: true })
  t.compare(position.marksToPositions(d), [])
  t.assert(d.maybeHasMarks === false)
  // a clone of a marked doc keeps the mark reachable
  const d2 = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('abc'))
  d2.apply(delta.create().setAttr('a', mk('M3', 3)), { final: true })
  t.compare(position.marksToPositions(/** @type {any} */ (delta.clone(d2))), [{ id: 'M3', path: ['a', 3], assoc: 1 }])
}

export const testMarkInModifyAttrValue = () => {
  // applying a `modifyAttr` onto an attribute the node does not yet hold leaves a modify op on the
  // settled node; marksToPositions descends modifyAttr values, so its mark stays reachable
  const inner = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('x'))
  inner.addMark(position.pos(0), 'I')
  const change = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  change.modifyAttr('body', inner)
  const d = /** @type {delta.DeltaBuilderAny} */ (delta.create('node'))
  d.apply(change, { final: true })
  t.assert(d.maybeHasMarks === true)
  t.compare(position.marksToPositions(d), [{ id: 'I', path: ['body', 0], assoc: 1 }])
}

export const testMarkRebaseAttr = () => {
  // a mark living inside a delta-valued attribute rides on a modifyAttr chain; rebase recurses into it
  const base = /** @type {delta.DeltaBuilderAny} */ (delta.create().setAttr('doc', delta.create().insert('hello')).done())
  const editDoc = () => /** @type {delta.DeltaBuilderAny} */ (delta.create().modifyAttr('doc', delta.create().retain(1).insert('XY')))
  // d1 places a mark at offset 2 inside attribute 'doc'; d2 edits that attribute's content ⇒ key shifts
  t.compare(conv(base, mkAdd(['doc', 2], 'M'), editDoc()), [{ id: 'M', path: ['doc', 4], assoc: 1 }])
  // a concurrent delete of that mark (present in base) converges to removed
  const withM = delta.clone(base)
  withM.addMark(position.createPos(['doc', 2], 1), 'M')
  withM.done()
  t.compare(conv(/** @type {delta.DeltaBuilderAny} */ (withM), mkDel(['doc', 2], 'M'), editDoc()), [])
  // mkAdd into a not-yet-existing attribute flags the change (apply's simple-modify path)
  t.assert(mkAdd(['doc', 2], 'M').maybeHasMarks === true)
}

export const testMarkRebaseFlag = () => {
  // a surviving root mark stays present after rebase (flag set) ...
  const keep = delta.clone(mkAdd([5], 'M')).rebase(/** @type {delta.DeltaBuilderAny} */ (delta.create().insert('AB')), true)
  t.assert(keep.maybeHasMarks === true && keep.marks !== null)
  // ... and collapses to the cut when the other side deletes its anchor
  const collapsed = delta.clone(mkAdd([5], 'M')).rebase(/** @type {delta.DeltaBuilderAny} */ (delta.create().retain(3).delete(4)), true)
  t.assert(collapsed.maybeHasMarks === true)
  t.compare(position.marksToPositions(collapsed), [{ id: 'M', path: [3], assoc: 1 }])
  // a root add that loses an add-vs-add conflict (no priority) is dropped (marks back to null)
  const lose = delta.clone(mkAdd([5], 'M')).rebase(mkAdd([2], 'M'), false)
  t.assert(lose.marks === null)
  // a content-only rebase never gains a mark (flag was never set)
  const none = delta.clone(/** @type {delta.DeltaBuilderAny} */ (delta.create().retain(1).insert('Z'))).rebase(/** @type {delta.DeltaBuilderAny} */ (delta.create().insert('AB')), true)
  t.assert(none.maybeHasMarks === false)
  // a nested mark rides on the modify's value, so it is flagged and survives a rebase
  const nested = delta.clone(mkAdd([0, 2], 'M')).rebase(/** @type {delta.DeltaBuilderAny} */ (delta.create().modify(delta.create().retain(1).insert('XY'))), true)
  t.assert(nested.maybeHasMarks === true)
  const ndoc = delta.clone(nodeDoc()).apply(delta.create().modify(delta.create().retain(1).insert('XY')), { final: true }).apply(nested, { final: true })
  t.compare(position.marksToPositions(ndoc), [{ id: 'M', path: [0, 4], assoc: 1 }])
}
