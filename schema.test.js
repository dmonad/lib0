import * as t from './testing.js'
import * as s from './schema.js'
import * as env from './environment.js'

/**
 * @param {t.TestCase} _tc
 */
export const testSchemas = _tc => {
  t.group('number', () => {
    t.assert(s.number.validate(42))
    // @ts-expect-error
    t.assert(!s.number.validate(BigInt(42)))
    // @ts-expect-error
    t.assert(!s.number.validate(undefined))
    // @ts-expect-error
    t.assert(!s.number.validate(new Date()))
  })
  t.group('bigint', () => {
    t.assert(s.bigint.validate(BigInt(42)))
    // @ts-expect-error
    t.assert(!s.bigint.validate([BigInt(42)]))
    // @ts-expect-error
    t.assert(!s.bigint.validate(undefined))
    // @ts-expect-error
    t.assert(!s.bigint.validate(new Date()))
  })
  t.group('symbol', () => {
    t.assert(s.symbol.validate(Symbol('random symbol')))
    // @ts-expect-error
    t.assert(!s.symbol.validate({}))
    // @ts-expect-error
    t.assert(!s.symbol.validate(undefined))
    // @ts-expect-error
    t.assert(!s.symbol.validate(new Date()))
  })
  t.group('literal', () => {
    const myliterals = s.literal('hi', 4)
    myliterals.validate('hi')
    // @ts-expect-error
    t.assert(!myliterals.validate(undefined))
    // @ts-expect-error
    t.assert(!myliterals.validate(new Date()))
  })
  t.group('object', () => {
    const myobject = s.object({
      num: s.number
    })
    const q = /** @type {number} */ (/** @type {any} */ ({ num: 42, x: 9 }))
    if (myobject.check(q)) {
      s.number.validate(q)
      myobject.validate(q)
    } else {
      // q is a number now
      s.number.validate(q)
    }
    t.assert(myobject.check({ num: 42, x: 9 }))
    // @ts-expect-error
    t.assert(!myobject.validate(undefined))
    // @ts-expect-error
    t.assert(!myobject.validate(new Date()))
  })
  t.group('record', () => {
    const myrecord = s.record(s.number, s.string)
    // @ts-expect-error
    t.assert(!myrecord.validate({ a: 'a' }))
    const myrecord2 = s.record(s.string, s.number)
    const o = { a: 42 }
    t.assert(myrecord2.validate(o))
  })
  t.group('tuple', () => {
    const mytuple = s.tuple(s.number, s.string)
    t.assert(mytuple.validate([4, '5']))
    // @ts-expect-error
    t.assert(mytuple.validate([4, '5', 6]))
    // @ts-expect-error
    t.assert(!mytuple.validate(['4', 5]))
    // @ts-expect-error
    t.assert(!mytuple.validate(undefined))
    // @ts-expect-error
    t.assert(!mytuple.validate(new Date()))
  })
  t.group('instance', () => {
    class Base { x () {} }
    class BetterBase extends Base {
      y () {}
    }
    class BetterBetterBase extends BetterBase { }
    const z = s.instance(Base)
    t.assert(z.validate(new Base()))
    t.assert(z.validate(new BetterBase()))
    // @ts-expect-error
    t.assert(!z.validate(4))
    t.assert(!s.instance(BetterBetterBase).validate(new BetterBase()))
    // @ts-expect-error
    t.assert(!z.validate(undefined))
    // @ts-expect-error
    t.assert(!z.validate(new Date()))
  })
  t.group('string', () => {
    class BetterString extends String { }
    // @ts-expect-error
    t.assert(!s.string.validate(new BetterString()))
    t.assert(s.string.validate('hi'))
    // @ts-expect-error
    t.assert(!s.string.validate(undefined))
    // @ts-expect-error
    t.assert(!s.string.validate(new Date()))
  })
  t.group('array', () => {
    const myarray = s.array(s.number, s.string)
    t.assert(myarray.validate([4, '5']))
    t.assert(myarray.validate(['4', 5]))
    // @ts-expect-error
    t.assert(!myarray.validate(['x', new Date()]))
    // @ts-expect-error
    t.assert(!myarray.validate(undefined))
    // @ts-expect-error
    t.assert(!myarray.validate(new Date()))
    {
      const mysimplearray = s.array(s.object({}))
      // @ts-expect-error
      if (env.production) t.fails(() => t.assert(mysimplearray.ensure({ x: 4 })))
      mysimplearray.cast([{}])
    }
  })
  t.group('union', () => {
    const myunion = s.union(s.number, s.string)
    t.assert(myunion.validate(42))
    t.assert(myunion.validate('str'))
    // @ts-expect-error
    t.assert(!myunion.validate(['str']))
    // @ts-expect-error
    t.assert(!myunion.validate(undefined))
    // @ts-expect-error
    t.assert(!myunion.validate(new Date()))
  })
  t.group('intersection', () => {
    const myintersectionNever = s.intersect(s.number, s.string)
    // @ts-expect-error
    t.assert(!myintersectionNever.validate(42))
    // @ts-expect-error
    t.assert(!myintersectionNever.validate('str'))
    const myintersection = s.intersect(s.object({ a: s.number }), s.object({ b: s.number }))
    t.assert(myintersection.validate({ a: 42, b: 42 }))
    // @ts-expect-error
    t.assert(!myintersection.validate({ a: 42 }))
    // @ts-expect-error
    t.assert(!myintersection.validate({ b: 42 }))
    // @ts-expect-error
    t.assert(!myintersection.validate({ c: 42 }))
    t.assert(myintersection.check({ a: 42, b: 42, c: 42 }))
    // @ts-expect-error
    t.assert(!myintersectionNever.validate(['str']))
    // @ts-expect-error
    t.assert(!myintersectionNever.validate(undefined))
    // @ts-expect-error
    t.assert(!myintersectionNever.validate(new Date()))
  })
  t.group('assert', () => {
    const x = /** @type {unknown} */ (42)
    // @ts-expect-error
    s.number.validate(x)
    s.assert(x, s.number)
    s.number.validate(x)
  })
  t.group('fails on assert/cast/ensure', () => {
    if (env.production) return t.info('[running in env.production] skipping fail tests because they are skipped in production')
    t.fails(() => {
      s.number.cast('42')
    })
    t.fails(() => {
      // @ts-expect-error
      s.number.ensure('42')
    })
    t.fails(() => {
      s.assert('42', s.number)
    })
  })
  t.group('$Schema', () => {
    const nullVal = /** @type {unknown} */ (null)
    const numVal = /** @type {unknown} */ (42)
    const schema = s.number.nullable
    // @ts-expect-error
    schema.validate(nullVal)
    // @ts-expect-error
    schema.validate(nullVal) // check twice to confirm that validate does not asserts
    // @ts-expect-error
    schema.validate(numVal)
    s.assert(nullVal, schema)
    s.assert(numVal, schema)
    schema.validate(nullVal)
    schema.validate(numVal)
    s.assert(undefined, schema.optional)
  })
  t.group('schema.cast / schema.ensure', () => {
    const unknown = /** @type {unknown} */ (42)
    const known = s.number.cast(unknown)
    s.number.validate(known)
    // @ts-expect-error
    s.number.validate(unknown)
    const f = s.lambda(s.number, s.void).ensure((_x) => {})
    // should match a function with more parameters
    t.assert(s.lambda(s.number, s.string, s.void).validate(f))
    // should still not match a different function
    // @ts-expect-error
    s.lambda(s.string, s.void).validate(f)
    const x = s.object({ f: s.lambda(s.string, s.void), n: s.number }).ensure({ f: () => {}, n: 99 })
    t.assert(x.n === 99)
    s.lambda().cast(() => {})
  })
  t.group('lambda', () => {
    const $fun = s.lambda(s.number, s.string, s.string)
    t.assert($fun.validate(() => ''))
    t.assert($fun.validate(/** @param {number} n */ (n) => ''))
    // @ts-expect-error
    $fun.validate(/** @param {number} n */ (n) => n) // expected string result
    const $fun2 = s.lambda(s.number, s.string, s.void)
    t.assert($fun2.validate(() => ''))
    t.assert($fun2.validate(/** @param {number} n */ (n) => n + ''))
    t.assert($fun2.validate(/** @param {number} n */ (n) => n)) // this works now, because void is the absense of value
    const $fun3 = s.lambda(s.number, s.undefined)
    // @ts-expect-error
    $fun3.validate(/** @param {number} n */ (n) => n) // this doesn't work, because expected the literal undefined.
    // @ts-expect-error
    t.assert(!$fun3.validate(/** @type {(a: number, b: number) => undefined} */ (a, b) => undefined)) // too many parameters
  })
}
