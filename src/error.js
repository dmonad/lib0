/**
 * Error helpers.
 *
 * @module error
 */

/**
 * @param {string} s
 * @return {Error}
 */
/* c8 ignore next */
export const create = s => new Error(s)

/**
 * `@type` (not `@param`/`@return`) is required for the `never` return to affect control-flow
 * analysis — a call to a never-returning function only terminates a code path if the callee is
 * declared with an explicit type annotation.
 *
 * @throws {Error}
 * @type {() => never}
 */
/* c8 ignore next 3 */
export const methodUnimplemented = () => {
  throw create('Method unimplemented')
}

/**
 * @throws {Error}
 * @type {() => never}
 */
/* c8 ignore next 3 */
export const unexpectedCase = () => {
  throw create('Unexpected case')
}

/**
 * `@type` (not `@param`/`@return`) is required — an assertion signature only narrows if the
 * callee is declared with an explicit type annotation.
 *
 * @type {(property: boolean) => asserts property is true}
 */
export const assert = property => { if (!property) throw create('Assert failed') }
