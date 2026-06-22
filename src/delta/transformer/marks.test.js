import * as t from 'lib0/testing'
import * as prng from 'lib0/prng'
import * as s from '../../schema.js'
import * as delta from '../delta.js'
import * as position from '../position.js'
import { pipe } from '../transformer.js'
import { rename } from './rename.js'
import { renameAttrs } from './rename-attrs.js'
import { id } from './id.js'
import { children } from './children.js'
import { unwrapValue } from './value.js'
import { attr } from './attr.js'
import { filter } from './filter.js'

// ---------------------------------------------------------------------------
// Cross-side cursor marks (Slice 3, part 1)
//
// A mark is an anchor at a content offset / attribute key. Every transformer already maps content
// positions A<->B, so a mark rides through that same map. These tests cover the mechanism (the shared
// mark-carrying `delta.cloneShallow`) and the position-preserving / key-remapping transformers; the
// restructuring transformers (`inline`, `project`) carry marks too and are tested in their own files
// (`inline.test.js`, `project.test.js`).
//
// NB: `addMark` returns the mark's id (not the builder), so it is always called as a statement. A
// transform result side (`r.a` / `r.b`) is typed nullable, so the helpers below take `any`.
// ---------------------------------------------------------------------------

/**
 * `marksToPositions` of a transform-result side, sorted by id for order-independent comparison.
 *
 * @param {any} d
 * @return {Array<position.MarkPos>}
 */
const mp = d => position.marksToPositions(d).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export const testMarkRenamePreserves = () => {
  // rename clones the node, so a mark rides unchanged (only the name changes)
  const it = rename('B').init(delta.$deltaAny)
  const d = delta.create('A').insert('hi')
  d.addMark(position.pos(1), 'M')
  const r = it.applyA(d)
  t.assert(r.b?.name === 'B')
  t.compare(mp(r.b), [{ id: 'M', path: [1], assoc: 1 }])
  // reverse: srcName restored, mark preserved
  const db = delta.create('B').insert('hi')
  db.addMark(position.pos(1), 'M')
  const rb = it.applyB(db)
  t.assert(rb.a?.name === 'A')
  t.compare(mp(rb.a), [{ id: 'M', path: [1], assoc: 1 }])
}

export const testMarkIdPreserves = () => {
  // the identity transformer carries marks verbatim
  const it = id.init(delta.$deltaAny)
  const d = delta.create('p', { a: 1 })
  d.addMark(position.pos('a'), 'M')
  d.addMark(position.pos(0), 'R')
  const r = it.applyA(d)
  t.compare(mp(r.b), [
    { id: 'M', path: ['a'], assoc: 1 },
    { id: 'R', path: [0], assoc: 1 }
  ])
}

export const testMarkChildrenRootAndNested = () => {
  // children is 1:1 over positions: a root mark rides via cloneShallow (content offset unchanged); a
  // mark inside a transformed child rides via the modify/insert recursion (here re-keyed a->b by the
  // per-child renameAttrs)
  const it = children(_d => renameAttrs({ a: 'b' })).init(delta.$deltaAny)
  const child = delta.create('p', { a: 1 })
  child.addMark(position.pos('a'), 'C')
  const d = delta.create().insert([child])
  d.addMark(position.pos(0), 'R')
  const r = it.applyA(d)
  t.compare(mp(r.b), [
    { id: 'C', path: [0, 'b'], assoc: 1 },
    { id: 'R', path: [0], assoc: 1 }
  ])
}

export const testMarkChildrenNestedOnly = () => {
  // a mark living ONLY inside a child (no co-located root mark on any ancestor) survives `children`:
  // `out.insert` folds the rebuilt child's markCount, so marksToPositions can still reach the cursor
  const child = delta.create('p', { a: 1 })
  child.addMark(position.pos('a'), 'C')
  const doc = /** @type {any} */ (delta.create())
  doc.apply(delta.create().insert([child]), { final: true })
  const r = children(_d => renameAttrs({ a: 'b' })).init(delta.$deltaAny).applyA(doc)
  t.assert(/** @type {any} */ (r.b).markCount === 1)
  t.compare(mp(r.b), [{ id: 'C', path: [0, 'b'], assoc: 1 }])
}

