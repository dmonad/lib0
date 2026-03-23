import * as t from './testing.js'
import * as s from './schema.js'
import * as env from './environment.js'
import * as prng from './prng.js'
import * as array from './array.js'
import * as promise from 'lib0/promise'

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
  t.group('partial', () => {
    const myobject = s.$partial({
      num: s.$number,
      steak: s.$string
    })
    t.assert(myobject.check({}))
    t.assert(myobject.check({ num: 42 }))
    t.assert(myobject.check({ num: 42, steak: 'good' }))
    t.assert(!myobject.check({ num: 42, steak: 42 }))
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
    t.assert(s.$instanceOf(Base, o => /** @type {any} */ (o).y != null).validate(new BetterBase()))
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
  t.group('promise', () => {
    const x = promise.resolve()
    const y = promise.reject()
    t.assert(s.$promise.check(x) && s.$promise.check(y))
    t.assert(s.$$promise.check(s.$promise))
  })
  t.group('never', () => {
    const x = 42
    x.toString()
    if (s.$never.check(x)) {
      // @ts-expect-error method doesn't exist on never
      x.toString()
    }
  })
  t.group('custom', () => {
    /**
     * @type {s.Schema<Number>}
     */
    const $c = s.$custom(a => typeof a === 'number')
    t.assert($c.check(42))
    t.assert(!$c.check('42'))
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
  const t1 = s.$union(s.$number, s.$string)
  const t2 = s.$union(s.$number, s.$string, s.$null)
  t.assert(s.extendsShape(t1, t2))
  t.assert(!s.extendsShape(t2, t1))
  t.assert(s.extendsShape(s.$object({ a: s.$number, b: s.$number }), s.$object({ a: s.$number })))
  t.assert(!s.extendsShape(s.$object({ a: s.$number }), s.$object({ a: s.$number, b: s.$number })))
  t.assert(!s.extendsShape(s.$constructedBy(Number), s.$constructedBy(Object)))
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

/**
 * expect
 * @param {t.TestCase} _tc
 */
export const testUnionMerging = _tc => {
  // should be merged into a single $union construct
  const $numOrStr = s.$union(s.$union(s.$union(s.$number)), s.$string)
  if (s.$$union.check($numOrStr)) {
    t.assert($numOrStr.shape.length === 2)
    t.assert(s.extendsShape($numOrStr.shape[0], s.$number))
    t.assert(s.extendsShape($numOrStr.shape[1], s.$string))
    t.assert(s.extendsShape($numOrStr, s.$union(s.$number, s.$string)))
    t.assert(s.extendsShape($numOrStr, s.$union(s.$number, s.$union(s.$string, s.$number))))
  } else {
    t.fail('should be a union')
  }
}

export const testConvenienceHelper = () => {
  class Base { x () {} }
  /**
   * @type {s.Schema<{ x: 42|string|null, y: true, z: Base, a: { b: number|string } }>}
   */
  const $o = s.$({ x: [/** @type {42} */(42), s.$string, null], y: /** @type {true} */ (true), z: Base, a: { b: [s.$union(s.$number, s.$string)] } })
  /**
   * @type {s.Schema<{ x: 42|string|null, y: true, z: Base, a: { b: number|string } }>}
   */
  const $oCpy = s.$object({ x: s.$union(s.$literal(42), s.$string).nullable, y: s.$literal(true), z: s.$constructedBy(Base), a: s.$object({ b: s.$union(s.$number, s.$string) }) })
  t.assert(s.extendsShape($o, $oCpy))
  /**
   * @type {s.Schema<{ x?: number }>}
   */
  const $o2 = s.$({ x: s.$number.optional })
  /**
   * @type {s.Schema<{ x?: number }>}
   */
  const $o2Cpy = s.$object({ x: s.$number.optional })
  t.assert(s.extendsShape($o2, $o2Cpy))
  t.assert($o2.check({}))
}

export const testPatternMatcherBase = () => {
  const numberConverterP = s.match().if(s.$number, o => '' + o).if(s.$string, o => Number.parseInt(o))
  const numberConverter = numberConverterP.done()
  const n = numberConverter('str')
  s.$number.expect(n)
  t.fails(() => {
    // @ts-expect-error
    s.$string.expect(n)
  })
  const str = numberConverter(42)
  s.$string.expect(str)
  t.fails(() => {
    // @ts-expect-error
    s.$number.expect(str)
  })
  t.fails(() => {
    // @ts-expect-error
    numberConverter({})
  })
}

/**
 * @param {t.TestCase} tc
 */
export const testPatternMatchDifferentInputs = tc => {
  const isSingleDigit = s.match()
    .if(s.$constructedBy(Number, o => o >= 0 && o < 10), () => true)
    .if(s.$constructedBy(Number, o => o >= 10), () => false)
    .if(s.$string, _o => 'no')
    .if(s.$null, () => null)
    .else(() => ({ x: 42 }))
    .done()
  const resNum = isSingleDigit(0)
  s.$boolean.expect(resNum)
  const resString = isSingleDigit('42')
  s.$string.expect(resString)
  t.assert(isSingleDigit(0))
  t.assert(!isSingleDigit(42))
  t.assert(isSingleDigit('42') === 'no')
  t.assert(isSingleDigit(null) === null)
  const unknownInput = isSingleDigit(undefined)
  s.$({ x: 42 }).expect(unknownInput)
  t.group('validate that result is filtered by input by assigning new values', () => {
    let q = s.random(tc.prng, s.$union(s.$string, s.$number))
    q = 42
    let q2 = s.random(tc.prng, s.$union(s.$string, s.$number))
    q2 = 'dtrn'
    // null is not input, so the result can't be null
    let q3 = s.random(tc.prng, s.$union(s.$string, s.$number))
    // @ts-expect-error
    q3 = null
    console.log(q, q2, q3)
  })
}

export const testPatternMatcherWithState = () => {
  const numberConverterP = s.match({ cnt: s.$number })
    .if(s.$number, (o, s) => { s.cnt++; return '' + o })
    .if(s.$string, (o, s) => { s.cnt++; return Number.parseInt(o) })
  const numberConverter = numberConverterP.done()
  const state = { cnt: 0 }
  const n = numberConverter('str', state)
  s.$number.expect(n)
  t.fails(() => {
    // @ts-expect-error
    s.$string.expect(n)
  })
  const str = numberConverter(42, state)
  s.$string.expect(str)
  t.fails(() => {
    // @ts-expect-error
    s.$number.expect(str)
  })
  t.assert(state.cnt === 2)
  t.fails(() => {
    // @ts-expect-error
    numberConverter({}, state)
  })
}

export const testPatternMatcherBenchmark = () => {
  const gen = prng.create(42)
  const N = 10000
  /**
   * @type {Array<any>}
   */
  const data = []
  for (let i = 0; i < N; i++) {
    data.push(prng.oneOf(gen, [
      () => prng.int53(gen, 0, 1000),
      () => prng.word(gen),
      () => prng.bool(gen),
      () => prng.oneOf(gen, [{ x: false }, { y: true }])
    ])())
  }

  t.measureTime('switch-case - count occurences (constructor checks)', () => {
    let numbers = 0
    let strings = 0
    let objects = 0
    let bools = 0
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      if (d.constructor === Number) {
        numbers++
      } else if (d.constructor === String) {
        strings++
      } else if (d.constructor === Boolean) {
        bools++
      } else if (d instanceof Object) {
        objects++
      } else {
        throw new Error('unhandled case')
      }
    }
    console.log({ numbers, strings, objects, bools })
  })

  // this is the fastest in Chrome as of december 2025
  t.measureTime('switch-case - count occurences (typeof checks)', () => {
    let numbers = 0
    let strings = 0
    let objects = 0
    let bools = 0
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      if (typeof d === 'number') {
        numbers++
      } else if (typeof d === 'string') {
        strings++
      } else if (typeof d === 'boolean') {
        bools++
      } else if (typeof d === 'object') {
        objects++
      } else {
        throw new Error('unhandled case')
      }
    }
    console.log({ numbers, strings, objects, bools })
  })

  t.measureTime('switch-case - count occurences (typeof checks - optimized)', () => {
    let numbers = 0
    let strings = 0
    let objects = 0
    let bools = 0
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      switch (typeof d) {
        case 'number':
          numbers++
          break
        case 'string':
          strings++
          break
        case 'boolean':
          bools++
          break
        case 'object':
          objects++
          break
        default:
          throw new Error('unhandled case')
      }
    }
    console.log({ numbers, strings, objects, bools })
  })

  t.measureTime('pattern-matcher - count occurences (reduce - bad)', () => {
    const state = {
      numbers: 0,
      strings: 0,
      objects: 0,
      bools: 0
    }
    const countTypes = s.match({ numbers: s.$number, strings: s.$number, objects: s.$number, bools: s.$number })
      .if(s.$number, (_o, state) => { state.numbers++ })
      .if(s.$string, (_o, state) => { state.strings++ })
      .if(s.$boolean, (_o, state) => { state.bools++ })
      .if(s.$objectAny, (_o, state) => { state.objects++ })
      .done()
    console.log(data.reduce((s, d) => {
      countTypes(d, s)
      return s
    }, state))
  })

  t.measureTime('pattern-matcher - count occurences (for loop)', () => {
    const state = {
      numbers: 0,
      strings: 0,
      objects: 0,
      bools: 0
    }
    const countTypes = s.match({ numbers: s.$number, strings: s.$number, objects: s.$number, bools: s.$number })
      .if(s.$number, (_o, state) => { state.numbers++ })
      .if(s.$string, (_o, state) => { state.strings++ })
      .if(s.$boolean, (_o, state) => { state.bools++ })
      .if(s.$objectAny, (_o, state) => { state.objects++ })
      .done()
    for (let i = 0; i < data.length; i++) {
      countTypes(data[i], state)
    }
    console.log(state)
  })

  t.measureTime('pattern-matcher - count occurences (forEach)', () => {
    const state = {
      numbers: 0,
      strings: 0,
      objects: 0,
      bools: 0
    }
    const countTypes = s.match({ numbers: s.$number, strings: s.$number, objects: s.$number, bools: s.$number })
      .if(s.$number, (_o, state) => { state.numbers++ })
      .if(s.$string, (_o, state) => { state.strings++ })
      .if(s.$boolean, (_o, state) => { state.bools++ })
      .if(s.$objectAny, (_o, state) => { state.objects++ })
      .done()
    data.forEach(d => countTypes(d, state))
    console.log(state)
  })
}

export const testCrossModuleCompatibility = async () => {
  // @ts-ignore
  const s1 = await import('./schema.js?v=1')
  // @ts-ignore
  const s2 = await import('./schema.js?v=2')
  t.assert(s1.$number != null && s1.$$number != null)
  t.assert(s2.$number != null && s2.$$number != null)
  s1.$number.expect(42)
  t.assert(s1.$number !== s2.$number) // imports are different instances
  t.assert(s1.$$number.check(s2.$number)) // s1 can check identities of s2
  t.assert(s2.$$number.check(s1.$number))
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomFromSchema = tc => {
  /**
   * @param {string} caseName
   * @param {s.Schema<any>} $s
   */
  const testCase = (caseName, $s) => {
    t.group(caseName, () => {
      for (let i = 0; i < 10; i++) {
        const res = s.random(tc.prng, $s)
        $s.expect(res)
        // console.info(caseName, res)
      }
    })
  }
  testCase('object', s.$object({ number: s.$number, maybeStr: s.$string.optional }))
  testCase('any', s.$any)
  testCase('number', s.$number)
  testCase('array', s.$array(s.$any))
  t.group('custom', () => {
    const $res = s.$object({ a: s.$number.optional, str: s.$string })
    for (let i = 0; i < 30; i++) {
      const res = s.random(tc.prng, $res)
      $res.expect(res)
      console.log(res)
    }
  })
}

export const testBenchmarkTypeCheckUsingProps = () => {
  class A {
    /**
     * @param {number} a
     */
    constructor (a) {
      this.a = a
    }

    get $symbol () { return $asymbol }
  }
  const $a = A.prototype.$type = s.$type(':a', A)
  class B {
    /**
     * @param {string} b
     */
    constructor (b) {
      this.b = b
      this.a = 42
    }

    get $symbol () { return $bsymbol }
  }
  const $b = B.prototype.$type = s.$type(':b', B)
  class C {
    constructor () {
      this.a = 'x'
      this.c = {}
    }

    get $symbol () { return $csymbol }
  }
  const $c = C.prototype.$type = s.$type(':c', C)
  const $asymbol = s.$$type.cast($a).typeSymbol
  const $bsymbol = s.$$type.cast($b).typeSymbol
  const $csymbol = s.$$type.cast($c).typeSymbol
  t.assert(s.$$type.check($a))
  const gen = prng.create(42)
  const N = 20000
  const Iterations = 10
  const expectedResult = {
    as: 0,
    bs: 0,
    cs: 0
  }
  /**
   * @type {Array<A|B|C>}
   */
  const os = array.unfold(N, () =>
    prng.oneOf(gen, [
      () => {
        expectedResult.as++
        return new A(prng.int32(gen, 0, 10000))
      },
      () => {
        expectedResult.bs++
        return new B(prng.word(gen))
      },
      () => {
        expectedResult.cs++
        return new C()
      }
    ])()
  )
  t.info(`performing ${N} type checks with ${Iterations} iterations`)
  t.group('constructor checks (switch/case))', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} constructor checks (switch/case))`, () => {
        let as = 0
        let bs = 0
        let cs = 0
        for (let i = 0; i < os.length; i++) {
          const o = os[i]
          switch (o.constructor) {
            case A: {
              as++
              break
            }
            case B: {
              bs++
              break
            }
            case C: {
              cs++
              break
            }
          }
        }
        t.compare(expectedResult, { as, bs, cs })
      })
    }
  })
  t.group('constructor checks (if/then))', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} constructor checks (switch/case))`, () => {
        let as = 0
        let bs = 0
        let cs = 0
        for (let i = 0; i < os.length; i++) {
          const o = os[i]
          if (o.constructor === A) {
            as++
          } else if (o.constructor === B) {
            bs++
          } else if (o.constructor === C) {
            cs++
          }
        }
        t.compare(expectedResult, { as, bs, cs })
      })
    }
  })
  t.group('instanceof checks (if/then)', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} instanceof checks (if/then)`, () => {
        let as = 0
        let bs = 0
        let cs = 0
        for (let i = 0; i < os.length; i++) {
          const o = os[i]
          if (o instanceof A) {
            as++
          } else if (o instanceof B) {
            bs++
          } else if (o instanceof C) {
            cs++
          }
        }
        t.compare(expectedResult, { as, bs, cs })
      })
    }
  })
  t.group('type equal checks (switch/case)', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} type equal checks (switch/case)`, () => {
        let as = 0
        let bs = 0
        let cs = 0
        for (let i = 0; i < os.length; i++) {
          const o = os[i]
          switch (o.$type) {
            case $a: {
              as++
              break
            }
            case $b: {
              bs++
              break
            }
            case $c: {
              cs++
              break
            }
          }
        }
        t.compare(expectedResult, { as, bs, cs })
      })
    }
  })
  t.group('type equal checks + type assertions (switch/case)', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      // Switch case doesn't narrow down the checked type. Try fake checking them.
      t.measureTime(`I=${iteration} type equal checks + type assertions (switch/case)`, () => {
        let as = 0
        let bs = 0
        let cs = 0
        for (let i = 0; i < os.length; i++) {
          const o = os[i]
          switch (o.$type) {
            case $a: {
              s.assertNoCheck(o, $a)
              as++
              break
            }
            case $b: {
              s.assertNoCheck(o, $b)
              bs++
              break
            }
            case $c: {
              s.assertNoCheck(o, $c)
              cs++
              break
            }
          }
        }
        t.compare(expectedResult, { as, bs, cs })
      })
    }
  })
  t.group('type equal checks (if/then)', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} type equal checks (if/then)`, () => {
        let as = 0
        let bs = 0
        let cs = 0
        for (let i = 0; i < os.length; i++) {
          const o = os[i]
          if (o.$type === $a) {
            as++
          } else if (o.$type === $b) {
            bs++
          } else if (o.$type === $c) {
            cs++
          }
        }
        t.compare(expectedResult, { as, bs, cs })
      })
    }
  })

  t.group('schema checks (if/then))', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} schema checks (if/then))`, () => {
        let as = 0
        let bs = 0
        let cs = 0
        for (let i = 0; i < os.length; i++) {
          const o = os[i]
          if ($a.check(o)) {
            as++
          } else if ($b.check(o)) {
            bs++
          } else if ($c.check(o)) {
            cs++
          }
        }
        t.compare(expectedResult, { as, bs, cs })
      })
    }
  })
  t.group('schema checks (pattern match + for loop)', () => {
    const f = s.match({ as: s.$number, bs: s.$number, cs: s.$number })
      .if($a, (_o, state) => { state.as++ })
      .if($b, (_o, state) => { state.bs++ })
      .if($c, (_o, state) => { state.cs++ })
      .done()
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} schema checks (pattern match)`, () => {
        const state = {
          as: 0,
          bs: 0,
          cs: 0
        }
        for (let i = 0; i < os.length; i++) {
          f(os[i], state)
        }
        t.compare(expectedResult, state)
      })
    }
  })
  t.group('schema checks (pattern match + foreach)', () => {
    const f = s.match({ as: s.$number, bs: s.$number, cs: s.$number })
      .if($a, (_o, state) => { state.as++ })
      .if($b, (_o, state) => { state.bs++ })
      .if($c, (_o, state) => { state.cs++ })
      .done()
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} schema checks (pattern match)`, () => {
        const state = {
          as: 0,
          bs: 0,
          cs: 0
        }
        os.forEach(o => f(o, state))
        t.compare(expectedResult, state)
      })
    }
  })
  t.group('schema checks (pattern match + foreach + inlined)', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} schema checks (pattern match)`, () => {
        const state = {
          as: 0,
          bs: 0,
          cs: 0
        }
        os.forEach(o =>
          // inlining pattern-matching causes a ~5x overhead
          s.match({ as: s.$number, bs: s.$number, cs: s.$number })
            .if($a, (_o, state) => { state.as++ })
            .if($b, (_o, state) => { state.bs++ })
            .if($c, (_o, state) => { state.cs++ })
            .done()(o, state)
        )
        t.compare(expectedResult, state)
      })
    }
  })
  t.group('symbol equal checks (if/then))', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} symbol equal checks (if/then))`, () => {
        let as = 0
        let bs = 0
        let cs = 0
        for (let i = 0; i < os.length; i++) {
          const o = os[i]
          if (o.$symbol === $asymbol) {
            as++
          } else if (o.$symbol === $bsymbol) {
            bs++
          } else if (o.$symbol === $csymbol) {
            cs++
          }
        }
        t.compare(expectedResult, { as, bs, cs })
      })
    }
  })
  t.group('symbol equal checks (switch/case)', () => {
    for (let iteration = 0; iteration < Iterations; iteration++) {
      t.measureTime(`I=${iteration} symbol equal checks (switch/case)`, () => {
        let as = 0
        let bs = 0
        let cs = 0
        for (let i = 0; i < os.length; i++) {
          const o = os[i]
          switch (o.$symbol) {
            case $asymbol: {
              as++
              break
            }
            case $bsymbol: {
              bs++
              break
            }
            case $csymbol: {
              cs++
              break
            }
          }
        }
        t.compare(expectedResult, { as, bs, cs })
      })
    }
  })
}
