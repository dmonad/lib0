
/**
 * @throws
 * @return {never}
 */
export const methodUnimplemented = () => {
  throw new Error('Method unimplemented')
}

/**
 * @throws
 * @return {never}
 */
export const unexpectedCase = () => {
  throw new Error('Unexpected case')
}

/**
 * @param {string} s
 * @return {Error}
 */
export const create = s => new Error(s)
