
import * as array from './array.js'
import * as t from './testing.js'

/**
 * @param {t.TestCase} tc
 */
export const testAppend = tc => {
  const arr = [1, 2, 3]
  array.appendTo(arr, arr.slice())
  t.compareArrays(arr, [1, 2, 3, 1, 2, 3])
}

/**
 * @param {t.TestCase} tc
 */
export const testflatten = tc => {
  const arr = [[1, 2, 3], [4]]
  t.compareArrays(array.flatten(arr), [1, 2, 3, 4])
}

/**
 * @param {t.TestCase} tc
 */
export const testIsArray = tc => {
  t.assert(array.isArray([]))
  t.assert(array.isArray([1]))
  t.assert(array.isArray(Array.from(new Set([3]))))
  t.assert(!array.isArray(1))
  t.assert(!array.isArray(0))
  t.assert(!array.isArray(''))
}
