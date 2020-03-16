/**
 * Error helpers.
 *
 * @module error
 */

/**
 * @param {string} s
 * @return {Error}
 */
/* istanbul ignore next */
export const create = s => new Error(s)

/**
 * @throws {Error}
 * @return {never}
 */
/* istanbul ignore next */
export const methodUnimplemented = () => {
  throw create('Method unimplemented')
}

/**
 * @throws {Error}
 * @return {never}
 */
/* istanbul ignore next */
export const unexpectedCase = () => {
  throw create('Unexpected case')
}
