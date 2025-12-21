import * as t from './testing.js'
import * as pair from './pair.js'
import * as math from './math.js'

/**
 * @param {t.TestCase} tc
 */
export const testPair = tc => {
  const ps = [pair.create(1, 2), pair.create(3, 4), pair.createReversed(6, 5)]
  t.describe('Counting elements in pair list')
  let countLeft = 0
  let countRight = 0
  pair.forEach(ps, (left, right) => {
    countLeft += left
    countRight += right
  })
  t.assert(countLeft === 9)
  t.assert(countRight === 12)
  t.assert(countLeft === pair.map(ps, left => left).reduce(math.add))
  t.assert(countRight === pair.map(ps, (left, right) => right).reduce(math.add))
}
