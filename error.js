/**
 * Error helpers.
 *
 * @module error
 */

/* istanbul ignore next */
/**
 * @param {string} s
 * @return {Error}
 */
export const create = s => new Error(s)

/* istanbul ignore next */
/**
 * @throws {Error}
 * @return {never}
 */
export const methodUnimplemented = () => {
  throw create('Method unimplemented')
}

/* istanbul ignore next */
/**
 * @throws {Error}
 * @return {never}
 */
export const unexpectedCase = () => {
  throw create('Unexpected case')
}
