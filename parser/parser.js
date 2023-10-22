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

/**
 * @template T
 * @param {string} content
 * @param {function(Parser):T} reader
 * @return T
 */
export const parse = (content, reader) => reader(new Parser(content))

/**
 * @template {Array<function(Parser):any>} ARR
 *
 * @param {Parser} p
 * @param {ARR} chain
 * @return {{ [I in keyof ARR]: Exclude<ReturnType<ARR[I]>,null> }|null}
 */
export const tryRead = (p, ...chain) => {
  const oldIndex = p.i
  /**
   * @type {{ [I in keyof ARR]: ReturnType<ARR[I]> }}
   */
  const result = []
  for (let i = 0; i < chain.length; i++) {
    const r = chain[i](p)
    if (r == null) {
      p.i = oldIndex
      return null
    }
    result.push(r)
  }
  return result
}

/**
 * @param {Parser} p
 */
export const readSpace = p => {
  while (p.c[p.i] === ' ') { p.i++ }
}

/**
 * @param {Parser} p
 */
export const readWord = p => {
  readSpace(p)
  const start = p.i
  while (p.c[p.i] !== ' ') { p.i++ }
  return start < p.i ? p.c.substring(start, p.i) : null
}

/**
 * @param {Parser} p
 * @param {string} char
 */
export const readChar = (p, char) => {
  readSpace(p)
  const c = p.c[p.i++]
  return c !== char ? null : c
}

/**
 * @param {Parser} p
 */
export const readNumber = p => {
  readSpace(p)
  const start = p.i
  for (let c = p.c.charCodeAt(p.i); c >= 48 && c <= 57; c = p.c.charCodeAt(++p.i)) { /* */ }
  return start < p.i ? Number.parseInt(p.c.substring(start, p.i)) : null
}

/**
 * @template {Array<string>} KS
 * @param {Parser} p
 * @param {KS} keywords
 * @return {KS[number]|null}
 */
export const readKeyword = (p, ...keywords) => {
  const word = readWord(p)
  return keywords.includes(word) ? word : null
}
