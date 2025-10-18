import * as t from './testing.js'
import * as s from './schema.js'
import * as env from './environment.js'

/**
 * @param {t.TestCase} _tc
 */
export const testSchemas = _tc => {
  t.group('number', () => {
    t.assert(s.$number.validate(42))
    // @ts-expect-error
    t.assert(!s.$number.validate(BigInt(42)))
    // @ts-expect-error
    t.assert(!s.$number.validate(undefined))
    // @ts-expect-error
    t.assert(!s.$number.validate(new Date()))
  })
  t.group('bigint', () => {
    t.assert(s.$bigint.validate(BigInt(42)))
    // @ts-expect-error
    t.assert(!s.$bigint.validate([BigInt(42)]))
    // @ts-expect-error
    t.assert(!s.$bigint.validate(undefined))
    // @ts-expect-error
    t.assert(!s.$bigint.validate(new Date()))
  })
  t.group('symbol', () => {
    t.assert(s.$symbol.validate(Symbol('random symbol')))
    // @ts-expect-error
    t.assert(!s.$symbol.validate({}))
    // @ts-expect-error
    t.assert(!s.$symbol.validate(undefined))
    // @ts-expect-error
    t.assert(!s.$symbol.validate(new Date()))
  })
  t.group('literal', () => {
    const myliterals = s.$literal('hi', 4)
    myliterals.validate('hi')
    // @ts-expect-error
    t.assert(!myliterals.validate(undefined))
    // @ts-expect-error
    t.assert(!myliterals.validate(new Date()))
  })
  t.group('object', () => {
    const myobject = s.$object({
      num: s.$number
    })
    const q = /** @type {number} */ (/** @type {any} */ ({ num: 42, x: 9 }))
    if (myobject.check(q)) {
      s.$number.validate(q)
      myobject.validate(q)
    } else {
      // q is a number now
      s.$number.validate(q)
    }
    t.assert(!myobject.check(42))
    t.assert(myobject.check({ num: 42, x: 9 }))
    // @ts-expect-error
    t.assert(!myobject.validate(undefined))
    // @ts-expect-error
    t.assert(!myobject.validate(new Date()))
  })
  t.group('record', () => {
    const myrecord = s.$record(s.$number, s.$string)
    // @ts-expect-error
    t.assert(!myrecord.validate({ a: 'a' }))
    const myrecord2 = s.$record(s.$string, s.$number)
    const o = { a: 42 }
    t.assert(myrecord2.validate(o))
  })
  t.group('tuple', () => {
    const mytuple = s.$tuple(s.$number, s.$string)
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
    const z = s.$instanceOf(Base)
    t.assert(z.validate(new Base()))
    t.assert(z.validate(new BetterBase()))
    // @ts-expect-error
    t.assert(!z.validate(4))
    t.assert(!s.$instanceOf(BetterBetterBase).validate(new BetterBase()))
    // @ts-expect-error
    t.assert(!z.validate(undefined))
    // @ts-expect-error
    t.assert(!z.validate(new Date()))
  })
  t.group('string', () => {
    class BetterString extends String { }
    // @ts-expect-error
    t.assert(!s.$string.validate(new BetterString()))
    t.assert(s.$string.validate('hi'))
    // @ts-expect-error
    t.assert(!s.$string.validate(undefined))
    // @ts-expect-error
    t.assert(!s.$string.validate(new Date()))
  })
  t.group('array', () => {
    const myarray = s.$array(s.$number, s.$string)
    t.assert(myarray.validate([4, '5']))
    t.assert(myarray.validate(['4', 5]))
    // @ts-expect-error
    t.assert(!myarray.validate(['x', new Date()]))
    // @ts-expect-error
    t.assert(!myarray.validate(undefined))
    // @ts-expect-error
    t.assert(!myarray.validate(new Date()))
    {
      const mysimplearray = s.$array(s.$object({}))
      // @ts-expect-error
      if (env.production) t.fails(() => t.assert(mysimplearray.expect({ x: 4 })))
      mysimplearray.cast([{}])
    }
  })
  t.group('union', () => {
    const myunion = s.$union(s.$number, s.$string)
    t.assert(myunion.validate(42))
    t.assert(myunion.validate('str'))
    // @ts-expect-error
    t.assert(!myunion.validate(['str']))
    // @ts-expect-error
    t.assert(!myunion.validate(undefined))
    // @ts-expect-error
    t.assert(!myunion.validate(new Date()))
    // @ts-expect-error
    t.assert(!s.$union().validate(42))
    t.assert(s.$union(s.$number).validate(42))
    // @ts-expect-error
    t.assert(!s.$union(s.$number).validate('forty'))
    t.assert(/** @type {s.$Union<any>} */ (s.$union(s.$union(s.$number), s.$string)).shape.length === 2)
  })
  t.group('intersection', () => {
    const myintersectionNever = s.$intersect(s.$number, s.$string)
    // @ts-expect-error
    t.assert(!myintersectionNever.validate(42))
    // @ts-expect-error
    t.assert(!myintersectionNever.validate('str'))
    const myintersection = s.$intersect(s.$object({ a: s.$number }), s.$object({ b: s.$number }))
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
    s.$number.validate(x)
    s.assert(x, s.$number)
    s.$number.validate(x)
  })
  t.group('fails on assert/cast/ensure', () => {
    if (env.production) return t.info('[running in env.production] skipping fail tests because they are skipped in production')
    t.fails(() => {
      s.$number.cast('42')
    })
    t.fails(() => {
      // @ts-expect-error
      s.$number.expect('42')
    })
    t.fails(() => {
      s.assert('42', s.$number)
    })
  })
  t.group('Schema', () => {
    const nullVal = /** @type {unknown} */ (null)
    const numVal = /** @type {unknown} */ (42)
    const schema = s.$number.nullable
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
    const known = s.$number.cast(unknown)
    s.$number.validate(known)
    // @ts-expect-error
    s.$number.validate(unknown)
    const f = s.$lambda(s.$number, s.$void).expect((_x) => {})
    // should match a function with more parameters
    t.assert(s.$lambda(s.$number, s.$string, s.$void).validate(f))
    // should still not match a different function
    // @ts-expect-error
    s.$lambda(s.$string, s.$void).validate(f)
    const x = s.$object({ f: s.$lambda(s.$string, s.$void), n: s.$number }).expect({ f: () => {}, n: 99 })
    t.assert(x.n === 99)
    s.$lambda().cast(() => {})
  })
  t.group('lambda', () => {
    const $fun = s.$lambda(s.$number, s.$string, s.$string)
    t.assert($fun.validate(() => ''))
    t.assert($fun.validate(/** @param {number} _n */ (_n) => ''))
    // @ts-expect-error
    $fun.validate(/** @param {number} n */ (n) => n) // expected string result
    const $fun2 = s.$lambda(s.$number, s.$string, s.$void)
    t.assert($fun2.validate(() => ''))
    t.assert($fun2.validate(/** @param {number} n */ (n) => n + ''))
    t.assert($fun2.validate(/** @param {number} n */ (n) => n)) // this works now, because void is the absense of value
    const $fun3 = s.$lambda(s.$number, s.$undefined)
    // @ts-expect-error
    $fun3.validate(/** @param {number} n */ (n) => n) // this doesn't work, because expected the literal undefined.
    // @ts-expect-error
    t.assert(!$fun3.validate(/** @type {(a: number, b: number) => undefined} */ (_a, _b) => undefined)) // too many parameters
  })
  t.group('never', () => {
    const x = 42
    x.toString()
    if (s.$never.check(x)) {
      // @ts-expect-error method doesn't exist on never
      x.toString()
    }
  })
}