export const testMarkValueNestedOnly = () => {
  // same nested-only case through unwrapValue's pass-through (non-carrier) child branch
  const child = delta.create('p', { k: 1 })
  child.addMark(position.pos('k'), 'V')
  const doc = /** @type {any} */ (delta.create())
  doc.apply(delta.create().insert([child]), { final: true })
  const r = unwrapValue.init(delta.$deltaAny).applyA(doc)
  t.assert(/** @type {any} */ (r.b).markCount === 1)
  t.compare(mp(r.b), [{ id: 'V', path: [0, 'k'], assoc: 1 }])
}

export const testMarkValueRootPreserved = () => {
  // unwrapValue is count-preserving (carrier -> scalar is 1 position): a root mark rides unchanged
  const it = unwrapValue.init(delta.$deltaAny)
  const d = delta.create().insert('x').insert([delta.create('lib0:value').setAttr('value', 42)])
  d.addMark(position.pos(0), 'M')
  const r = it.applyA(d)
  // content: "x" then the scalar 42 (carrier resolved); marks are excluded from equality
  t.compare(r.b, delta.create().insert('x').insert([42]))
  t.compare(mp(r.b), [{ id: 'M', path: [0], assoc: 1 }])
}

export const testMarkValueCarrierInnerDropped = () => {
  // a mark *inside* a carrier that is lifted to a bare scalar has nowhere to go (a scalar holds no
  // marks) - documented drop
  const it = unwrapValue.init(delta.$deltaAny)
  const carrier = delta.create('lib0:value').setAttr('value', 7)
  carrier.addMark(position.pos('value'), 'INNER')
  const r = it.applyA(delta.create().insert([carrier]))
  t.compare(r.b, delta.create().insert([7]))
  t.compare(mp(r.b), [])
}

export const testMarkAttrKeyRemap = () => {
  // attr moves a mark on the projected attribute (attrName <-> 'value') and drops marks on any other
  // attribute (only the one attribute exists on the other side)
  const it = attr('title').init(delta.$deltaAny)
  const d = delta.create('node', { title: 'hi', other: 'x' })
  d.addMark(position.pos('title'), 'M')
  d.addMark(position.pos('other'), 'N')
  const r = it.applyA(d)
  t.compare(mp(r.b), [{ id: 'M', path: ['value'], assoc: 1 }])
  // round-trip: value -> title
  const back = it.applyB(/** @type {any} */ (r.b))
  t.compare(mp(back.a), [{ id: 'M', path: ['title'], assoc: 1 }])
}

export const testMarkAttrNestedValueCounted = () => {
  // a delta-valued attribute carries its own (deeper) marks via the cloned attr op; recountMarks keeps
  // the carrier's markCount correct so marksToPositions descends into it (the direct attr assignment in
  // attrTransformHelper does not maintain markCount)
  const it = attr('body').init(delta.$deltaAny)
  const d = delta.create('node').setAttr('body', delta.create('doc').insert('hello'))
  d.addMark(position.createPos(['body', 2], 1), 'I')
  const r = it.applyA(d)
  t.compare(mp(r.b), [{ id: 'I', path: ['value', 2], assoc: 1 }])
}

export const testMarkRenameAttrsRemapAndDrop = () => {
  const it = renameAttrs({ a: 'b' }).init(delta.$deltaAny)
  // 'a' follows the rename to 'b'; 'c' is untouched
  const d = delta.create('p', { a: 1, c: 2 })
  d.addMark(position.pos('a'), 'M')
  d.addMark(position.pos('c'), 'K')
  const r = it.applyA(d)
  t.compare(mp(r.b), [
    { id: 'K', path: ['c'], assoc: 1 },
    { id: 'M', path: ['b'], assoc: 1 }
  ])
  // a mark on a rename *target* attribute is dropped (that attribute is removed on this side)
  const it2 = renameAttrs({ a: 'b' }).init(delta.$deltaAny)
  const d2 = delta.create('p', { b: 9 })
  d2.addMark(position.pos('b'), 'Z')
  const r2 = it2.applyA(d2)
  t.compare(mp(r2.b), [])
}

