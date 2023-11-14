import * as t from '../testing.js' // eslint-disable-line
import * as parser from './parser.js'
import * as buffer from '../buffer.js'

/**
 * @param {t.TestCase} _tc
 */
export const testVariableDeclaration = _tc => {
  const r1 = parser.parse(' test', parser.readWord)
  const r2 = parser.parse(' test', p => parser.readKeyword(p, 'test'))
  t.compare(r1.hash, r2.hash)
  /**
   * @extends {parser.NodeVal<any>}
   */
  class NodeValDuplicate extends parser.NodeVal {}
  const r3 = parser.mapResult(r1, r => new NodeValDuplicate(r.val))
  t.assert(r3.offset === 1 && r1.offset === r3.offset)
  t.assert(!buffer.equal(r1.hash, r3.hash))
}
