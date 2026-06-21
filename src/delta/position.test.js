import * as t from 'lib0/testing'
import * as delta from './delta.js'
import * as position from './position.js'

// a sample document: text "x", a node holding "hello", text "y" (content length 3)
const markDoc = () => delta.create().insert('x').insert([delta.create().insert('hello')]).insert('y')
/** @param {Array<position.MarkPos>} ps */
const byId = ps => ps.slice().sort((a, b) => a.id < b.id ? -1 : 1)

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
  t.assert(d.markCount === 2)
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
  // a ModifyOp emits its addMarks / deleteMarks
  const change = delta.create().retain(1).modify(delta.create(), null, null, [delta.createMark(0, 'm', 1, null)], ['gone'])
  const ch = /** @type {any} */ (change.toJSON())
  t.compare(ch.children[1].addMarks, [{ id: 'm', key: 0, assoc: 1 }])
  t.compare(ch.children[1].deleteMarks, ['gone'])
  // root deleteMarks serialize too
  const rd = delta.create()
  rd.deleteMarks = ['x']
  t.compare(/** @type {any} */ (rd.toJSON()).deleteMarks, ['x'])
  // cloning a change preserves a mark-bearing ModifyOp's add/delete marks
  const cl = /** @type {any} */ (delta.clone(change)).toJSON()
  t.compare(cl.children[1].addMarks, [{ id: 'm', key: 0, assoc: 1 }])
  t.compare(cl.children[1].deleteMarks, ['gone'])
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
  t.assert(deep.markCount === 1)
  t.compare(position.marksToPositions(deep), [{ id: 'x', path: [0, 0, 2], assoc: 1 }])
  // a mark inside a delta-valued attribute
  const rich = delta.create().setAttr('rich', delta.create().insert('hi'))
  rich.addMark(position.createPos(['rich', 1], 1), 'a')
  t.assert(rich.markCount === 1)
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
  t.assert(d.markCount === 2)
  // removing a non-existent id from a node that still has other marks is a no-op
  d.removeMark(position.createPos([1, 2], 1), 'ghost')
  t.assert(d.markCount === 2)
  d.removeMark(position.createPos([1, 2], 1), 'nested')
  d.removeMark(position.createPos([0], 1), 'root')
  t.assert(d.markCount === 0)
  t.compare(position.marksToPositions(d), [])
  // removing from an emptied node is also a no-op
  d.removeMark(position.createPos([1, 2], 1), 'ghost')
  t.assert(d.markCount === 0)
}

export const testMarkUpsertReplaces = () => {
  const d = markDoc()
  d.addMark(position.createPos([1, 2], 1), 'c')
  d.addMark(position.createPos([1, 4], 1), 'c') // same id replaces
  t.assert(d.markCount === 1)
  t.compare(position.marksToPositions(d), [{ id: 'c', path: [1, 4], assoc: 1 }])
}

export const testMarkShiftUnderEdits = () => {
  // right gravity at the very end shifts with an insert before it; a covered delete drops the mark
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
  t.assert(d2.markCount === 1)
  d2.apply(delta.create().retain(1).delete(1), { final: true }) // delete the node
  t.assert(d2.markCount === 0)
  t.compare(position.marksToPositions(d2), [])
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
  t.assert(c.markCount === 1)
  t.compare(position.marksToPositions(c), [{ id: 'c', path: [1, 2], assoc: 1 }])
  // equality distinguishes marked vs unmarked docs, and marks differing by customAttributes
  t.assert(!d.equals(markDoc()))
  const a1 = markDoc(); a1.addMark(position.createPos([2], 1), 'c', { x: 1 })
  const a2 = markDoc(); a2.addMark(position.createPos([2], 1), 'c', { x: 1 })
  const a3 = markDoc(); a3.addMark(position.createPos([2], 1), 'c', { x: 2 })
  t.assert(a1.equals(a2))
  t.assert(!a1.equals(a3))
}

export const testMarkLeafDroppedAndStringKept = () => {
  // a number-keyed leaf mark covered by a delete is dropped
  const d = delta.create().insert('abcde')
  d.addMark(position.createPos([2], 1), 'm') // between b and c
  d.apply(delta.create().retain(1).delete(2), { final: true }) // delete "bc" — covers the mark
  t.assert(d.markCount === 0)
  t.compare(position.marksToPositions(d), [])

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
  // marks participate in the document fingerprint (so a marked doc differs from an unmarked one)
  const a = markDoc()
  a.addMark(position.createPos([1, 2], 1), 'c')
  t.assert(a.fingerprint !== markDoc().fingerprint)
  // the same mark (id + key) yields the same fingerprint, regardless of insertion order
  const same = markDoc()
  same.addMark(position.createPos([1, 2], 1), 'c')
  t.assert(a.fingerprint === same.fingerprint)
  // both id AND key are encoded, so moving a mark (same id, different key) changes the fingerprint
  const moved = markDoc()
  moved.addMark(position.createPos([1, 3], 1), 'c')
  t.assert(a.fingerprint !== moved.fingerprint)
  // a different id also changes the fingerprint
  const other = markDoc()
  other.addMark(position.createPos([1, 2], 1), 'd')
  t.assert(a.fingerprint !== other.fingerprint)
  // a ModifyOp's addMarks (id + key) fold into its fingerprint too
  const m1 = delta.create().modify(delta.create(), null, null, [delta.createMark(0, 'm', 1, null)])
  const m2 = delta.create().modify(delta.create(), null, null, [delta.createMark(1, 'm', 1, null)])
  t.assert(m1.fingerprint !== m2.fingerprint)
  // mark deletions also fold into the fingerprint — on a ModifyOp and at the delta root
  const dm1 = delta.create().modify(delta.create(), null, null, null, ['m'])
  const dm2 = delta.create().modify(delta.create(), null, null, null, ['n'])
  t.assert(dm1.fingerprint !== dm2.fingerprint)
  const rd1 = delta.create(); rd1.deleteMarks = ['m']
  const rd2 = delta.create(); rd2.deleteMarks = ['n']
  t.assert(rd1.fingerprint !== rd2.fingerprint)
}

export const testMarkChangeAccumulation = () => {
  // accumulate a mark-add change onto a change that already modifies the same child, then apply both
  const c1 = /** @type {delta.DeltaBuilderAny} */ (delta.create()).retain(1).modify(delta.create().retain(1).insert('Z'))
  // a mark-add change for [1,0], built with the public ModifyOp addMarks channel
  c1.apply(delta.create().retain(1).modify(delta.create(), null, null, [delta.createMark(0, 'm', 1, null)]))
  const d = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('q').insert([delta.create().insert('abc')]))
  d.apply(c1, { final: true })
  t.assert(d.markCount === 1)
  const ps = position.marksToPositions(d)
  t.assert(ps.length === 1 && ps[0].id === 'm')
}
