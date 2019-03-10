import * as time from './time.js'
import * as t from './testing.js'
import * as math from './math.js'

export const testTime = tc => {
  const l = time.getDate().getTime()
  const r = time.getUnixTime()
  t.assert(math.abs(l - r) < 10, 'Times generated are roughly the same')
}
