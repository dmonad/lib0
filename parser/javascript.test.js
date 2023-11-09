import * as t from '../testing.js' // eslint-disable-line
import * as jsparser from './javascript.js'

/**
 * @param {t.TestCase} _tc
 */
export const testVariableDeclaration = _tc => {
  console.log(jsparser.parse('const x = 4'))
  console.log(jsparser.parse('const x 4'))
}
