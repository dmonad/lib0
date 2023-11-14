import * as t from '../testing.js' // eslint-disable-line
import * as jsparser from './javascript.js'
import * as parsing from './parser.js'

/**
 * @param {t.TestCase} _tc
 */
export const testVariableDeclaration = _tc => {
  const r1 = jsparser.parse('const x = 4')
  const r2 = jsparser.parse('const x = 4')
  console.log(r1)
  console.log(jsparser.parse('const x 4'))
  t.assert(parsing.isError(jsparser.parse('const x 4')))
  t.assert(!parsing.isError(r1))
  t.compare(r1.hash, r2.hash)
  console.log({ hash: r1.hash })
}
