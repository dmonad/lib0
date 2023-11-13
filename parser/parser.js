/**
 * @module parser
 *
 * Naive parser implementation. Similar to lib0/encoding.
 */

export class Parser {
  /**
   * @param {string} content
   */
  constructor (content) {
    this.c = content
    this.i = 0
    /**
     * Curretn offset to the previous node that was successfully parsed.
     * @type {number}
     */
    this.offset = 0
  }

  get state () {
    return {
      i: this.i,
      offset: this.offset
    }
  }

  /**
   * @param {{i: number,offset: number}} state
   */
  restoreState ({ i, offset }) {
    this.i = i
    this.offset = offset
  }
}

export class Node {
  constructor () {
    this.offset = 0
    this.len = 0
  }
}

/**
 * @template V
 */
export class NodeVal {
  /**
   * @param {V} val
   */
  constructor (val) {
    this.offset = 0
    this.len = 0
    this.val = val
  }
}

export class Err {
  /**
   * @param {string} expected
   */
  constructor (expected) {
    this.offset = 0
    this.len = 0
    this.expected = expected
  }

  toString () {
    return `Expected ${this.expected}`
  }
}

/**
 * @template {Node} N
 * @typedef {N|Err} Result
 */

/**
 * @template {Node} N
 * @template {Node} M
 * @param {Result<N>} res
 * @param {function(N):Result<M>} fm
 * @return Result<M>
 */
export const mapResult = (res, fm) => {
  if (isError(res)) return /** @type {Err} */ (res)
  const r = fm(/** @type {N} */ (res))
  r.offset = res.offset
  r.len = res.len
  return r
}

/**
 * @template {Result<Node>} RES
 * @param {RES} res
 * @param {function(Err):Err} fm
 * @return R
 */
export const mapError = (res, fm) =>
  isError(res) ? fm(/** @type {Err} */ (res)) : res

/**
 * @template T
 * @param {T} val
 */
export const resultVal = val => new NodeVal(val)

/**
 * @param {any|Err} v
 */
export const isError = v => v.constructor === Err

/**
 * @param {string} expected
 */
export const error = (expected) => new Err(expected)

/**
 * @template T
 * @param {string} content
 * @param {function(Parser):T} reader
 * @return T
 */
export const parse = (content, reader) => reader(new Parser(content))

/**
 * @template {Array<function(Parser):Result<any>>} ARR
 *
 * @param {Parser} p
 * @param {ARR} chain
 * @return {Result<NodeVal<{ [I in keyof ARR]: (ReturnType<ARR[I]> extends Result<infer NN> ? NN : unknown) }>>}
 */
export const tryReadNodes = (p, ...chain) => {
  const startingState = p.state
  const res = /** @type {NodeVal<Array<any>>} */ (resultVal([]))
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i](p)
    if (isError(r)) {
      p.restoreState(startingState)
      return r
    }
    res.val.push(r)
  }
  return /** @type {any} */ (res)
}

/**
 * @todo this should probably be a property of Parser to make "space" configurable
 *
 * @param {Parser} p
 */
export const readSpace = p => {
  while (p.c[p.i] === ' ') {
    p.i++
    p.offset++
  }
}

/**
 * @template {Result<Node>} R
 * @param {Parser} p
 * @param {function(Parser, number):R} f arguments are: Parser,start
 * @return {R}
 */
export const readNodeHelper = (p, f) => {
  readSpace(p)
  const start = p.i
  const offset = p.offset
  const res = f(p, start)
  res.offset = offset
  res.len = p.i - start
  p.offset = 0
  return res
}

/**
 * @param {Parser} p
 * @return {Result<NodeVal<string>>}
 */
export const readWord = p => readNodeHelper(p, (p, start) => {
  while (p.c[p.i] !== ' ') { p.i++ }
  return p.i > start ? resultVal(p.c.substring(start, p.i)) : error('word')
})

/**
 * @template {string} C
 * @param {Parser} p
 * @param {C} char
 * @return {Result<NodeVal<C>>}
 */
export const readChar = (p, char) => readNodeHelper(p, (p) => {
  const c = p.c[p.i++]
  return c === char ? resultVal(/** @type {C} */ (c)) : error(`char '${char}'`)
})

/**
 * @param {Parser} p
 * @return {Result<NodeVal<number>>}
 */
export const readNumber = p => readNodeHelper(p, (p, start) => {
  for (let c = p.c.charCodeAt(p.i); c >= 48 && c <= 57; c = p.c.charCodeAt(++p.i)) { /* */ }
  return start < p.i ? resultVal(Number.parseInt(p.c.substring(start, p.i))) : error('number')
})

/**
 * @template {Array<string>} KS
 * @param {Parser} p
 * @param {KS} keywords
 * @return {Result<NodeVal<KS[number]>>}
 */
export const readKeyword = (p, ...keywords) => readNodeHelper(p, (p) =>
  mapResult(readWord(p), word => keywords.includes(word.val) ? word : error(`keyword ${keywords.join(',')}`))
)
