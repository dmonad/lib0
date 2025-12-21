import * as t from './testing.js'
import * as pledge from './pledge.js'
import * as promise from './promise.js'

/**
 * @param {t.TestCase} _tc
 */
export const testPledgeCoroutine = async _tc => {
  let called = false
  const p = pledge.coroutine(function * () {
    const y = pledge.wait(10).map(() => 42)
    const num = yield y
    console.log({ num })
    t.assert(num === 42)
    called = true
    return 42
  })
  t.assert(!called)
  await p.promise()
  t.assert(called)
}

/**
 * @param {t.TestCase} _tc
 */
export const testPledgeVsPromisePerformanceTimeout = async _tc => {
  const iterations = 100
  const waitTime = 0
  await t.measureTimeAsync(`Awaiting ${iterations} callbacks (promise)`, async () => {
    for (let i = 0; i < iterations; i++) {
      await promise.wait(waitTime)
    }
  })
  await t.measureTimeAsync(`Awaiting ${iterations} callbacks (pledge)`, () =>
    pledge.coroutine(function * () {
      for (let i = 0; i < iterations; i++) {
        yield pledge.wait(waitTime)
      }
    }).promise()
  )
}

/**
 * @typedef {Promise<number> | number} MaybePromise
 */

/**
 * @param {t.TestCase} _tc
 */
export const testPledgeVsPromisePerformanceResolved = async _tc => {
  const iterations = 100
  t.measureTime(`Awaiting ${iterations} callbacks (only iterate)`, () => {
    for (let i = 0; i < iterations; i++) { /* nop */ }
  })
  await t.measureTimeAsync(`Awaiting ${iterations} callbacks (promise)`, async () => {
    for (let i = 0; i < iterations; i++) {
      await promise.resolve(0)
    }
  })
  await t.measureTimeAsync(`Awaiting ${iterations} callbacks (await, no resolve)`, async () => {
    for (let i = 0; i < iterations; i++) {
      /**
       * @type {Promise<number> | number}
       */
      const x = 0
      await x
    }
  })
  await t.measureTimeAsync(`Awaiting ${iterations} callbacks (pledge)`, () =>
    pledge.coroutine(function * () {
      for (let i = 0; i < iterations; i++) {
        yield 0
      }
    }).promise()
  )
  t.measureTime(`Awaiting ${iterations} callbacks (pledge, manual wrap)`, () => {
    /**
     * @type {pledge.Pledge<number>}
     */
    let val = 0
    for (let i = 0; i < iterations; i++) {
      val = pledge.map(val, _v => 0)
    }
  })
}
