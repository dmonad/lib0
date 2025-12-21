import * as f from './function.js'
import * as t from './testing.js'

/**
 * @param {t.TestCase} _tc
 */
export const testBasics = _tc => {
  let calls = 0
  f.apply(() => calls++)
  t.assert(calls === 1)
  t.assert(f.isOneOf(1, [3, 2, 1]))
  t.assert(!f.isOneOf(0, [3, 2, 1]))
  // test is*
  const arr = [1, 'two', [1], { one: 1 }]
  arr.forEach(val => {
    if (f.isArray(val)) {
      /**
       * @type {Array<any>}
       */
      const yy = val
      t.assert(yy)
    }
    if (f.isString(val)) {
      /**
       * @type {string}
       */
      const yy = val
      t.assert(yy)
    }
    if (f.isNumber(val)) {
      /**
       * @type {number}
       */
      const yy = val
      t.assert(yy)
    }
    if (f.is(val, String)) {
      /**
       * @type {string}
       */
      const yy = val
      t.assert(yy)
    }
    if (f.isTemplate(Number)(val)) {
      /**
       * @type {number}
       */
      const yy = val
      t.assert(yy)
    }
  })
}

/**
 * @param {t.TestCase} _tc
 */
export const testCallAll = _tc => {
  const err = new Error()
  let calls = 0
  try {
    f.callAll([
      () => {
        calls++
      },
      () => {
        throw err
      },
      f.nop,
      () => {
        calls++
      }
    ], [])
  } catch (e) {
    t.assert(calls === 2)
    return
  }
  t.fail('Expected callAll to throw error')
}

/**
 * @param {t.TestCase} _tc
 */
export const testDeepEquality = _tc => {
  t.assert(f.equalityDeep(1, 1))
  t.assert(!f.equalityDeep(1, 2))
  t.assert(!f.equalityDeep(1, '1'))
  t.assert(!f.equalityDeep(1, null))

  const obj = { b: 5 }
  const map1 = new Map()
  const map2 = new Map()
  const map3 = new Map()
  const map4 = new Map()
  map1.set('a', obj)
  map2.set('a', { b: 5 })
  map3.set('b', obj)
  map4.set('a', obj)
  map4.set('b', obj)

  t.assert(f.equalityDeep({ a: 4 }, { a: 4 }))
  t.assert(f.equalityDeep({ a: 4, obj: { b: 5 } }, { a: 4, obj }))
  t.assert(!f.equalityDeep({ a: 4 }, { a: 4, obj }))
  t.assert(f.equalityDeep({ a: [], obj }, { a: [], obj }))
  t.assert(!f.equalityDeep({ a: [], obj }, { a: [], obj: undefined }))

  t.assert(f.equalityDeep({}, {}))
  t.assert(!f.equalityDeep({}, { a: 4 }))

  t.assert(f.equalityDeep([{ a: 4 }, 1], [{ a: 4 }, 1]))
  t.assert(!f.equalityDeep([{ a: 4 }, 1], [{ a: 4 }, 2]))
  t.assert(!f.equalityDeep([{ a: 4 }, 1], [{ a: 4 }, 1, 3]))
  t.assert(f.equalityDeep([], []))
  t.assert(!f.equalityDeep([1], []))

  t.assert(f.equalityDeep(map1, map2))
  t.assert(!f.equalityDeep(map1, map3))
  t.assert(!f.equalityDeep(map1, map4))

  const set1 = new Set([1])
  const set2 = new Set([true])
  const set3 = new Set([1, true])
  const set4 = new Set([true])

  t.assert(f.equalityDeep(set2, set4))
  t.assert(!f.equalityDeep(set1, set2))
  t.assert(!f.equalityDeep(set1, set3))
  t.assert(!f.equalityDeep(set1, set4))
  t.assert(!f.equalityDeep(set2, set3))
  t.assert(f.equalityDeep(set2, set4))

  const buf1 = Uint8Array.from([1, 2])
  const buf2 = Uint8Array.from([1, 3])
  const buf3 = Uint8Array.from([1, 2, 3])
  const buf4 = Uint8Array.from([1, 2])

  t.assert(!f.equalityDeep(buf1, buf2))
  t.assert(!f.equalityDeep(buf2, buf3))
  t.assert(!f.equalityDeep(buf3, buf4))
  t.assert(f.equalityDeep(buf4, buf1))

  t.assert(!f.equalityDeep(buf1.buffer, buf2.buffer))
  t.assert(!f.equalityDeep(buf2.buffer, buf3.buffer))
  t.assert(!f.equalityDeep(buf3.buffer, buf4.buffer))
  t.assert(f.equalityDeep(buf4.buffer, buf1.buffer))

  t.assert(!f.equalityDeep(buf1, buf4.buffer))
}
