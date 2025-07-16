/**
 * @experimental WIP
 *
 * Simple & efficient schemas for your data.
 */

import * as obj from './object.js'
import * as arr from './array.js'
import * as error from './error.js'
import * as env from './environment.js'

/**
 * @typedef {string|number|bigint|boolean|null|undefined} LiteralType
 */

/**
 * @typedef {{ [k:string|number|symbol]: any }} AnyObject
 */

/**
 * @template T
 * @typedef {T extends $Schema<infer X> ? X : T} Unwrap
 */

/**
 * @template {readonly unknown[]} T
 * @typedef {T extends readonly [$Schema<infer First>, ...infer Rest] ? [First, ...UnwrapArray<Rest>] : [] } UnwrapArray
 */

/**
 * @template T
 * @typedef {T extends $Schema<infer S> ? $Schema<S> : never} CastToSchema
 */

/**
 * @template {unknown[]} Arr
 * @typedef {Arr extends [...unknown[], infer L] ? L : never} TupleLast
 */

/**
 * @template {unknown[]} Arr
 * @typedef {Arr extends [...infer Fs, unknown] ? Fs : never} TuplePop
 */

/**
 * @template {readonly unknown[]} T
 * @typedef {T extends []
 *   ? {}
 *   : T extends [infer First]
 *   ? First
 *   : T extends [infer First, ...infer Rest]
 *   ? First & Intersect<Rest>
 *   : never
 * } Intersect
 */

const schemaSymbol = Symbol('0schema')

/**
 * @template T
 */
export class $Schema {
  get [schemaSymbol] () { return true }
  /**
   * Use `schema.validate(obj)` with a typed parameter that is already of typed to be an instance of
   * Schema. Validate will check the structure of the parameter and return true iff the instance
   * really is an instance of Schema.
   *
   * @param {T} o
   * @return {boolean}
   */
  validate (o) {
    return this.check(o)
  }

  /* c8 ignore start */
  /**
   * Similar to validate, but this method accepts untyped parameters.
   *
   * @param {any} _o
   * @return {_o is T}
   */
  check (_o) {
    error.methodUnimplemented()
  }
  /* c8 ignore stop */

  /**
   * @type {$Schema<T?>}
   */
  get nullable () {
    return union(this, $null)
  }

  /**
   * @type {$Optional<$Schema<T>>}
   */
  get optional () {
    return new $Optional(/** @type {$Schema<T>} */ (this))
  }

  /**
   * Cast a variable to a specific type. Returns the casted value, or throws an exception otherwise.
   * Use this if you know that the type is of a specific type and you just want to convince the type
   * system.
   *
   * **Do not rely on these error messages!**
   * Performs an assertion check only if not in a production environment.
   *
   * @param {any} o
   * @return {o extends T ? T : never}
   */
  cast (o) {
    assert(o, this)
    return o
  }

  /**
   * Ensures that a variable is a a specific type. Returns the value, or throws an exception if the assertion check failed.
   * Use this if you know that the type is of a specific type and you just want to convince the type
   * system.
   *
   * Can be useful when defining lambdas: `s.lambda(s.$number, s.$void).ensure((n) => n + 1)`
   *
   * **Do not rely on these error messages!**
   * Performs an assertion check if not in a production environment.
   *
   * @param {T} o
   * @return {o extends T ? T : never}
   */
  ensure (o) {
    assert(o, this)
    return o
  }
}

/**
 * @template {(new (...args:any[]) => any) | ((...args:any[]) => any)} C
 * @extends {$Schema<C extends ((...args:any[]) => infer T) ? T : (C extends (new (...args:any[]) => any) ? InstanceType<C> : never)>}
 */
export class $ConstructedBy extends $Schema {
  /**
   * @param {C} c
   */
  constructor (c) {
    super()
    this.v = c
  }

  /**
   * @param {any} o
   * @return {o is C extends ((...args:any[]) => infer T) ? T : (C extends (new (...args:any[]) => any) ? InstanceType<C> : never)} o
   */
  check (o) {
    return o?.constructor === this.v
  }
}

/**
 * @template {(new (...args:any[]) => any) | ((...args:any[]) => any)} C
 * @param {C} c
 * @return {CastToSchema<$ConstructedBy<C>>}
 */
export const constructedBy = c => new $ConstructedBy(c)

/**
 * @template {LiteralType} T
 * @extends {$Schema<T>}
 */
export class $Literal extends $Schema {
  /**
   * @param {Array<T>} literals
   */
  constructor (literals) {
    super()
    this.v = literals
  }

  /**
   * @param {any} o
   * @return {o is T}
   */
  check (o) {
    return this.v.some(a => a === o)
  }
}

