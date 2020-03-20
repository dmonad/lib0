import { simpleDiffString, simpleDiffArray } from './diff.js'
import * as prng from './prng.js'
import * as f from './function.js'
import * as t from './testing.js'
import * as object from './object.js'

/**
 * @param {string} a
 * @param {string} b
 * @param {{index: number,remove:number,insert:string}} expected
 */
function runDiffTest (a, b, expected) {
  const result = simpleDiffString(a, b)
  t.compare(result, expected)
  const arrResult = simpleDiffArray(a.split(''), b.split(''))
  t.compare(arrResult, object.assign({}, result, { insert: result.insert.split('') }))
}

/**
 * @param {t.TestCase} tc
 */
export const testDiffing = tc => {
  runDiffTest('abc', 'axc', { index: 1, remove: 1, insert: 'x' })
  runDiffTest('bc', 'xc', { index: 0, remove: 1, insert: 'x' })
  runDiffTest('ab', 'ax', { index: 1, remove: 1, insert: 'x' })
  runDiffTest('b', 'x', { index: 0, remove: 1, insert: 'x' })
  runDiffTest('', 'abc', { index: 0, remove: 0, insert: 'abc' })
  runDiffTest('abc', 'xyz', { index: 0, remove: 3, insert: 'xyz' })
  runDiffTest('axz', 'au', { index: 1, remove: 2, insert: 'u' })
  runDiffTest('ax', 'axy', { index: 2, remove: 0, insert: 'y' })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatDiffing = tc => {
  const a = prng.word(tc.prng)
  const b = prng.word(tc.prng)
  const change = simpleDiffString(a, b)
  const recomposed = `${a.slice(0, change.index)}${change.insert}${a.slice(change.index + change.remove)}`
  t.compareStrings(recomposed, b)
}

/**
 * @param {t.TestCase} tc
 */
export const testArrayDiffing = tc => {
  const a = [[1, 2], { x: 'x' }]
  const b = [[1, 2], { x: 'x' }]
  t.compare(simpleDiffArray(a, b, f.equalityFlat), { index: 2, remove: 0, insert: [] })
  t.compare(simpleDiffArray(a, b, f.equalityStrict), { index: 0, remove: 2, insert: b })
  t.compare(simpleDiffArray([{ x: 'y' }, []], a, f.equalityFlat), { index: 0, remove: 2, insert: b })
}
