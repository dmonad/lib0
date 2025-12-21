import * as t from './testing.js'
import * as set from './set.js'

/**
 * @param {t.TestCase} _tc
 */
export const testFirst = _tc => {
  const two = set.from(['a', 'b'])
  const one = set.from(['b'])
  const zero = set.create()
  t.assert(set.first(two) === 'a')
  t.assert(set.first(one) === 'b')
  t.assert(set.first(zero) === undefined)
  t.compare(set.toArray(one), ['b'])
}
