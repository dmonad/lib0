/**
 * Trying to implement https://github.com/estree/estree/blob/master/es5.md
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

export class Identifier extends parser.Node {
  /**
   * @param {string} name
   */
  constructor (name) {
    super()
    this.name = name
  }
}

export class Literal extends parser.Node {
  /**
   * @param {string|boolean|null|number|RegExp} value
   */
  constructor (value) {
    super()
    this.value = value
  }
}

// Statements..

/**
 * @typedef {ExpressionStatement|Declaration} Statement
 */

export class ExpressionStatement extends parser.Node {
  /**
   * @param {Expression} expression
   */
  constructor (expression) {
    super()
    this.expression = expression
  }
}

/**
 * @typedef {"==" | "!=" | "===" | "!==" | "<" | "<=" | ">" | ">=" | "<<" | ">>" | ">>>" | "+" | "-" | "*" | "/" | "%" | "|" | "^" | "&" | "in" | "instanceof"} BinaryOperator
 */

export class BinaryExpression extends parser.Node {
  /**
   * @param {Expression} left
   * @param {Expression} right
   * @param {BinaryOperator} operator
   */
  constructor (left, right, operator) {
    super()
    this.left = left
    this.right = right
    this.operator = operator
  }
}

/**
 * @typedef {'var'|'let'|'const'} DeclarationKinds
 */

/**
 * @typedef {VariableDeclaration} Declaration
 */

export class VariableDeclaration extends parser.Node {
  /**
   * @param {parser.NodeVal<DeclarationKinds>} kind
   * @param {Identifier} id
   * @param {Expression|null} init
   */
  constructor (kind, id, init) {
    super()
    this.kind = kind
    this.id = id
    this.init = init
  }
}

/**
 * @param {parser.Parser} p
 */
const readIdentifier = p => parser.readNodeHelper(p, (p, start) => {
  for (let c = p.c.charCodeAt(p.i); c >= 97 && c <= 122 && p.i < p.c.length - 1; c = p.c.charCodeAt(++p.i)) { /* */ }
  while (p.c[p.i] !== ' ') { p.i++ }
  return start < p.i ? new Identifier(p.c.substring(start, p.i)) : parser.error('Identifier')
})

/**
 * @param {parser.Parser} p
 * @return {parser.Result<VariableDeclaration>}
 */
export const readVariableDeclaration = p => {
  const variableDeclaration = parser.tryReadNodes(p, p => parser.readKeyword(p, 'var', 'let', 'const'), readIdentifier, p => parser.readChar(p, '='), readExpression)
  return parser.mapResult(variableDeclaration, ({ val: [kind, id,, init] }) => new VariableDeclaration(kind, id, init))
}

/**
 * @typedef {Identifier|Literal|BinaryExpression} Expression
 */

/**
 * @param {parser.Parser} p
 * @return {parser.Result<Expression>}
 */
export const readExpression = p =>
  parser.mapResult(parser.readNumber(p), num => new Literal(num.val))
