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
  const iterations = 1000
  const waitTime = 0
  await t.measureTimeAsync(`Awaiting ${iterations} callbacks (pledge)`, () =>
    pledge.coroutine(function * () {
      for (let i = 0; i < iterations; i++) {
        yield pledge.wait(waitTime)
      }
    }).promise()
  )
  await t.measureTimeAsync(`Awaiting ${iterations} callbacks (promise)`, async () => {
    for (let i = 0; i < iterations; i++) {
      await promise.wait(waitTime)
    }
  })
}

/**
 * @param {t.TestCase} _tc
 */
export const testPledgeVsPromisePerformanceResolved = async _tc => {
  const iterations = 100000
  await t.measureTimeAsync(`Awaiting ${iterations} callbacks (promise)`, async () => {
    for (let i = 0; i < iterations; i++) {
      await promise.resolve(0)
    }
  })
  await t.measureTimeAsync(`Awaiting ${iterations} callbacks (pledge)`, () =>
    pledge.coroutine(function * () {
      for (let i = 0; i < iterations; i++) {
        yield 0
      }
    }).promise()
  )
}
