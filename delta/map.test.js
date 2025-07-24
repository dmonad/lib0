import * as t from 'lib0/testing'
import * as mapDelta from './map.js'
import * as s from 'lib0/schema'

/**
 * @param {t.TestCase} _tc
 */
export const testMapDeltaBasics = _tc => {
  const $d = s.$object({ 
    num: mapDelta.$insertOp(s.$union(s.$number, s.$string)),
    str: mapDelta.$insertOp(s.$string)
  })
  const d = mapDelta.create($d)
  // @ts-expect-error
  d.set('str', 42)
  d.set('str', 'hi')
  t.fails(() => {
    // @ts-expect-error
    d.set('?', 'hi')
  })
  d.forEach((c, cn) => {
    if (cn === 'str') {
      mapDelta.$insertOp(s.$string).check(c)
    }
  })
  d.delete('str')
  // @ts-expect-error
  d.delete('?')
  // @ts-expect-error
  d.get('?')
  const x = d.get('str')
  t.assert(mapDelta.$insertOp(s.$string).optional.validate(x))
  // @ts-expect-error should return the correct typed object
  t.assert(!mapDelta.$insertOp(s.$number).optional.validate(x))
  d.has('str')
  // @ts-expect-error should throw type error
  d.has('_')
  for (const entry of d) {
    // ensure that typings work correctly when iterating through changes
    if (entry[0] === 'str') {
      t.assert(mapDelta.$insertOp(s.$string).optional.validate(entry[1]))
      // @ts-expect-error should return the correct typed object
      t.assert(!mapDelta.$insertOp(s.$number).optional.validate(entry[1]))
    }
  }
  const ddone = d.done()
}
