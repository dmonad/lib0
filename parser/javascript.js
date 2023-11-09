/**
 * Trying to implement https://github.com/estree/estree/blob/master/es5.md#blockstatement
 *
 * Note that this merely implements a subset of the JavaScript language. This is intentional and by
 * design. However, a parsed program must be valid JavaScript.
 *
 * @todo failure should return undefined because null might be a valid result?
 */

import * as parser from './parser.js'

/**
 * @param {string} content
 */
export const parse = content => parser.parse(content, readVariableDeclaration)

export class Program {
  constructor () {
    /**
     * @type {Array<Statement>}
     */
    this.body = []
  }
}

/**
 * @param {parser.Parser} p
 */
const readIdentifier = p => {
  parser.readSpace(p)
  const start = p.i
  for (let c = p.c.charCodeAt(p.i); c >= 97 && c <= 122 && p.i < p.c.length - 1; c = p.c.charCodeAt(++p.i)) { /* */ }
  while (p.c[p.i] !== ' ') { p.i++ }
  return start < p.i ? new Identifier(p.c.substring(start, p.i)) : parser.error(start, 'Identifier')
}

/**
 * @typedef {'var'|'let'|'const'} DeclarationKinds
 */

/**
 * @typedef {VariableDeclaration} Declaration
 */

export class VariableDeclaration {
  /**
   * @param {DeclarationKinds} kind
   * @param {Identifier} id
   * @param {Expression|null} init
   */
  constructor (kind, id, init) {
    this.kind = kind
    this.id = id
    this.init = init
  }
}

/**
 * @param {parser.Parser} p
 * @return {parser.Result<VariableDeclaration>}
 */
export const readVariableDeclaration = p => {
  const variableDeclaration = parser.tryRead(p, p => parser.readKeyword(p, 'var', 'let', 'const'), readIdentifier, p => parser.readChar(p, '='), readExpression)
  return parser.mapResult(variableDeclaration, ([kind, id,, init]) => new VariableDeclaration(kind, id, init))
}

/**
 * @typedef {Identifier|Literal|BinaryExpression} Expression
 */

/**
 * @param {parser.Parser} p
 * @return {parser.Result<Expression>}
 */
export const readExpression = p =>
  parser.mapResult(parser.readNumber(p), num => new Literal(num))

export class Identifier {
  /**
   * @param {string} name
   */
  constructor (name) {
    this.name = name
  }
}

export class Literal {
  /**
   * @param {string|boolean|null|number|RegExp} value
   */
  constructor (value) {
    this.value = value
  }
}

// Statements..

/**
 * @typedef {ExpressionStatement|Declaration} Statement
 */

export class ExpressionStatement {
  /**
   * @param {Expression} expression
   */
  constructor (expression) {
    this.expression = expression
  }
}

/**
 * @typedef {"==" | "!=" | "===" | "!==" | "<" | "<=" | ">" | ">=" | "<<" | ">>" | ">>>" | "+" | "-" | "*" | "/" | "%" | "|" | "^" | "&" | "in" | "instanceof"} BinaryOperator
 */

export class BinaryExpression {
  /**
   * @param {Expression} left
   * @param {Expression} right
   * @param {BinaryOperator} operator
   */
  constructor (left, right, operator) {
    this.left = left
    this.right = right
    this.operator = operator
  }
}
