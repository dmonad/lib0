import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { transformerWith, $tresult } from '../transformer.js'
import { rename } from './rename.js'
import { filter } from './filter.js'
import { pipe } from './pipe.js'

export const testPipeBasics = () => {
  const r1 = rename(/** @type {const} */ ({ a: 'b' }))
  const r2 = rename(/** @type {const} */ ({ b: 'a' }))
  const r3 = filter(delta.$delta({ attrs: { a: [s.$number, s.$string] } }))
  const $d3 = delta.$delta({ children: 42, attrs: { a: s.$string } })
  // pipe(filter, rename): filter keeps attr `a`, rename maps `a` -> `b`
  const r31 = pipe(r3, r1)
  const i31 = r31.init($d3)
  t.assert(transformerWith($d3, delta.$delta({ attrs: { b: s.$string } })).validate(i31))
  // a long rename round-trip pipe drives PipeTransformer.apply back and forth
  const p12 = pipe(r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1)
  const $da = delta.$delta(/** @type {const} */ ({ attrs: { a: s.$string } }))
  const $db = delta.$delta(/** @type {const} */ ({ attrs: { b: s.$string } }))
  const p12init = p12.init($da)
  t.assert(transformerWith($da, delta.$delta({ attrs: { b: s.$string } })).validate(p12init))
  const dtrn = p12init.applyA(delta.create().setAttr('a', 'dturiane'))
  t.assert($tresult($da, $db).validate(dtrn))
}

/**
 * The transformer pipe types are tuned to stay below typescript's instantiation-depth limit
 * (TS2589) - see ApplyPipeNorm in pipe.js. This test guards the measured ceiling: a pipe of 85
 * templates must typecheck via pipe().init(). If this file fails to compile with TS2589, the
 * ApplyPipeNorm shape regressed (e.g. the accumulated conf is no longer forced per step).
 *
 * @param {t.TestCase} _tc
 */
export const testPipeTypeDepthCeiling = _tc => {
  const r1 = rename(/** @type {const} */ ({ a: 'b' }))
  const r2 = rename(/** @type {const} */ ({ b: 'a' }))
  const $da = delta.$delta(/** @type {const} */ ({ attrs: { a: s.$string } }))
  const $db = delta.$delta(/** @type {const} */ ({ attrs: { b: s.$string } }))
  // 85 templates = 42 rename round-trips + 1 - the measured depth ceiling
  const p85 = pipe(r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1)
  const i85 = p85.init($da)
  t.assert(transformerWith($da, delta.$delta({ attrs: { b: s.$string } })).validate(i85))
  const res = i85.applyA(delta.create().setAttr('a', 'depth'))
  t.assert($tresult($da, $db).validate(res))
}

/**
 * Long pipe mixing renames and filters - guards the Filter branch of ApplyPipeNorm (prop
 * intersection semantics) at scale, including the resulting conf type.
 *
 * @param {t.TestCase} _tc
 */
export const testPipeFilterRenameMix = _tc => {
  const r1 = rename(/** @type {const} */ ({ a: 'b' }))
  const r2 = rename(/** @type {const} */ ({ b: 'a' }))
  const fa = filter(delta.$delta({ attrs: { a: s.$string } }))
  const fb = filter(delta.$delta({ attrs: { b: s.$string } }))
  const $da = delta.$delta(/** @type {const} */ ({ attrs: { a: s.$string } }))
  const $db = delta.$delta(/** @type {const} */ ({ attrs: { b: s.$string } }))
  // 57 templates: 14 x (rename a->b, filter {b}, rename b->a, filter {a}) + rename a->b. This sits a
  // few below the measured TS2589 depth ceiling (program-wide; it drifts down by ~1 template per
  // source file added anywhere in the program) on purpose so the guard keeps margin as the codebase
  // grows. A real ApplyPipeNorm regression collapses the ceiling far below this (~45 without the
  // literal-carry), so the guard still fires for the case it protects.
  const pmix = pipe(r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1, fb, r2, fa, r1)
  const imix = pmix.init($da)
  t.assert(transformerWith($da, delta.$delta({ attrs: { b: s.$string } })).validate(imix))
  const res = imix.applyA(delta.create().setAttr('a', 'mix'))
  t.assert($tresult($da, $db).validate(res))
}
