import * as array from './array.js'
import * as t from './testing.js'

/**
 * @param {t.TestCase} _tc
 */
export const testIsarrayPerformance = _tc => {
  const N = 100000
  /**
   * @type {Array<any>}
   */
  const objects = []
  for (let i = 0; i < N; i++) {
    if (i % 2 === 0) {
      objects.push([i])
    } else {
      objects.push({ i })
    }
  }
  const timeConstructor = t.measureTime('constructor check', () => {
    let collectedArrays = 0
    objects.forEach(obj => {
      if (obj.constructor === Array) {
        collectedArrays++
      }
    })
    t.assert(collectedArrays === N / 2)
  })
  const timeIsarray = t.measureTime('Array.isArray', () => {
    let collectedArrays = 0
    objects.forEach(obj => {
      if (array.isArray(obj)) {
        collectedArrays++
      }
    })
    t.assert(collectedArrays === N / 2)
  })
  t.assert(timeIsarray < timeConstructor * 2, 'Expecting that isArray is not much worse than a constructor check')
}

/**
 * @param {t.TestCase} _tc
 */
export const testAppend = _tc => {
  const arr = [1, 2, 3]
  array.appendTo(arr, array.copy(arr))
  t.compareArrays(arr, [1, 2, 3, 1, 2, 3])
}

/**
 * @param {t.TestCase} _tc
 */
export const testBasic = _tc => {
  const arr = array.create()
  array.appendTo(arr, array.from([1]))
  t.assert(array.last(arr) === 1)
}

/**
 * @param {t.TestCase} _tc
 */
export const testflatten = _tc => {
  const arr = [[1, 2, 3], [4]]
  t.compareArrays(array.flatten(arr), [1, 2, 3, 4])
}

/**
 * @param {t.TestCase} _tc
 */
export const testFolding = _tc => {
  /**
   * @param {number} n
   */
  const testcase = n => {
    // We mess with the seed (+/-1) to catch some edge cases without changing the result
    const result = -1 + array.fold(array.unfold(n, i => i), 1, (accumulator, item, index) => {
      t.assert(accumulator === index + 1)
      t.assert(accumulator === item + 1)
      return accumulator + 1
    })
    t.assert(result === n)
  }
  testcase(0)
  testcase(1)
  testcase(100)
}

/**
 * @param {t.TestCase} _tc
 */
export const testEvery = _tc => {
  const arr = [1, 2, 3]
  t.assert(array.every(arr, x => x <= 3))
  t.assert(!array.every(arr, x => x < 3))
  t.assert(array.some(arr, x => x === 2))
  t.assert(!array.some(arr, x => x === 42))
}

/**
 * @param {t.TestCase} _tc
 */
export const testIsArray = _tc => {
  t.assert(array.isArray([]))
  t.assert(array.isArray([1]))
  t.assert(array.isArray(Array.from(new Set([3]))))
  t.assert(!array.isArray(1))
  t.assert(!array.isArray(0))
  t.assert(!array.isArray(''))
}

/**
 * @param {t.TestCase} _tc
 */
export const testUnique = _tc => {
  t.compare([1, 2], array.unique([1, 2, 1, 2, 2, 1]))
  t.compare([], array.unique([]))
  t.compare([{ el: 1 }], array.uniqueBy([{ el: 1 }, { el: 1 }], o => o.el))
  t.compare([], array.uniqueBy([], o => o))
}
