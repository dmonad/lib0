import * as eventloop from './eventloop.js'
import * as t from './testing.js'
import * as promise from './promise.js'

/**
 * @param {t.TestCase} _tc
 */
export const testEventloopOrder = _tc => {
  let currI = 0
  for (let i = 0; i < 10; i++) {
    const bi = i
    eventloop.enqueue(() => {
      t.assert(currI++ === bi)
    })
  }
  eventloop.enqueue(() => {
    t.assert(currI === 10)
  })
  t.assert(currI === 0)
  return promise.all([
    promise.createEmpty(resolve => eventloop.enqueue(resolve)),
    promise.until(0, () => currI === 10)
  ])
}

/**
 * @param {t.TestCase} _tc
 */
export const testTimeout = async _tc => {
  let set = false
  const timeout = eventloop.timeout(0, () => {
    set = true
  })
  timeout.destroy()
  await promise.create(resolve => {
    eventloop.timeout(10, resolve)
  })
  t.assert(set === false)
}

/**
 * @param {t.TestCase} _tc
 */
export const testInterval = async _tc => {
  let set = false
  const timeout = eventloop.interval(1, () => {
    set = true
  })
  timeout.destroy()
  let i = 0
  eventloop.interval(1, () => {
    i++
  })
  await promise.until(0, () => i > 2)
  t.assert(set === false)
  t.assert(i > 1)
}

/**
 * @param {t.TestCase} _tc
 */
export const testAnimationFrame = async _tc => {
  let x = false
  eventloop.animationFrame(() => { x = true })
  await promise.until(0, () => x)
  t.assert(x)
}

/**
 * @param {t.TestCase} _tc
 */
export const testIdleCallback = async _tc => {
  await promise.create(resolve => {
    eventloop.idleCallback(resolve)
  })
}

/**
 * @param {t.TestCase} _tc
 */
export const testDebouncer = async _tc => {
  const debounce = eventloop.createDebouncer(10)
  let calls = 0
  debounce(() => {
    calls++
  })
  debounce(() => {
    calls++
  })
  t.assert(calls === 0)
  await promise.wait(20)
  t.assert(calls === 1)
}

/**
 * @param {t.TestCase} _tc
 */
export const testDebouncerTriggerAfter = async _tc => {
  const debounce = eventloop.createDebouncer(100, 100)
  let calls = 0
  debounce(() => {
    calls++
  })
  await promise.wait(40)
  debounce(() => {
    calls++
  })
  await promise.wait(30)
  debounce(() => {
    calls++
  })
  await promise.wait(50)
  debounce(() => {
    calls++
  })
  t.assert(calls === 0)
  await promise.wait(0)
  t.assert(calls === 1)
  await promise.wait(30)
  t.assert(calls === 1)
}
