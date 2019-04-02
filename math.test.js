import * as t from './testing.js'
import * as math from './math.js'

/**
 * @param {t.TestCase} tc
 */
export const testMath = tc => {
  t.describe('math.abs')
  t.assert(math.abs(-1) === 1)
  t.assert(math.abs(Number.MIN_SAFE_INTEGER) === Number.MAX_SAFE_INTEGER)
  t.assert(math.abs(Number.MAX_SAFE_INTEGER) === Number.MAX_SAFE_INTEGER)
  t.describe('math.add')
  t.assert([1, 2, 3, 4, 5].reduce(math.add) === 15)
  t.describe('math.ceil')
  t.assert(math.ceil(1.5) === 2)
  t.assert(math.ceil(-1.5) === -1)
  t.describe('math.floor')
  t.assert(math.floor(1.5) === 1)
  t.assert(math.floor(-1.5) === -2)
  t.describe('math.isNaN')
  t.assert(math.isNaN(NaN))
  // @ts-ignore
  t.assert(!math.isNaN(null))
  t.describe('math.max')
  t.assert([1, 3, 65, 1, 314, 25, 3475, 2, 1].reduce(math.max) === 3475)
  t.describe('math.min')
  t.assert([1, 3, 65, 1, 314, 25, 3475, 2, 1].reduce(math.min) === 1)
  t.describe('math.round')
  t.assert(math.round(0.5) === 1)
  t.assert(math.round(-0.5) === 0)
}
