import { simpleDiffString, simpleDiffArray, simpleDiffStringWithCursor } from './diff.js'
import * as prng from './prng.js'
import * as f from './function.js'
import * as t from './testing.js'
import * as str from './string.js'

/**
 * @param {string} a
 * @param {string} b
 * @param {{index: number,remove:number,insert:string}} expected
 */
function runDiffTest (a, b, expected) {
  const result = simpleDiffString(a, b)
  t.compare(result, expected)
  t.compare(result, simpleDiffStringWithCursor(a, b, a.length)) // check that the withCursor approach returns the same result
  const recomposed = str.splice(a, result.index, result.remove, result.insert)
  t.compareStrings(recomposed, b)
  const arrResult = simpleDiffArray(Array.from(a), Array.from(b))
  const arrRecomposed = Array.from(a)
  arrRecomposed.splice(arrResult.index, arrResult.remove, ...arrResult.insert)
  t.compareStrings(arrRecomposed.join(''), b)
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
  // These strings share high-surrogate characters
  runDiffTest('\u{d83d}\u{dc77}'/* '👷' */, '\u{d83d}\u{dea7}\u{d83d}\u{dc77}'/* '🚧👷' */, { index: 0, remove: 0, insert: '🚧' })
  runDiffTest('\u{d83d}\u{dea7}\u{d83d}\u{dc77}'/* '🚧👷' */, '\u{d83d}\u{dc77}'/* '👷' */, { index: 0, remove: 2, insert: '' })
  // These strings share low-surrogate characters
  runDiffTest('\u{d83d}\u{dfe6}\u{d83d}\u{dfe6}'/* '🟦🟦' */, '\u{d83c}\u{dfe6}\u{d83d}\u{dfe6}'/* '🏦🟦' */, { index: 0, remove: 2, insert: '🏦' })
  // check 4-character unicode symbols
  runDiffTest('🇦🇨', '🇦🇩', { index: 2, remove: 2, insert: '🇩' })
  runDiffTest('a🇧🇩', '🇦🇩', { index: 0, remove: 3, insert: '🇦' })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatDiffing = tc => {
  const a = prng.word(tc.prng)
  const b = prng.word(tc.prng)
  const change = simpleDiffString(a, b)
  const recomposed = str.splice(a, change.index, change.remove, change.insert)
  t.compareStrings(recomposed, b)
}

/**
 * @param {t.TestCase} tc
 */
export const testSimpleDiffWithCursor = tc => {
  const initial = 'Hello WorldHello World'
  const expected = 'Hello World'
  {
    const change = simpleDiffStringWithCursor(initial, 'Hello World', 0) // should delete the first hello world
    t.compare(change, { insert: '', remove: 11, index: 0 })
    const recomposed = str.splice(initial, change.index, change.remove, change.insert)
    t.compareStrings(expected, recomposed)
  }
  {
    const change = simpleDiffStringWithCursor(initial, 'Hello World', 11) // should delete the second hello world
    t.compare(change, { insert: '', remove: 11, index: 11 })
    const recomposedSecond = str.splice(initial, change.index, change.remove, change.insert)
    t.compareStrings(recomposedSecond, expected)
  }
  {
    const change = simpleDiffStringWithCursor(initial, 'Hello World', 5) // should delete in the midst of Hello World
    t.compare(change, { insert: '', remove: 11, index: 5 })
    const recomposed = str.splice(initial, change.index, change.remove, change.insert)
    t.compareStrings(expected, recomposed)
  }
  {
    const initial = 'Hello my World'
    const change = simpleDiffStringWithCursor(initial, 'Hello World', 0) // Should delete after the current cursor position
    t.compare(change, { insert: '', remove: 3, index: 5 })
    const recomposed = str.splice(initial, change.index, change.remove, change.insert)
    t.compareStrings(expected, recomposed)
  }
  {
    const initial = '🚧🚧🚧'
    const change = simpleDiffStringWithCursor(initial, '🚧🚧', 2) // Should delete after the midst of 🚧
    t.compare(change, { insert: '', remove: 2, index: 2 })
    const recomposed = str.splice(initial, change.index, change.remove, change.insert)
    t.compareStrings('🚧🚧', recomposed)
  }
  {
    const initial = '🚧👷🚧👷'
    const change = simpleDiffStringWithCursor(initial, '🚧🚧', 2) // Should delete after the first 🚧 and insert 🚧
    t.compare(change, { insert: '🚧', remove: 6, index: 2 })
    const recomposed = str.splice(initial, change.index, change.remove, change.insert)
    t.compareStrings('🚧🚧', recomposed)
  }
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
