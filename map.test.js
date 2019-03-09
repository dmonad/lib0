import * as map from './map.js'
import * as math from './math.js'
import * as t from './testing.js'

export const testMap = tc => {
  const m = map.create()
  m.set(1, 2)
  m.set(2, 3)
  t.assert(map.map(m, (value, key) => value * 2 + key).reduce(math.add) === 13)
  let numberOfWrites = 0
  const createT = i => {
    numberOfWrites++
    return i + 1
  }
  map.setTfUndefined(m, 3, createT)
  map.setTfUndefined(m, 3, createT)
  map.setTfUndefined(m, 3, createT)
  t.assert(numberOfWrites === 1)
}
