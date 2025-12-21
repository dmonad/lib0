import * as t from './testing.js'
import * as object from './object.js'
import * as math from './math.js'

export const testEqualFlat = () => {
  t.assert(!object.equalFlat({ fontFamily: 'MSYahei' }, { fontFamily: null }))
}

/**
 * @param {t.TestCase} _tc
 */
export const testObject = _tc => {
  t.assert(object.create().constructor === undefined, 'object.create creates an empty object without constructor')
  t.describe('object.equalFlat')
  t.assert(object.equalFlat({}, {}), 'comparing equal objects')
  t.assert(object.equalFlat({ x: 1 }, { x: 1 }), 'comparing equal objects')
  t.assert(object.equalFlat({ x: 'dtrn' }, { x: 'dtrn' }), 'comparing equal objects')
  t.assert(!object.equalFlat({ x: {} }, { x: {} }), 'flatEqual does not dive deep')
  t.assert(object.equalFlat({ x: undefined }, { x: undefined }), 'flatEqual handles undefined')
  t.assert(!object.equalFlat({ x: undefined }, { y: {} }), 'flatEqual handles undefined')
  t.describe('object.every')
  // @ts-expect-error k has no overlap with "c"
  t.assert(object.every({ a: 1, b: 3 }, (v, k) => (v % 2) === 1 && k !== 'c'))
  t.assert(!object.every({ a: 1, b: 3, c: 5 }, (v, k) => (v % 2) === 1 && k !== 'c'))
  t.describe('object.some')
  t.assert(object.some({ a: 1, b: 3 }, (v, k) => v === 3 && k === 'b'))
  t.assert(!object.some({ a: 1, b: 5 }, (v, _k) => v === 3))
  t.assert(object.some({ a: 1, b: 5 }, () => true))
  t.assert(!object.some({ a: 1, b: 5 }, (_v, _k) => false))
  t.describe('object.forEach')
  let forEachSum = 0
  const r = { x: 1, y: 3 }
  object.forEach(r, (v, _k) => { forEachSum += v })
  t.assert(forEachSum === 4)
  t.describe('object.map')
  t.assert(object.map({ x: 1, z: 5 }, (v, _k) => v).reduce(math.add) === 6)
  t.describe('object.length')
  t.assert(object.length({}) === 0)
  t.assert(object.length({ x: 1 }) === 1)
  t.assert(object.isEmpty({}))
  t.assert(!object.isEmpty({ a: 3 }))
  t.assert(object.isEmpty(null))
  t.assert(object.isEmpty(undefined))
  /**
   * @type {Array<string>}
   */
  const keys = object.keys({ a: 1, b: 2 })
  t.compare(keys, ['a', 'b'])
  /**
   * @type {Array<number>}
   */
  const vals = object.values({ a: 1 })
  t.compare(vals, [1])
}

/**
 * @param {t.TestCase} _tc
 */
export const testFreeze = _tc => {
  const o1 = { a: { b: [1, 2, 3] } }
  const o2 = [1, 2, { a: 'hi' }]
  object.deepFreeze(o1)
  object.deepFreeze(o2)
  t.fails(() => {
    o1.a.b.push(4)
  })
  t.fails(() => {
    o1.a.b = [1]
  })
  t.fails(() => {
    o2.push(4)
  })
  t.fails(() => {
    o2[2] = 42
  })
  t.fails(() => {
    // @ts-ignore-next-line
    o2[2].a = 'hello'
  })
}

/**
 * @param {t.TestCase} _tc
 */
export const testSetifundefined = _tc => {
  const o = { a: 42, b: '42' }
  object.setIfUndefined(o, 'a', () => 43)
  object.setIfUndefined(o, 'b', () => '43')
  /**
   * @type {{ [key: number]: string}}
   */
  const o2 = {}
  object.setIfUndefined(o2, 42, () => '52')
  /**
   * @type {{ [key: string]: number}}
   */
  const o3 = {}
  object.setIfUndefined(o3, '42', () => 52)
}
