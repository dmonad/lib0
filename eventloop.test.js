import * as eventloop from './eventloop.js'
import * as t from './testing.js'
import * as promise from './promise.js'

/**
 * @param {t.TestCase} tc
 */
export const testEventloopOrder = tc => {
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
 * @param {t.TestCase} tc
 */
export const testTimeout = async tc => {
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
 * @param {t.TestCase} tc
 */
export const testInterval = async tc => {
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
 * @param {t.TestCase} tc
 */
export const testAnimationFrame = async tc => {
  let x = false
  eventloop.animationFrame(() => { x = true })
  await promise.until(0, () => x)
  t.assert(x)
}

/**
 * @param {t.TestCase} tc
 */
export const testIdleCallback = async tc => {
  await promise.create(resolve => {
    eventloop.idleCallback(resolve)
  })
}
