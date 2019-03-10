import * as time from './time.js'
import * as t from './testing.js'

export const testTime = tc => {
  t.assert(time.getDate().getTime() === time.getUnixTime())
}