export const testMarkFilterPreserves = () => {
  // filter returns the input unchanged, so a mark on a kept attribute survives
  const it = filter(delta.$delta({ attrs: { a: s.$string } })).init(delta.$delta({ attrs: { a: s.$string, b: s.$string } }))
  const d = delta.create().setAttr('a', 'x')
  d.addMark(position.pos('a'), 'M')
  const r = it.applyA(d)
  t.compare(mp(r.b), [{ id: 'M', path: ['a'], assoc: 1 }])
}

export const testMarkPipeComposition = () => {
  // a mark rides end-to-end through a composed pipe (children re-keys a->b, then rename relabels root)
  const it = /** @type {any} */ (pipe(children(_d => renameAttrs({ a: 'b' })), rename('ROOT')).init(delta.$deltaAny))
  const child = delta.create('p', { a: 1 })
  child.addMark(position.pos('a'), 'C')
  const d = delta.create('orig').insert([child])
  d.addMark(position.pos(0), 'R')
  const r = it.applyA(d)
  t.assert(r.b.name === 'ROOT')
  t.compare(mp(r.b), [
    { id: 'C', path: [0, 'b'], assoc: 1 },
    { id: 'R', path: [0], assoc: 1 }
  ])
}

export const testMarkDeleteRidesCrossSide = () => {
  // a mark *delete* is keyed only by (cross-side-stable) id, so it maps cleanly in either direction. A
  // delete-mark *change* carries `deleteMarks` directly (removeMark would resolve the delete away under
  // its final:true apply), so we build it like position.test.js's mkDel helper.
  const itc = children(_d => renameAttrs({ a: 'b' })).init(delta.$deltaAny)
  const dc = delta.create()
  dc.deleteMarks = ['M']
  const rc = itc.applyA(dc)
  t.compare(/** @type {any} */ (rc.b).deleteMarks, ['M'])
  const ita = attr('title').init(delta.$deltaAny)
  const da = delta.create('node')
  da.deleteMarks = ['M']
  const ra = ita.applyA(da)
  t.compare(/** @type {any} */ (ra.b).deleteMarks, ['M'])
}

export const testMarkCustomAttributesRoundTrip = () => {
  // a mark's customAttributes (the "additional information" an RDT attaches) ride through a transformer
  // and back, keyed through the same attr remap as the mark itself
  const it = renameAttrs({ a: 'b' }).init(delta.$deltaAny)
  const d = delta.create('p', { a: 1 })
  d.addMark(position.pos('a'), 'U', { note: 'hi' })
  const r = it.applyA(d)
  t.compare([...(/** @type {any} */ (r.b).marks ?? [])].map(m => ({ key: m.key, attrs: m.customAttributes })), [{ key: 'b', attrs: { note: 'hi' } }])
  const back = it.applyB(/** @type {any} */ (r.b))
  t.compare([...(/** @type {any} */ (back.a).marks ?? [])].map(m => ({ key: m.key, attrs: m.customAttributes })), [{ key: 'a', attrs: { note: 'hi' } }])
}

/**
 * Fuzz: marks on a random set of attributes survive `renameAttrs` (each present key renamed to a fresh
 * target), and round-trip back through `applyB`.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatMarkRenameAttrsFuzz = tc => {
  const gen = tc.prng
  const keys = ['a', 'b', 'c', 'd', 'e']
  const node = delta.create('p')
  /** @type {{[k:string]:string}} */
  const renames = {}
  /** @type {Array<position.MarkPos>} */
  const fwd = []
  /** @type {Array<position.MarkPos>} */
  const bwd = []
  for (const k of keys) {
    if (prng.bool(gen)) {
      node.setAttr(k, prng.uint32(gen, 0, 1000))
      renames[k] = k + 'X' // fresh target, never collides with a source key
      if (prng.bool(gen)) {
        const mid = 'm' + k
        node.addMark(position.pos(k), mid)
        fwd.push({ id: mid, path: [k + 'X'], assoc: 1 })
        bwd.push({ id: mid, path: [k], assoc: 1 })
      }
    }
  }
  const it = renameAttrs(renames).init(delta.$deltaAny)
  const r = it.applyA(node)
  t.compare(mp(r.b), fwd.sort((a, b) => a.id < b.id ? -1 : 1), 'marks follow the attr renames')
  const back = it.applyB(/** @type {any} */ (r.b))
  t.compare(mp(back.a), bwd.sort((a, b) => a.id < b.id ? -1 : 1), 'round-trip restores the original keys')
}
