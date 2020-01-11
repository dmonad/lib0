import * as t from './testing.js'
import * as object from './object.js'
import * as math from './math.js'

/**
 * @param {t.TestCase} tc
 */
export const testObject = tc => {
  t.assert(object.create().constructor === undefined, 'object.create creates an empty object without constructor')
  t.describe('object.equalFlat')
  t.assert(object.equalFlat({}, {}), 'comparing equal objects')
  t.assert(object.equalFlat({ x: 1 }, { x: 1 }), 'comparing equal objects')
  t.assert(object.equalFlat({ x: 'dtrn' }, { x: 'dtrn' }), 'comparing equal objects')
  t.assert(!object.equalFlat({ x: {} }, { x: {} }), 'flatEqual does not dive deep')
  t.assert(object.equalFlat({ x: undefined }, { x: undefined }), 'flatEqual handles undefined')
  t.assert(!object.equalFlat({ x: undefined }, { y: {} }), 'flatEqual handles undefined')
  t.describe('object.every')
  t.assert(object.every({ a: 1, b: 3 }, (v, k) => (v % 2) === 1 && k !== 'c'))
  t.assert(!object.every({ a: 1, b: 3, c: 5 }, (v, k) => (v % 2) === 1 && k !== 'c'))
  t.describe('object.some')
  t.assert(object.some({ a: 1, b: 3 }, (v, k) => v === 3 && k === 'b'))
  t.assert(!object.some({ a: 1, b: 5 }, (v, k) => v === 3))
  t.assert(object.some({ a: 1, b: 5 }, () => true))
  t.assert(!object.some({ a: 1, b: 5 }, (v, k) => false))
  t.describe('object.forEach')
  let forEachSum = 0
  object.forEach({ x: 1, y: 3 }, (v, k) => { forEachSum += v })
  t.assert(forEachSum === 4)
  t.describe('object.map')
  t.assert(object.map({ x: 1, z: 5 }, (v, k) => v).reduce(math.add) === 6)
  t.describe('object.length')
  t.assert(object.length({}) === 0)
  t.assert(object.length({ x: 1 }) === 1)
}
