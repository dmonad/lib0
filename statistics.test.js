import * as statistics from './statistics.js'
import * as t from './testing.js'
import * as math from './math.js'

/**
 * @param {t.TestCase} tc
 */
export const testMedian = tc => {
  t.assert(math.isNaN(statistics.median([])), 'median([]) = NaN')
  t.assert(statistics.median([1]) === 1, 'median([x]) = x')
  t.assert(statistics.median([1, 2, 3]) === 2, 'median([a,b,c]) = b')
  t.assert(statistics.median([1, 2, 3, 4]) === (2 + 3) / 2, 'median([a,b,c,d]) = (b+c)/2')
  t.assert(statistics.median([1, 2, 3, 4, 5]) === 3, 'median([a,b,c,d,e]) = c')
  t.assert(statistics.median([1, 2, 3, 4, 5, 6]) === (3 + 4) / 2, 'median([a,b,c,d,e,f]) = (c+d)/2')
}
