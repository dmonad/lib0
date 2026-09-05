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
import { conform } from './conform.js'

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
  const it = rename(delta.$deltaAny, 'B').init()
  const d = delta.create('A', null, 'hi')
  d.addMark(position.create([1]), 'M')
  const r = it.applyA(d)
  t.assert(r.b?.name === 'B')
  t.compare(mp(r.b), [{ id: 'M', path: [1], assoc: 1 }])
  // reverse: srcName restored, mark preserved
  const db = delta.create('B', null, 'hi')
  db.addMark(position.create([1]), 'M')
  const rb = it.applyB(db)
  t.assert(rb.a?.name === 'A')
  t.compare(mp(rb.a), [{ id: 'M', path: [1], assoc: 1 }])
}

export const testMarkIdPreserves = () => {
  // the identity transformer carries marks verbatim
  const it = id(delta.$deltaAny).init()
  const d = delta.create('p', { a: 1 })
  d.addMark(position.create(['a']), 'M')
  d.addMark(position.create([0]), 'R')
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
  const it = children(delta.$deltaAny, (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  const child = delta.create('p', { a: 1 })
  child.addMark(position.create(['a']), 'C')
  const d = delta.create().insert([child])
  d.addMark(position.create([0]), 'R')
  const r = it.applyA(d)
  t.compare(mp(r.b), [
    { id: 'C', path: [0, 'b'], assoc: 1 },
    { id: 'R', path: [0], assoc: 1 }
  ])
}

export const testMarkChildrenNestedOnly = () => {
  // a mark living ONLY inside a child (no co-located root mark on any ancestor) survives `children`:
  // `out.insert` flags the rebuilt child's marks, so marksToPositions can still reach the cursor
  const child = delta.create('p', { a: 1 })
  child.addMark(position.create(['a']), 'C')
  const doc = /** @type {any} */ (delta.create())
  doc.apply(delta.create().insert([child]), { final: true })
  const r = children(delta.$deltaAny, (_c, $c) => renameAttrs($c, { a: 'b' })).init().applyA(doc)
  t.assert(/** @type {any} */ (r.b).maybeHasMarks === true)
  t.compare(mp(r.b), [{ id: 'C', path: [0, 'b'], assoc: 1 }])
}

export const testMarkValueNestedOnly = () => {
  // same nested-only case through unwrapValue's pass-through (non-carrier) child branch
  const child = delta.create('p', { k: 1 })
  child.addMark(position.create(['k']), 'V')
  const doc = /** @type {any} */ (delta.create())
  doc.apply(delta.create().insert([child]), { final: true })
  const r = unwrapValue(delta.$deltaAny).init().applyA(doc)
  t.assert(/** @type {any} */ (r.b).maybeHasMarks === true)
  t.compare(mp(r.b), [{ id: 'V', path: [0, 'k'], assoc: 1 }])
}

export const testMarkValueRootPreserved = () => {
  // unwrapValue is count-preserving (carrier -> scalar is 1 position): a root mark rides unchanged
  const it = unwrapValue(delta.$deltaAny).init()
  const d = delta.create().insert('x').insert([delta.create('lib0:value', { value: 42 })])
  d.addMark(position.create([0]), 'M')
  const r = it.applyA(d)
  // content: "x" then the scalar 42 (carrier resolved); marks are excluded from equality
  t.compare(r.b, delta.create().insert('x').insert([42]))
  t.compare(mp(r.b), [{ id: 'M', path: [0], assoc: 1 }])
}

export const testMarkValueCarrierInnerDropped = () => {
  // a mark *inside* a carrier that is lifted to a bare scalar has nowhere to go (a scalar holds no
  // marks) - documented drop
  const it = unwrapValue(delta.$deltaAny).init()
  const carrier = delta.create('lib0:value', { value: 7 })
  carrier.addMark(position.create(['value']), 'INNER')
  const r = it.applyA(delta.create().insert([carrier]))
  t.compare(r.b, delta.create().insert([7]))
  t.compare(mp(r.b), [])
}

export const testMarkAttrKeyRemap = () => {
  // attr moves a mark on the projected attribute (attrName <-> 'value') and drops marks on any other
  // attribute (only the one attribute exists on the other side)
  const it = attr(delta.$deltaAny, 'title').init()
  const d = delta.create('node', { title: 'hi', other: 'x' })
  d.addMark(position.create(['title']), 'M')
  d.addMark(position.create(['other']), 'N')
  const r = it.applyA(d)
  t.compare(mp(r.b), [{ id: 'M', path: ['value'], assoc: 1 }])
  // round-trip: value -> title
  const back = it.applyB(/** @type {any} */ (r.b))
  t.compare(mp(back.a), [{ id: 'M', path: ['title'], assoc: 1 }])
}

export const testMarkAttrNestedValueReachable = () => {
  // a delta-valued attribute carries its own (deeper) marks via the cloned attr op; the carrier's
  // `maybeHasMarks` flag is set conservatively (the direct attr assignment in attrTransformHelper
  // bypasses the builder) so marksToPositions descends into it
  const it = attr(delta.$deltaAny, 'body').init()
  const d = delta.create('node', { body: delta.create('doc', null, 'hello') })
  d.addMark(position.create(['body', 2], 1), 'I')
  const r = it.applyA(d)
  t.compare(mp(r.b), [{ id: 'I', path: ['value', 2], assoc: 1 }])
}

export const testMarkRenameAttrsRemapAndDrop = () => {
  const it = renameAttrs(delta.$deltaAny, { a: 'b' }).init()
  // 'a' follows the rename to 'b'; 'c' is untouched
  const d = delta.create('p', { a: 1, c: 2 })
  d.addMark(position.create(['a']), 'M')
  d.addMark(position.create(['c']), 'K')
  const r = it.applyA(d)
  t.compare(mp(r.b), [
    { id: 'K', path: ['c'], assoc: 1 },
    { id: 'M', path: ['b'], assoc: 1 }
  ])
  // a mark on a rename *target* attribute is dropped (that attribute is removed on this side)
  const it2 = renameAttrs(delta.$deltaAny, { a: 'b' }).init()
  const d2 = delta.create('p', { b: 9 })
  d2.addMark(position.create(['b']), 'Z')
  const r2 = it2.applyA(d2)
  t.compare(mp(r2.b), [])
}

export const testMarkConformPreserves = () => {
  // a mark on a kept attribute rides through conform (it keys the surviving attr `a`)
  const it = conform(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  const d = delta.create().setAttr('a', 'x')
  d.addMark(position.create(['a']), 'M')
  const r = it.applyA(d)
  t.compare(mp(r.b), [{ id: 'M', path: ['a'], assoc: 1 }])
}

export const testMarkPipeComposition = () => {
  // a mark rides end-to-end through a composed pipe (children re-keys a->b, then rename relabels root)
  const it = /** @type {any} */ (pipe(delta.$deltaAny, $d1 => children($d1, (_c, $c) => renameAttrs($c, { a: 'b' })), $d2 => rename($d2, 'ROOT')).init())
  const child = delta.create('p', { a: 1 })
  child.addMark(position.create(['a']), 'C')
  const d = delta.create('orig', null, [child])
  d.addMark(position.create([0]), 'R')
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
  const itc = children(delta.$deltaAny, (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  const dc = delta.create()
  dc.deleteMarks = new Set(['M'])
  const rc = itc.applyA(dc)
  t.compare(/** @type {any} */ (rc.b).deleteMarks, new Set(['M']))
  const ita = attr(delta.$deltaAny, 'title').init()
  const da = delta.create('node')
  da.deleteMarks = new Set(['M'])
  const ra = ita.applyA(da)
  t.compare(/** @type {any} */ (ra.b).deleteMarks, new Set(['M']))
}

export const testMarkAttrsRoundTrip = () => {
  // a mark's attrs (the "additional information" an RDT attaches) ride through a transformer
  // and back, keyed through the same attr remap as the mark itself
  const it = renameAttrs(delta.$deltaAny, { a: 'b' }).init()
  const d = delta.create('p', { a: 1 })
  d.addMark(position.create(['a'], 1, { note: 'hi' }), 'U')
  const r = it.applyA(d)
  t.compare([...(/** @type {any} */ (r.b).marks ?? [])].map(m => ({ key: m.key, attrs: m.attrs })), [{ key: 'b', attrs: { note: 'hi' } }])
  const back = it.applyB(/** @type {any} */ (r.b))
  t.compare([...(/** @type {any} */ (back.a).marks ?? [])].map(m => ({ key: m.key, attrs: m.attrs })), [{ key: 'a', attrs: { note: 'hi' } }])
}

export const testMarkModifyChangeRidesChildren = () => {
  // an incremental mark-only change addressing an EXISTING child arrives as a retain/modify chain
  // (what addMark builds); the mark is readable directly off the raw transformer output — no settle —
  // via marksToPositions' modify descent, re-keyed a->b by the per-child sub-transformer
  const it = children(delta.$deltaAny, (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  it.applyA(delta.create().insert([delta.create('p', { a: 1 })])) // establish the child + its sub-transformer
  const change = /** @type {any} */ (delta.create())
  change.addMark(position.create([0, 'a']), 'M')
  const r = it.applyA(change)
  t.compare(mp(r.b), [{ id: 'M', path: [0, 'b'], assoc: 1 }])
  // and back: a B-side mark change maps through the same modify path
  const changeB = /** @type {any} */ (delta.create())
  changeB.addMark(position.create([0, 'b']), 'N')
  const rb = it.applyB(changeB)
  t.compare(mp(rb.a), [{ id: 'N', path: [0, 'a'], assoc: 1 }])
}

export const testMapPositionsOneShot = () => {
  // one-shot position mapping: transient probe marks ride a single transform pass and nothing is
  // stored anywhere - order, gravity, and attrs of the inputs are preserved in the result
  const it = children(delta.$deltaAny, (_c, $c) => renameAttrs($c, { a: 'b' })).init()
  it.applyA(delta.create().insert([delta.create('p', { a: 1 })])) // establish the child + its sub-transformer
  const res = position.mapPositionsA(it, [position.create([0, 'a']), position.create([2], -1, { u: 1 })])
  t.compare(res, [{ path: [0, 'b'], assoc: 1 }, { path: [2], assoc: -1, attrs: { u: 1 } }])
  // and back through applyB
  t.compare(position.mapPositionsB(it, [position.create([0, 'b'])]), [{ path: [0, 'a'], assoc: 1 }])
}

export const testMapPositionsDrop = () => {
  // attr projects exactly one attribute onto the B side; a probe on any other key has no image -> null
  // (the documented best-effort drop); a probe INSIDE the projected attribute maps through modifyAttr
  const it = attr(delta.$deltaAny, 'x').init()
  t.compare(position.mapPositionsA(it, [position.create(['x']), position.create(['other']), position.create(['x', 3])]), [
    { path: ['value'], assoc: 1 },
    null,
    { path: ['value', 3], assoc: 1 }
  ])
}

export const testMapPositionsStateNeutral = () => {
  // mapping leaves the transformer semantically untouched: after a mapping (run twice - the read is
  // idempotent), the instance still transforms real changes exactly like an untouched control instance
  const mk = () => {
    const it = children(delta.$deltaAny, (_c, $c) => renameAttrs($c, { a: 'b' })).init()
    it.applyA(delta.create().insert([delta.create('p', { a: 1 })]))
    return it
  }
  const probed = mk()
  const control = mk()
  const probe = [position.create([0, 'a'])]
  t.compare(position.mapPositionsA(probed, probe), position.mapPositionsA(probed, probe))
  // a modify routed through the preserved per-child sub-transformer, then a structural insert
  const modChange = () => /** @type {any} */ (delta.create().modify(delta.create().setAttr('a', 7)))
  t.compare(probed.applyA(modChange()).b?.toJSON(), control.applyA(modChange()).b?.toJSON())
  const insChange = () => /** @type {any} */ (delta.create().insert([delta.create('p', { a: 2 })]))
  t.compare(probed.applyA(insChange()).b?.toJSON(), control.applyA(insChange()).b?.toJSON())
}

export const testMapPositionsEmpty = () => {
  // an empty batch short-circuits without invoking the transformer at all
  const boom = /** @type {any} */ ({ applyA: () => { throw new Error('unreachable') } })
  t.compare(position.mapPositionsA(boom, []), [])
}

export const testMarkTransientSurvivesRemap = () => {
  // a key remap reconstructs marks via Mark#copy, which must forward the transient flag - otherwise a
  // future mark-storing transformer could not honor the never-store contract after a remap
  const it = attr(delta.$deltaAny, 'x').init()
  const c = /** @type {any} */ (delta.create())
  c.addMark(position.create(['x']), 'T', true)
  const m = [...(/** @type {any} */ (it.applyA(c).b).marks)][0]
  t.assert(m.transient === true && m.key === 'value')
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
        node.addMark(position.create([k]), mid)
        fwd.push({ id: mid, path: [k + 'X'], assoc: 1 })
        bwd.push({ id: mid, path: [k], assoc: 1 })
      }
    }
  }
  const it = renameAttrs(delta.$deltaAny, renames).init()
  const r = it.applyA(node)
  t.compare(mp(r.b), fwd.sort((a, b) => a.id < b.id ? -1 : 1), 'marks follow the attr renames')
  const back = it.applyB(/** @type {any} */ (r.b))
  t.compare(mp(back.a), bwd.sort((a, b) => a.id < b.id ? -1 : 1), 'round-trip restores the original keys')
}