export const testSchemaExpect = () => {
  // Array<never> is an edge case
  const q = s.$array(s.$string)
  const m = q.cast([]) // should be of type string[]
  // @ts-expect-error
  s.$array(s.$never).expect(m)
}

/**
 * @param {t.TestCase} _tc
 */
export const testObjectSchemaOptionals = _tc => {
  const schema = s.$object({ a: s.$number.optional, b: s.$string.optional })
  t.assert(schema.validate({ })) // should work
  // @ts-expect-error
  t.assert(!schema.validate({ a: 'str' })) // should throw a type error
  const def = s.$union(s.$string, s.$array(s.$number))
  const defOptional = def.optional
  const defObject = s.$object({ j: defOptional, k: def })
  // @ts-expect-error
  t.assert(!defObject.validate({ k: undefined }))
  t.assert(defObject.validate({ k: [42] }))
  // @ts-expect-error
  t.assert(!defObject.validate({ k: [42], j: 42 }))
  t.assert(defObject.validate({ k: [42], j: 'str' }))
  t.assert(defObject.validate({ k: [42], j: undefined }))
}

/**
 * @param {t.TestCase} _tc
 */
export const testMetaSchemas = _tc => {
  /**
   * @type {s.Schema<any>}
   */
  const sch = s.$object({ n: s.$array(s.$number) })
  t.fails(() => {
    s.assert(sch, s.$$number)
    sch.validate(42) // should work, if this wouldn't throw..
  })
  s.assert(sch, s.$$object)
  const schN = sch.shape.n
  s.assert(schN, s.$$array)
  t.assert(schN.shape)
  s.$$number.cast(schN.shape)
  t.group('meta check - shape is working', () => {
    const x = s.$object({ x: s.$number })
    // @ts-expect-error shape shouldn't exist on $Shape
    t.assert(x.shape !== undefined)
    if (s.$$object.check(x)) {
      // expect that x is an object that maps to shemas
      t.assert(s.$object({}).validate(x.shape))
      t.assert(s.$$schema.check(x.shape.x))
    }
  })
}

/**
 * @param {t.TestCase} _tc
 */
export const testStringTemplate = _tc => {
  // a test with number
  const $t = s.$stringTemplate('hi', s.$number)
  t.assert($t.validate('hi42'))
  // complex test with rgp (what you would use in css)
  // rgb(number,number,number)
  const $rgb = s.$stringTemplate('rgb(', s.$number, ',', s.$number, ',', s.$number, ')')
  t.assert($rgb.validate('rgb(42,42,3)'))
  // @ts-expect-error
  t.assert(!$rgb.validate('rgb(42,42,)'))
  // test with unions, showing that the resulting type is nicely resolved
  const $hi = s.$union(s.$literal('hello'), s.$literal('hi'))
  const $greeting = s.$stringTemplate($hi, ' ', s.$string, '!')
  t.assert($greeting.validate('hello world!'))
  t.assert($greeting.validate('hi there!'))
  // @ts-expect-error "moin" is not accepted"
  t.assert(!$greeting.validate('moin otto!'))
}

/**
 * @param {t.TestCase} _tc
 */
export const testSchemaExtends = _tc => {
  const t1 = s.$union(s.$number)
  const t2 = s.$union(s.$number, s.$string)

  t.assert(t2.extends(t1))
  t.assert(!t1.extends(t2))
}

/**
 * @param {t.TestCase} _tc
 */
export const testSchemaErrors = _tc => {
  const x = s.$union(s.$object({ a: s.$number, b: s.$string }))
  try {
    s.assert({ a: 42, b: 43 }, x)
  } catch (err) {
    console.log(err + '')
  }
}
