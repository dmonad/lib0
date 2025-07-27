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
  d.forEach((c) => {
    if (c.key === 'str') {
      // @ts-expect-error because value can't be a string
      c.value === 42
    } else if (c.key === 'num') {
      c.value === 42
    } else {
      // no other option, this will always throw if called
      s.assert(c, s.$never)
    }
  })
  d.delete('str')
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
    if (entry.key === 'str') {
      t.assert(mapDelta.$insertOp(s.$string).optional.validate(entry))
      // @ts-expect-error should return the correct typed object
      t.assert(!mapDelta.$insertOp(s.$number).optional.validate(entry))
    }
  }
  const ddone = d.done()
}