/**
 * @template {LiteralType[]} T
 * @param {T} literals
 * @return {CastToSchema<$Literal<T[number]>>}
 */
export const literal = (...literals) => new $Literal(literals)

const isOptionalSymbol = Symbol('optional')
/**
 * @template {$Schema<any>} S
 * @extends $Schema<Unwrap<S>|undefined>
 */
class $Optional extends $Schema {
  /**
   * @param {S} s
   */
  constructor (s) {
    super()
    this.s = s
  }

  /**
   * @param {any} o
   * @return {o is (Unwrap<S>|undefined)}
   */
  check (o) {
    return o === undefined || this.s.check(o)
  }

  get [isOptionalSymbol] () { return true }
}

/**
 * @template {{ [key: string|symbol|number]: $Schema<any> }} S
 * @typedef {{ [Key in keyof S as S[Key] extends $Optional<$Schema<any>> ? Key : never]?: S[Key] extends $Optional<$Schema<infer Type>> ? Type : never } & { [Key in keyof S as S[Key] extends $Optional<$Schema<any>> ? never : Key]: S[Key] extends $Schema<infer Type> ? Type : never }} $ObjectToType
 */

/**
 * @template {{[key:string|symbol|number]: $Schema<any>}} S
 * @extends {$Schema<$ObjectToType<S>>}
 */
export class $Object extends $Schema {
  /**
   * @param {S} v
   */
  constructor (v) {
    super()
    this.v = v
  }

  /**
   * @param {any} o
   * @return {o is $ObjectToType<S>}
   */
  check (o) {
    return o != null && obj.every(this.v, (vv, vk) => vv.check(o[vk]))
  }
}

// I used an explicit type annotation instead of $ObjectToType, so that the user doesn't see the
// weird type definitions when inspecting type definions.
/**
 * @template {{ [key:string|symbol|number]: $Schema<any> }} S
 * @param {S} def
 * @return {$Schema<{ [Key in keyof S as S[Key] extends $Optional<$Schema<any>> ? Key : never]?: S[Key] extends $Optional<$Schema<infer Type>> ? Type : never } & { [Key in keyof S as S[Key] extends $Optional<$Schema<any>> ? never : Key]: S[Key] extends $Schema<infer Type> ? Type : never }>}
 */
export const object = def => /** @type {any} */ (new $Object(def))

/**
 * @template {$Schema<string|number|symbol>} Keys
 * @template {$Schema<any>} Values
 * @extends {$Schema<Record<Keys extends $Schema<infer K> ? K : never,Values extends $Schema<infer T> ? T : never>>}
 */
export class $Record extends $Schema {
  /**
   * @param {Keys} keys
   * @param {Values} values
   */
  constructor (keys, values) {
    super()
    this.keys = keys
    this.values = values
  }

  /**
   * @param {any} o
   * @return {o is Record<Keys extends $Schema<infer K> ? K : never,Values extends $Schema<infer T> ? T : never>}
   */
  check (o) {
    return o != null && obj.every(o, (vv, vk) => this.keys.check(vk) && this.values.check(vv))
  }
}

/**
 * @template {$Schema<string|number|symbol>} Keys
 * @template {$Schema<any>} Values
 * @param {Keys} keys
 * @param {Values} values
 * @return {CastToSchema<$Record<Keys,Values>>}
 */
export const record = (keys, values) => new $Record(keys, values)

/**
 * @template {$Schema<any>[]} S
 * @extends {$Schema<{ [Key in keyof S]: S[Key] extends $Schema<infer Type> ? Type : never }>}
 */
export class $Tuple extends $Schema {
  /**
   * @param {S} v
   */
  constructor (v) {
    super()
    this.v = v
  }

  /**
   * @param {any} o
   * @return {o is { [K in keyof S]: S[K] extends $Schema<infer Type> ? Type : never }}
   */
  check (o) {
    return o != null && obj.every(this.v, (vv, vk) => /** @type {$Schema<any>} */ (vv).check(o[vk]))
  }
}

/**
 * @template {Array<$Schema<any>>} T
 * @param {T} def
 * @return {CastToSchema<$Tuple<T>>}
 */
export const tuple = (...def) => new $Tuple(def)

/**
 * @template {$Schema<any>} S
 * @extends {$Schema<Array<S extends $Schema<infer T> ? T : never>>}
 */
export class $Array extends $Schema {
  /**
   * @param {Array<S>} v
   */
  constructor (v) {
    super()
    /**
     * @type {$Schema<S extends $Schema<infer T> ? T : never>}
     */
    this.v = v.length === 1 ? v[0] : new $Union(v)
  }

