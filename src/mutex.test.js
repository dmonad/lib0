import * as t from './testing.js'
import * as mutex from './mutex.js'

/**
 * @param {t.TestCase} _tc
 */
export const testMutex = _tc => {
  const mux = mutex.createMutex()
  let res = ''
  mux(() => {
    res += '1'
    mux(() => {
      res += 'Y'
    }, () => {
      res += '2'
      mux(() => {
        res += '3'
      })
    })
  }, () => {
    res += 'X'
  })
  t.assert(res === '12')
}
