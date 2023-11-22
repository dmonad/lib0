import * as map from './map.js'
import * as math from './math.js'
import * as t from './testing.js'

/**
 * @param {t.TestCase} _tc
 */
export const testMap = _tc => {
  /**
   * @type {Map<number, number>}
   */
  const m = map.create()
  m.set(1, 2)
  m.set(2, 3)
  t.assert(map.map(m, (value, key) => value * 2 + key).reduce(math.add) === 13)
  let numberOfWrites = 0
  const createT = () => ++numberOfWrites
  map.setIfUndefined(m, 3, createT)
  map.setIfUndefined(m, 3, createT)
  map.setIfUndefined(m, 3, createT)
  t.compare(map.copy(m), m)
  t.assert(numberOfWrites === 1)
  t.assert(map.any(m, (v, k) => k === 1 && v === 2))
  t.assert(map.any(m, (v, k) => k === 2 && v === 3))
  t.assert(!map.any(m, () => false))
  t.assert(!map.all(m, (v, k) => k === 1 && v === 2))
  t.assert(map.all(m, (v) => v === 2 || v === 3 || v === numberOfWrites))
}

/**
 * @param {t.TestCase} _tc
 */
export const testTypeDefinitions = _tc => {
  // setIfUndefined supports inheritance properly: See https://github.com/dmonad/lib0/issues/82
  class A {
    constructor () {
      this.a = 4
    }
  }
  class B extends A {
    constructor () {
      super()
      this.b = 4
    }
  }
  /**
   * @type {Map<number, A>}
   */
  const m = map.create()
  /**
   * @type {B}
   */
  const b = map.setIfUndefined(m, 0, () => new B())
  console.log(b)
}