  /**
   * @param {any} o
   * @return {o is Array<S extends $Schema<infer T> ? T : never>} o
   */
  check (o) {
    return arr.isArray(o) && arr.every(o, oi => this.v.check(oi))
  }
}

/**
 * @template {Array<$Schema<any>>} T
 * @param {T} def
 * @return {$Schema<Array<T extends Array<$Schema<infer S>> ? S : never>>}
 */
export const array = (...def) => new $Array(def)

/**
 * @template T
 * @extends {$Schema<T>}
 */
export class $InstanceOf extends $Schema {
  /**
   * @param {new (...args:any) => T} constructor
   */
  constructor (constructor) {
    super()
    this.v = constructor
  }

  /**
   * @param {any} o
   * @return {o is T}
   */
  check (o) {
    return o instanceof this.v
  }
}

/**
 * @template T
 * @param {new (...args:any) => T} c
 * @return {$Schema<T>}
 */
export const instance = c => new $InstanceOf(c)

/**
 * @template {$Schema<any>[]} Args
 * @typedef {(...args:UnwrapArray<TuplePop<Args>>)=>Unwrap<TupleLast<Args>>} _LArgsToLambdaDef
 */

/**
 * @template {Array<$Schema<any>>} Args
 * @extends {$Schema<_LArgsToLambdaDef<Args>>}
 */
export class $Lambda extends $Schema {
  /**
   * @param {Args} args
   */
  constructor (args) {
    super()
    this.len = args.length - 1
    this.args = tuple(...args.slice(-1))
    this.res = args[this.len]
  }

  /**
   * @param {any} f
   * @return {f is _LArgsToLambdaDef<Args>}
   */
  check (f) {
    return f.constructor === Function && f.length <= this.len
  }
}

/**
 * @template {$Schema<any>[]} Args
 * @param {Args} args
 * @return {$Schema<(...args:UnwrapArray<TuplePop<Args>>)=>Unwrap<TupleLast<Args>>>}
 */
export const lambda = (...args) => new $Lambda(args.length > 0 ? args : [$void])

/**
 * @template {Array<$Schema<any>>} T
 * @extends {$Schema<Intersect<UnwrapArray<T>>>}
 */
export class $Intersection extends $Schema {
  /**
   * @param {T} v
   */
  constructor (v) {
    super()
    /**
     * @type {T}
     */
    this.v = v
  }

  /**
   * @param {any} o
   * @return {o is Intersect<UnwrapArray<T>>}
   */
  check (o) {
    // @ts-ignore
    return arr.every(this.v, check => check.check(o))
  }
}

/**
 * @template {$Schema<any>[]} T
 * @param {T} def
 * @return {CastToSchema<$Intersection<T>>}
 */
export const intersect = (...def) => new $Intersection(def)

/**
 * @template S
 * @extends {$Schema<S>}
 */
export class $Union extends $Schema {
  /**
   * @param {Array<$Schema<S>>} v
   */
  constructor (v) {
    super()
    this.v = v
  }

  /**
   * @param {any} o
   * @return {o is S}
   */
  check (o) {
    return arr.some(this.v, (vv) => vv.check(o))
  }

  static schema = constructedBy($Union)
}

/**
 * @template {Array<$Schema<any>>} T
 * @param {T} def
 * @return {CastToSchema<$Union<T extends [] ? never : (T extends Array<$Schema<infer S>> ? S : never)>>}
 */
export const union = (...def) => $Union.schema.check(def[0]) ? new $Union([...def[0].v, ...def.slice(1)]) : new $Union(def)

/**
 * @type {$Schema<any>}
 */
export const any = intersect()

/**
 * @type {$Schema<bigint>}
 */
export const bigint = constructedBy(BigInt)

/**
 * @type {$Schema<Symbol>}
 */
export const symbol = constructedBy(Symbol)

/**
 * @type {$Schema<number>}
 */
export const number = constructedBy(Number)

/**
 * @type {$Schema<string>}
 */
export const string = constructedBy(String)

/**
 * @type {$Schema<undefined>}
 */
const $undefined = literal(undefined)

export { $undefined as undefined }

/**
 * @type {$Schema<void>}
 */
export const $void = literal(undefined)

export const $null = /** @type {$Schema<null>} */ (literal(null))

/* c8 ignore start */
/**
 * Assert that a variable is of this specific type.
 * The assertion check is only performed in non-production environments.
 *
 * @type {<T>(o:any,schema:$Schema<T>) => asserts o is T}
 */
export const assert = env.production
  ? () => {}
  : (o, schema) => {
      if (!schema.check(o)) {
        throw error.create(`Expected value to be of type ${schema.constructor.name}.`)
      }
    }
/* c8 ignore end */
