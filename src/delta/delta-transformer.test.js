import * as t from 'lib0/testing'
import * as delta from './delta.js'
import * as dt from './transformer.js'
import * as s from 'lib0/schema'

export const testBasics = () => {
  const r1 = dt.rename(/** @type {const} */ ({ a: 'b' }))
  const r2 = dt.rename(/** @type {const} */ ({ b: 'a' }))
  const r3 = dt.filter(delta.$delta({ attrs: { a: [s.$number, s.$string] } }))
  const i1 = r1.init(delta.$delta({ attrs: { a: s.$string, b: s.$string } }))
  t.assert(dt.transformerWith(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), delta.$delta({ attrs: { b: s.$string } })).validate(i1))
  const $d3 = delta.$delta({ children: 42, attrs: { a: s.$string } })
  const r31 = dt.pipe(r3, r1)
  const i3 = r3.init($d3)
  t.assert(dt.transformerWith($d3, delta.$delta({ attrs: { a: s.$string } })).validate(i3))
  const i31 = r31.init($d3)
  t.assert(dt.transformerWith($d3, delta.$delta({ attrs: { b: s.$string } })).validate(i31))
  const p12 = dt.pipe(r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1)
  const $da = delta.$delta(/** @type {const} */ ({
    attrs: {
      a: s.$string
    }
  }))
  const $db = delta.$delta(/** @type {const} */ ({
    attrs: {
      b: s.$string
    }
  }))
  const p12init = p12.init($da)
  t.assert(dt.transformerWith($da, delta.$delta({ attrs: { b: s.$string } })).validate(p12init))
  const ddd = delta.create().setAttr('a', 'dturiane')
  const dtrn = p12init.applyA(ddd)
  t.assert(dt.$tresult($da, $db).validate(dtrn))
  console.log(dtrn)
}

/**
 * The transformer pipe types are tuned to stay below typescript's instantiation-depth limit
 * (TS2589) - see ApplyPipeNorm in transformer.js. This test guards the measured ceiling: a pipe
 * of 85 templates must typecheck via pipe().init(). If this file fails to compile with TS2589,
 * the ApplyPipeNorm shape regressed (e.g. the accumulated conf is no longer forced per step).
 *
 * @param {t.TestCase} _tc
 */
export const testPipeTypeDepthCeiling = _tc => {
  const r1 = dt.rename(/** @type {const} */ ({ a: 'b' }))
  const r2 = dt.rename(/** @type {const} */ ({ b: 'a' }))
  const $da = delta.$delta(/** @type {const} */ ({ attrs: { a: s.$string } }))
  const $db = delta.$delta(/** @type {const} */ ({ attrs: { b: s.$string } }))
  // 85 templates = 42 rename round-trips + 1 - the measured depth ceiling
  const p85 = dt.pipe(r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1)
  const i85 = p85.init($da)
  t.assert(dt.transformerWith($da, delta.$delta({ attrs: { b: s.$string } })).validate(i85))
  const res = i85.applyA(delta.create().setAttr('a', 'depth'))
  t.assert(dt.$tresult($da, $db).validate(res))
}

/**
 * Long pipe mixing renames and filters - guards the Filter branch of ApplyPipeNorm (prop
 * intersection semantics) at scale, including the resulting conf type.
 *
 * @param {t.TestCase} _tc
 */
export const testPipeFilterRenameMix = _tc => {
  const r1 = dt.rename(/** @type {const} */ ({ a: 'b' }))
  const r2 = dt.rename(/** @type {const} */ ({ b: 'a' }))
  const fa = dt.filter(delta.$delta({ attrs: { a: s.$string } }))
  const fb = dt.filter(delta.$delta({ attrs: { b: s.$string } }))
  const $da = delta.$delta(/** @type {const} */ ({ attrs: { a: s.$string } }))
  const $db = delta.$delta(/** @type {const} */ ({ attrs: { b: s.$string } }))
  // 61 templates: 15 x (rename a->b, filter {b}, rename b->a, filter {a}) + rename a->b
  const p61 = dt.pipe(r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1)
  const i61 = p61.init($da)
  t.assert(dt.transformerWith($da, delta.$delta({ attrs: { b: s.$string } })).validate(i61))
  const res = i61.applyA(delta.create().setAttr('a', 'mix'))
  t.assert(dt.$tresult($da, $db).validate(res))
}

// export const testStatic = () => {
//   dt.projection('h1', {
//     k: dt.projection('h2')
//   }, ['hi there ', dt.query('name')])
//
//   dt.projection(null, {
//     name: dt.pipe(dt.firstChild('user'), dt.queryAttr('q'))
//   }).pipe(dt.projection('h1', {}, ['hi there ', dt.queryAttr('name')]))
// }
