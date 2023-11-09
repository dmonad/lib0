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
  }
}

export class Node {
  /**
   * @param {number} offset
   * @param {number} len
   */
  constructor (offset, len) {
    this.offset = offset
    this.len = len
  }
}

/**
 * @template V
 */
export class NodeVal {
  /**
   * @param {number} offset
   * @param {number} len
   * @param {V} val
   */
  constructor (offset, len, val) {
    this.offset = offset
    this.len = len
    this.val = val
  }
}

/**
 * @template N
 * @typedef {N|Err} Result
 */

/**
 * @template N,M
 * @param {Result<N>} res
 * @param {function(N):Result<M>} fm
 * @return Result<M>
 */
export const mapResult = (res, fm) =>
  isError(res) ? /** @type {Err} */ (res) : fm(/** @type {N} */ (res))

/**
 * @template N
 * @param {Result<N>} res
 * @param {function(Err):Err} fm
 * @return Result<N>
 */
export const mapError = (res, fm) =>
  isError(res) ? fm(/** @type {Err} */ (res)) : res

/**
 * @template T
 * @param {number} offset
 * @param {number} len
 * @param {T} val
 */
export const resultVal = (offset, len, val) => new NodeVal(offset, len, val)

export class Err {
  /**
   * @param {number} pos
   * @param {string} expected
   */
  constructor (pos, expected) {
    this.pos = pos
    this.expected = expected
  }

  toString () {
    return `${this.pos}: Expected ${this.expected}`
  }
}

/**
 * @param {any|Err} v
 */
export const isError = v => v.constructor === Err

/**
 * @param {number} pos
 * @param {string} expected
 */
export const error = (pos, expected) => new Err(pos, expected)

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
 * @return {Result<{ [I in keyof ARR]: (ReturnType<ARR[I]> extends Result<infer NN> ? NN : unknown) }>}
 */
export const tryRead = (p, ...chain) => {
  const oldIndex = p.i
  const res = /** @type {Array<any>} */ ([])
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i](p)
    if (isError(r)) {
      p.i = oldIndex
      return r
    }
    res.push(r)
  }
  return /** @type {any} */ (res)
}

/**
 * @param {Parser} p
 */
export const readSpace = p => {
  while (p.c[p.i] === ' ') { p.i++ }
}

/**
 * @param {Parser} p
 * @return {Result<string>}
 */
export const readWord = p => {
  readSpace(p)
  const start = p.i
  while (p.c[p.i] !== ' ') { p.i++ }
  return start < p.i ? p.c.substring(start, p.i) : error(start, 'word')
}

/**
 * @template {string} C
 * @param {Parser} p
 * @param {C} char
 * @return {Result<C>}
 */
export const readChar = (p, char) => {
  readSpace(p)
  const c = p.c[p.i++]
  return c === char ? /** @type {C} */ (c) : error(p.i - 1, `char '${char}'`)
}

/**
 * @param {Parser} p
 * @return {Result<number>}
 */
export const readNumber = p => {
  readSpace(p)
  const start = p.i
  for (let c = p.c.charCodeAt(p.i); c >= 48 && c <= 57; c = p.c.charCodeAt(++p.i)) { /* */ }
  return start < p.i ? Number.parseInt(p.c.substring(start, p.i)) : error(start, 'number')
}

/**
 * @template {Array<string>} KS
 * @param {Parser} p
 * @param {KS} keywords
 * @return {Result<KS[number]>}
 */
export const readKeyword = (p, ...keywords) => {
  const index = p.i
  return mapResult(readWord(p), word => keywords.includes(word) ? word : error(index, `keyword ${keywords.join(',')}`))
}
