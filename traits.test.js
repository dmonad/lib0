import * as t from './testing.js'
import * as fun from './function.js'
import * as traits from './traits.js'

/**
 * @param {t.TestCase} _tc
 */
export const testEqualityTrait1 = _tc => {
  /**
   * @implements traits.EqualityTrait
   */
  class X {
    /**
     * @param {object} other
     * @return boolean
     */
    [traits.EqualityTraitSymbol] (other) { return this === other }
  }
  const x = new X()
  const y = new X()
  t.assert(!x[traits.EqualityTraitSymbol](y))
  t.assert(x[traits.EqualityTraitSymbol](x))
}

/**
 * @param {t.TestCase} _tc
 */
export const testEqualityTrait2 = _tc => {
  /**
   * @implements traits.EqualityTrait
   */
  class X {
    /**
     * @param {any} other
     * @return boolean
     */
    [traits.EqualityTraitSymbol] (other) { return this.constructor === other.constructor }
  }
  class Y {}
  const x = new X()
  const x2 = new X()
  const y = new Y()
  t.assert(!x[traits.EqualityTraitSymbol](y))
  t.assert(x[traits.EqualityTraitSymbol](x))
  t.assert(x[traits.EqualityTraitSymbol](x2))
  t.compare(x, x2)
  t.fails(() => {
    t.compare(x, y)
  })
  t.assert(fun.equalityDeep(x, x))
  t.assert(fun.equalityDeep(x, x2))
  t.assert(!fun.equalityDeep(x, y))
}

