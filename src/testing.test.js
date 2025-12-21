import * as t from './testing.js'
import * as math from './math.js'
import * as buffer from './buffer.js'
import * as map from './map.js'
import * as promise from './promise.js'
import * as error from './error.js'

/* c8 ignore next */
export const nottestingNotTested = () => {
  t.assert(false, 'This test should not be executed because the name doesnt start with "test"')
}

export const testAssertTyping = () => {
  const q = Math.random()
  const x = q === 0.3 ? null : { a: 4 } // this should always be an object
  // t.assert(x.a === 4) - this will give a type error because the type is uncertain
  t.assert(x)
  t.assert(x.a === 4) // this works because x is asserted
}

/**
 * @param {t.TestCase} _tc
 */
export const testComparing = _tc => {
  t.compare({}, {})
  t.compare({ a: 4 }, { a: 4 }, 'simple compare (object)')
  t.compare([1, 2], [1, 2], 'simple compare (array)')
  t.compare({ a: [1, 2] }, { a: [1, 2] }, 'simple compare nested')
  t.compare(new Set(['3', 1234]), new Set(['3', 1234]), 'compare Sets')
  const map1 = map.create()
  map1.set(1, 2)
  map1.set('x', {})
  map1.set(98, 'tst')
  const map2 = new Map()
  map2.set(1, 2)
  map2.set('x', {})
  map2.set(98, 'tst')
  t.compare(map1, map2, 'compare Maps')
  t.describe('The following errors are expected!')
  t.fails(() => {
    error.assert(false)
  })
  error.assert(true)
  t.fails(() => {
    t.compare({ a: 4 }, { b: 5 }, 'childs are not equal')
  })
  t.fails(() => {
    t.compare({ a: 4 }, { a: 5 }, 'childs are not equal')
  })
  t.fails(() => {
    t.compare({ a: 4 }, null, 'childs are not equal')
  })
  t.fails(() => {
    // @ts-ignore
    t.compare({ a: 4 }, [4], 'childs have different types')
  })
  t.fails(() => {
    t.compare({ a: 4 }, { a: 4, b: 5 }, 'childs have different length (object)')
  })
  t.fails(() => {
    t.compare([1], [1, 2]) // childs have different length (array) -- no message
  })
  t.fails(() => {
    t.compare(buffer.createUint8ArrayFromLen(1), buffer.createUint8ArrayFromLen(2), 'Uint8Arrays have different length')
  })
  t.fails(() => {
    t.compare(buffer.createUint8ArrayFromLen(1).buffer, buffer.createUint8ArrayFromLen(2).buffer, 'ArrayBuffer have different length')
  })
  t.fails(() => {
    t.compareStrings('str1', 'str2', 'Strings comparison can fail')
  })
  t.compareArrays([], [], 'Comparing empty arrays')
  t.fails(() => {
    t.compareArrays([1], [1, 2], 'Compare arrays with different length')
  })
  t.fails(() => {
    t.compareArrays([1], [2]) // Compare different arrays -- no message
  })
  t.compareObjects({ x: 1 }, { x: 1 }, 'comparing objects')
  t.fails(() => {
    t.compareObjects({}, { x: 1 }, 'compareObjects can fail')
  })
  t.fails(() => {
    t.compareObjects({ x: 3 }, { x: 1 }) // Compare different objects -- no message
  })
  t.fails(() => {
    t.compare({ x: undefined }, { y: 1 }, 'compare correctly handles undefined')
  })
  t.fails(() => {
    t.compareObjects({ x: undefined }, { y: 1 }, 'compare correctly handles undefined')
  })
  t.describe('Map fails')
  t.fails(() => {
    const m1 = new Map()
    m1.set(1, 2)
    const m2 = new Map()
    m2.set(1, 3)
    t.compare(m1, m2) // childs have different length (array) -- no message
  })
  t.fails(() => {
    const m1 = new Map()
    m1.set(2, 2)
    const m2 = new Map()
    m2.set(1, 2)
    t.compare(m1, m2) // childs have different length (array) -- no message
  })
  t.fails(() => {
    const m1 = new Map()
    m1.set(1, 2)
    const m2 = new Map()
    t.compare(m1, m2) // childs have different length (array) -- no message
  })
  t.describe('Set fails')
  t.fails(() => {
    t.compare(new Set([1]), new Set([1, 2])) // childs have different length (array) -- no message
  })
  t.fails(() => {
    t.compare(new Set([1]), new Set([2])) // childs have different length (array) -- no message
  })
  t.group('test object with constructor set to `undefined`', () => {
    const a = Object.create(null)
    const b = Object.create(null)
    a.x = 42
    b.x = 42
    t.compare(a, b)
  })
}

export const testFailing = async () => {
  t.fails(() => {
    t.fail('This fail is expected')
  })
  await t.promiseRejected(() => promise.reject(error.create('should be rejected')))
  t.fails(() => {
    t.fails(() => {})
  })
  await t.failsAsync(async () => {
    await t.failsAsync(async () => { })
  })
  await t.promiseRejected(() =>
    t.promiseRejected(() => promise.resolve())
  )
}

export const testSkipping = () => {
  t.skip(false)
  t.assert(true)
  t.skip()
  /* c8 ignore next */
  t.fail('should have skipped')
}

export const testAsync = async () => {
  await t.measureTimeAsync('time', () => promise.create(r => setTimeout(r)))
  await t.groupAsync('some description', () => promise.wait(1))
  await t.promiseRejected(() => promise.reject(error.create('should be rejected')))
}

export const testRepeatRepetition = () => {
  const arr = []
  const n = 100
  for (let i = 1; i <= n; i++) {
    arr.push(i)
  }
  t.assert(arr.reduce(math.add, 0) === (n + 1) * n / 2)
}
