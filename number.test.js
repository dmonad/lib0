import * as t from './testing'
import * as number from './number'

/**
 * @param {t.TestCase} tc
 */
export const testNumber = tc => {
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
}
