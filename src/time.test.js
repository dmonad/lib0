import * as time from './time.js'
import * as t from './testing.js'
import * as math from './math.js'

/**
 * @param {t.TestCase} tc
 */
export const testTime = tc => {
  const l = time.getDate().getTime()
  const r = time.getUnixTime()
  t.assert(math.abs(l - r) < 10, 'Times generated are roughly the same')
}

/**
 * @param {t.TestCase} tc
 */
export const testHumanDuration = tc => {
  t.assert(time.humanizeDuration(10) === '10ms')
  t.assert(time.humanizeDuration(0.1) === '100μs')
  t.assert(time.humanizeDuration(61030) === '1min 1s')
  t.assert(time.humanizeDuration(60030) === '1min')
  t.assert(time.humanizeDuration(3600000) === '1h')
  t.assert(time.humanizeDuration(3640000) === '1h 1min')
  t.assert(time.humanizeDuration(3700000) === '1h 2min')
  t.assert(time.humanizeDuration(60 * 60 * 1000 + 29000) === '1h')
  t.assert(time.humanizeDuration(60 * 60 * 1000 + 31000) === '1h 1min')
  t.assert(time.humanizeDuration(60 * 60 * 1000 + 31000 * 3) === '1h 2min')
  t.assert(time.humanizeDuration(3600000 * 25) === '1d 1h')
  t.assert(time.humanizeDuration(3600000 * 24.6) === '1d 1h')
  t.assert(time.humanizeDuration(3600000 * 25.6) === '1d 2h')
  t.assert(time.humanizeDuration(3600000 * 24 * 400) === '400d')
  // test round
  t.assert(time.humanizeDuration(6001) === '6s')
}
