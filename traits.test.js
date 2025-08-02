import * as t from './testing.js'
import * as fun from './function.js'
import * as traits from './traits.js'
import * as s from './schema.js'

/**
 * @param {t.TestCase} _tc
 */
export const testEqualityTrait1 = _tc => {
  /**
   * @implements traits.EqualityTrait
   */
  class X {
    get x () { return 4 }
    /**
     * @param {object} other
     * @return boolean
     */
    [traits.EqualityTraitSymbol] (other) { return this === other }
  }
  /**
   * extension of X
   * @implements traits.EqualityTrait
   */
  class X2 extends X {
    get x2 () { return 4 }
  }
  const x = new X()
  const y = new X()
  t.assert(!x[traits.EqualityTraitSymbol](y))
  t.assert(x[traits.EqualityTraitSymbol](x))
  t.assert(!traits.equals(x, y))
  t.assert(!traits.equals(x, x))
  // left needs to be more specific
  t.assert(!traits.equals(x, { [traits.EqualityTraitSymbol]: (other) => other === y }))
  // if left is not more specific, then it should throw a type error
  // @ts-expect-error other object doesn't match type
  t.assert(!traits.equals({ [traits.EqualityTraitSymbol]: (other) => other === y }, x))
  // right has a property that is missing in left
  // @ts-expect-error
  t.assert(!traits.equals(x, { [traits.EqualityTraitSymbol]: (other) => other === y, get y () { return y } }))
  const x2 = new X2()
  const x2x2 = /** @type {traits.EqualityTrait} */ (x2)
  // @ts-expect-error x2 typings assume that it is not constructed by X2. so this typecheck fails
  s.$constructedBy(X2).validate(x2x2)
  t.assert(x2 === x2x2)
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
