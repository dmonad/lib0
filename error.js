import * as f from './function.js'

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
