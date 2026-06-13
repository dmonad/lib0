import * as t from '../testing.js'
import * as delta from './delta.js'
import * as dt from './transformer.js'
import { bind } from './binding.js'
import { deltaRDT } from './rdt/delta.js'
import * as s from '../schema.js'

// ---------------------------------------------------------------------------
// Binding
//
// These tests exercise the binding machinery (binding.js): a `Binding` routes
// each side's changes through a transformer and feeds the result back, with a
// mutex breaking the echo loop. `DeltaRDT` is used as the (DOM-free) vehicle on
// both sides; the individual RDTs are tested in ./rdt/*.test.js.
// ---------------------------------------------------------------------------

/**
 * `dt.rename({})` is the identity transformer: `applyA` maps a change verbatim
 * onto the B side and `applyB` maps it back onto A, so a binding using it keeps
 * both sides bit-for-bit equal.
 */
const identity = () => dt.rename(/** @type {const} */ ({}))

export const testBindIdentity = () => {
  const $d = delta.$delta({ attrs: { x: s.$string }, text: true })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  bind(a, b, identity())
  /** @type {Array<delta.DeltaAny>} */
  const aChanges = []
  /** @type {Array<delta.DeltaAny>} */
  const bChanges = []
  a.on('delta', d => aChanges.push(d))
  b.on('delta', d => bChanges.push(d))
  // a change on `a` is mirrored onto `b`
  a.applyDelta(delta.create().setAttr('x', 'hello').insert('world'))
  t.compare(a.state, b.state, 'states equal after a-side change')
  t.compare(b.state, delta.create().setAttr('x', 'hello').insert('world'))
  // the echo loop is broken: `a` sees its own change once, `b` sees it once
  t.assert(aChanges.length === 1)
  t.assert(bChanges.length === 1)
  // a change on `b` is mirrored back onto `a`
  b.applyDelta(delta.create().setAttr('x', 'again'))
  t.compare(a.state, b.state, 'states equal after b-side change')
  t.assert(aChanges.length === 2)
  t.assert(bChanges.length === 2)
}

export const testBindDefaultIdentity = () => {
  const $d = delta.$delta({ attrs: { x: s.$string }, text: true })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  // omitting the template defaults to the identity transformer
  bind(a, b)
  a.applyDelta(delta.create().setAttr('x', 'hi').insert('there'))
  t.compare(a.state, b.state, 'states equal with default (identity) template')
  t.compare(b.state, delta.create().setAttr('x', 'hi').insert('there'))
}

export const testBindRename = () => {
  const $a = delta.$delta({ attrs: { a: s.$string } })
  const $b = delta.$delta({ attrs: { b: s.$string } })
  const a = deltaRDT($a)
  const b = deltaRDT($b)
  // a -> b renames attr `a` to `b`; the binding maps changes both ways
  bind(a, b, dt.rename(/** @type {const} */ ({ a: 'b' })))
  a.applyDelta(delta.create().setAttr('a', 'x'))
  t.compare(a.state, delta.create().setAttr('a', 'x'))
  t.compare(b.state, delta.create().setAttr('b', 'x'), 'attr renamed a->b')
  // a change on the b side maps back to the a side (b -> a renames `b` to `a`)
  b.applyDelta(delta.create().setAttr('b', 'y'))
  t.compare(b.state, delta.create().setAttr('b', 'y'))
  t.compare(a.state, delta.create().setAttr('a', 'y'), 'attr renamed b->a')
}

export const testBindDestroy = () => {
  const $d = delta.$delta({ attrs: { x: s.$string } })
  const a = deltaRDT($d)
  const b = deltaRDT($d)
  bind(a, b, identity())
  // destroying one side tears the binding down (it listens for 'destroy')
  a.destroy()
  // further changes on the surviving side are no longer propagated
  b.applyDelta(delta.create().setAttr('x', 'orphan'))
  t.compare(b.state, delta.create().setAttr('x', 'orphan'))
  t.assert(a.state === null, 'destroyed side received no further updates')
}
