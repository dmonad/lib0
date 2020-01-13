import * as map from './map.js'
import * as math from './math.js'
import * as t from './testing.js'

/**
 * @param {t.TestCase} tc
 */
export const testMap = tc => {
  const m = map.create()
  m.set(1, 2)
  m.set(2, 3)
  t.assert(map.map(m, (value, key) => value * 2 + key).reduce(math.add) === 13)
  let numberOfWrites = 0
  const createT = () => {
    numberOfWrites++
    return {}
  }
  map.setIfUndefined(m, 3, createT)
  map.setIfUndefined(m, 3, createT)
  map.setIfUndefined(m, 3, createT)
  t.compare(map.copy(m), m)
  t.assert(numberOfWrites === 1)
}
