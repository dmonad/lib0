import * as prng from './prng.js'
import * as t from './testing.js'
import * as sort from './sort.js'

/**
 * @template T
 * @param {t.TestCase} tc
 * @param {Array<T>} arr
 * @param {function(T,T):number} compare
 * @param {function(T):number} getVal
 */
const runSortTest = (tc, arr, compare, getVal) => {
  const arrSort = arr
  const arrQuicksort = arr.slice()
  const arrInsertionsort = arr.slice()
  t.measureTime('Array.constructor.sort', () => {
    arrSort.sort(compare)
  })
  if (arrInsertionsort.length <= 10000) {
    t.measureTime('Insertionsort', () => {
      sort.insertionSort(arrInsertionsort, compare)
    })
    t.compareArrays(arrSort, arrInsertionsort, 'compare Insertionsort with expected result')
  }
  t.measureTime('Quicksort', () => {
    sort.quicksort(arrQuicksort, compare)
  })
  // quickSort is not stable
  t.compareArrays(arrSort.map(getVal), arrQuicksort.map(getVal), 'compare Quicksort with expected result')
}

/**
 * @template T
 * @param {t.TestCase} tc
 * @param {function(number):Array<T>} createArray
 * @param {function(T):number} getVal
 */
const createSortTest = (tc, createArray, compare, getVal) => {
  t.describe('sort 10 elements')
  runSortTest(tc, createArray(10), compare, getVal)
  t.describe('sort 10 elements')
  runSortTest(tc, createArray(10), compare, getVal)
  t.describe('sort 10 elements')
  runSortTest(tc, createArray(10), compare, getVal)
  t.describe('sort 50 elements')
  runSortTest(tc, createArray(50), compare, getVal)
  t.describe('sort 100 elements')
  runSortTest(tc, createArray(100), compare, getVal)
  t.describe('sort 500 elements')
  runSortTest(tc, createArray(500), compare, getVal)
  t.describe('sort 1k elements')
  runSortTest(tc, createArray(1000), compare, getVal)
  t.describe('sort 10k elements')
  runSortTest(tc, createArray(10000), compare, getVal)
  t.describe('sort 100k elements')
  runSortTest(tc, createArray(100000), compare, getVal)
  t.describe('sort 1M elements')
  runSortTest(tc, createArray(1000000), compare, getVal)
  t.describe('sort 10M elements')
  runSortTest(tc, createArray(10000000), compare, getVal)
}

/**
 * @param {t.TestCase} tc
 */
export const testSortUint16 = tc => {
  const getVal = i => i
  const compare = (a, b) => a - b
  const createArray = len => Array.from(new Uint16Array(prng.arrayBuffer(tc.prng, len * 2)))
  createSortTest(tc, createArray, compare, getVal)
}

/**
 * @param {t.TestCase} tc
 */
export const testSortUint32 = tc => {
  const getVal = i => i
  const compare = (a, b) => a - b
  const createArray = len => Array.from(new Uint32Array(prng.arrayBuffer(tc.prng, len * 4)))
  createSortTest(tc, createArray, compare, getVal)
}

/**
 * @param {t.TestCase} tc
 */
export const testSortObjectUint32 = tc => {
  const getVal = obj => obj.index
  const compare = (a, b) => a.index - b.index
  const createArray = len => Array.from(new Uint32Array(prng.arrayBuffer(tc.prng, len * 4))).map(index => ({ index }))
  createSortTest(tc, createArray, compare, getVal)
}
