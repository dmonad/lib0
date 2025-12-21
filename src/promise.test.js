import * as promise from './promise.js'
import * as t from './testing.js'
import * as time from './time.js'
import * as error from './error.js'

/**
 * @param {Promise<any>} p
 * @param {number} min
 * @param {number} max
 */
const measureP = (p, min, max) => {
  const start = time.getUnixTime()
  return p.then(() => {
    const duration = time.getUnixTime() - start
    t.assert(duration <= max, 'Expected promise to take less time')
    t.assert(duration >= min, 'Expected promise to take more time')
  })
}

/**
 * @template T
 * @param {Promise<T>} p
 * @return {Promise<T>}
 */
const failsP = p => promise.create((resolve, reject) => p.then(() => reject(error.create('Promise should fail')), resolve))

/**
 * @param {t.TestCase} _tc
 */
export const testRepeatPromise = async _tc => {
  t.assert(promise.createEmpty(r => r()).constructor === Promise, 'p.create() creates a Promise')
  t.assert(promise.resolve().constructor === Promise, 'p.reject() creates a Promise')
  const rejectedP = promise.reject()
  t.assert(rejectedP.constructor === Promise, 'p.reject() creates a Promise')
  rejectedP.catch(() => {})
  await promise.createEmpty(r => r())
  await failsP(promise.reject())
  await promise.resolve()
  await measureP(promise.wait(10), 7, 1000)
  await measureP(failsP(promise.until(15, () => false)), 15, 1000)
  await measureP(failsP(promise.untilAsync(() => false, 15)), 15, 1000)
  const startTime = time.getUnixTime()
  await measureP(promise.until(0, () => (time.getUnixTime() - startTime) > 100), 100, 1000)
  const startTime2 = time.getUnixTime()
  await measureP(promise.untilAsync(() => (time.getUnixTime() - startTime2) > 100), 100, 1000)
  await promise.all([promise.wait(5), promise.wait(10)])
}

/**
 * @param {t.TestCase} _tc
 */
export const testispromise = _tc => {
  t.assert(promise.isPromise(new Promise(() => {})))
  t.assert(promise.isPromise(promise.create(() => {})))
  const rej = promise.reject()
  t.assert(promise.isPromise(rej))
  rej.catch(() => {})
  t.assert(promise.isPromise(promise.resolve()))
  t.assert(promise.isPromise({ then: () => {}, catch: () => {}, finally: () => {} }))
  t.fails(() => {
    t.assert(promise.isPromise({ then: () => {}, catch: () => {} }))
  })
}

/**
 * @param {t.TestCase} _tc
 */
export const testTypings = async _tc => {
  const ps = await promise.all([promise.resolveWith(4), 'string'])
  /**
   * @type {number}
   */
  const a = ps[0]
  /**
   * @type {string}
   */
  const b = ps[1]
  t.assert(typeof a === 'number' && typeof b === 'string')
}
