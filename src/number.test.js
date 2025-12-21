import * as t from './testing.js'
import * as number from './number.js'
import * as random from './random.js'
import * as math from './math.js'

/**
 * @param {t.TestCase} _tc
 */
export const testNumber = _tc => {
  t.describe('isNaN')
  t.assert(number.isNaN(NaN))
  t.assert(!number.isNaN(1 / 0))
  // @ts-ignore
  t.assert(number.isNaN('a' / 0))
  t.assert(!number.isNaN(0))
  t.describe('isInteger')
  t.assert(!number.isInteger(1 / 0))
  t.assert(!number.isInteger(NaN))
  t.assert(number.isInteger(0))
  t.assert(number.isInteger(-1))
  t.assert(number.countBits(1) === 1)
  t.assert(number.countBits(3) === 2)
  t.assert(number.countBits(128 + 3) === 3)
}

/**
 * This benchmark confirms performance of division vs shifting numbers.
 *
 * @param {t.TestCase} tc
 */
export const testShiftVsDivision = tc => {
  /**
   * @type {Array<number>}
   */
  const numbers = []

  for (let i = 0; i < 10000; i++) {
    numbers.push(random.uint32())
  }

  t.measureTime('comparison', () => {
    for (let i = 0; i < numbers.length; i++) {
      let n = numbers[i]
      while (n > 0) {
        const ns = n >>> 7
        const nd = math.floor(n / 128)
        t.assert(ns === nd)
        n = nd
      }
    }
  })

  t.measureTime('shift', () => {
    let x = 0
    for (let i = 0; i < numbers.length; i++) {
      x = numbers[i] >>> 7
    }
    t.info('' + x)
  })

  t.measureTime('division', () => {
    for (let i = 0; i < numbers.length; i++) {
      math.floor(numbers[i] / 128)
    }
  })

  {
    /**
     * @type {Array<number>}
     */
    const divided = []
    /**
     * @type {Array<number>}
     */
    const shifted = []
    t.measureTime('division', () => {
      for (let i = 0; i < numbers.length; i++) {
        divided.push(math.floor(numbers[i] / 128))
      }
    })

    t.measureTime('shift', () => {
      for (let i = 0; i < numbers.length; i++) {
        shifted.push(numbers[i] >>> 7)
      }
    })

    t.compareArrays(shifted, divided)
  }
}
