import * as t from './testing.js'
import * as symbol from './symbol.js'

/**
 * @param {t.TestCase} _tc
 */
export const testBasicSymbolFeatures = _tc => {
  const s1 = symbol.create()
  const s2 = symbol.create()
  t.assert(s1 !== s2)
  t.assert(s1 === s1) // eslint-disable-line
  t.assert(symbol.isSymbol(s1))
}
