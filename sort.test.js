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
 * @param {function(T,T):number} compare 0 if equal, 1 if a<b, -1 otherwise
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
  if (t.extensive) {
    t.describe('sort 1M elements')
    runSortTest(tc, createArray(1000000), compare, getVal)
    t.describe('sort 10M elements')
    runSortTest(tc, createArray(10000000), compare, getVal)
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testSortUint16 = tc => {
  t.skip(!t.production)
  /**
   * @param {number} i
   * @return {number}
   */
  const getVal = i => i
  /**
   * @param {number} a
   * @param {number} b
   * @return {number}
   */
  const compare = (a, b) => a - b
  /**
   * @param {number} len
   * @return {Array<number>}
   */
  const createArray = len => Array.from(new Uint16Array(prng.uint8Array(tc.prng, len * 2)))
  createSortTest(tc, createArray, compare, getVal)
}

/**
 * @param {t.TestCase} tc
 */
export const testSortUint32 = tc => {
  t.skip(!t.production)
  /**
   * @param {number} i
   * @return {number}
   */
  const getVal = i => i
  /**
   * @param {number} a
   * @param {number} b
   * @return {number}
   */
  const compare = (a, b) => a - b
  /**
   * @param {number} len
   * @return {Array<number>}
   */
  const createArray = len => Array.from(prng.uint32Array(tc.prng, len))
  createSortTest(tc, createArray, compare, getVal)
}

/**
 * @param {t.TestCase} tc
 */
export const testSortObjectUint32 = tc => {
  /**
   * @param {{index:number}} obj
   * @return {number}
   */
  const getVal = obj => obj.index
  /**
   * @param {{index:number}} a
   * @param {{index:number}} b
   * @return {number}
   */
  const compare = (a, b) => a.index - b.index
  /**
   * @param {number} len
   * @return {Array<{index:number}>}
   */
  const createArray = len => Array.from(prng.uint32Array(tc.prng, len)).map(index => ({ index }))
  createSortTest(tc, createArray, compare, getVal)
}

/**
 * @param {t.TestCase} tc
 */
export const testListVsArrayPerformance = tc => {
  /**
   * @typedef {{ val: number }} Val
   * @typedef {{ val: Val, next: item }|null} item
   */
  const len = 100000
  t.measureTime('array creation', () => {
    /**
     * @type {Array<Val>}
     */
    const array = new Array(len)
    for (let i = 0; i < len; i++) {
      array[i] = { val: i }
    }
  })
  t.measureTime('list creation', () => {
    /**
     * @type {item}
     */
    const listStart = { val: { val: 0 }, next: null }
    for (let i = 1, n = listStart; i < len; i++) {
      const next = { val: { val: i }, next: null }
      n.next = next
      n = next
    }
  })
}
