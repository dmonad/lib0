import { simpleDiff } from './diff.js'
import * as prng from './prng.js'
import * as t from './testing.js'

/**
 * @param {string} a
 * @param {string} b
 * @param {{pos: number,remove:number,insert:string}} expected
 */
function runDiffTest (a, b, expected) {
  let result = simpleDiff(a, b)
  t.compare(result, expected)
}

/**
 * @param {t.TestCase} tc
 */
export const testDiffing = tc => {
  runDiffTest('abc', 'axc', { pos: 1, remove: 1, insert: 'x' })
  runDiffTest('bc', 'xc', { pos: 0, remove: 1, insert: 'x' })
  runDiffTest('ab', 'ax', { pos: 1, remove: 1, insert: 'x' })
  runDiffTest('b', 'x', { pos: 0, remove: 1, insert: 'x' })
  runDiffTest('', 'abc', { pos: 0, remove: 0, insert: 'abc' })
  runDiffTest('abc', 'xyz', { pos: 0, remove: 3, insert: 'xyz' })
  runDiffTest('axz', 'au', { pos: 1, remove: 2, insert: 'u' })
  runDiffTest('ax', 'axy', { pos: 2, remove: 0, insert: 'y' })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatDiffing = tc => {
  const a = prng.word(tc.prng)
  const b = prng.word(tc.prng)
  const change = simpleDiff(a, b)
  const recomposed = `${a.slice(0, change.pos)}${change.insert}${a.slice(change.pos + change.remove)}`
  t.compareStrings(recomposed, b)
}
