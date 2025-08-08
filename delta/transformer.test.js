import * as t from 'lib0/testing'
import * as dt from './transformer.js'
import * as dmap from './map.js'
import * as s from '../schema.js'

/**
 * @param {t.TestCase} _tc
 */
export const testBasics = _tc => {
  const mapString = dt.transformer({
    $in: dmap.$deltaMap(s.$object({ x: s.$number })),
    $out: dmap.$deltaMap(s.$object({ x: s.$string })),
    state: () => null,
    transform: (d,state,def) => {
      const dout = dmap.create(s.$object({ x: s.$string }))
      d.forEach(op => {
        if (dmap.$insertOpAny.check(op)) {
          dout.set(op.key, op.value + '')
        }
      })
      return dout
    },
    inverse: (d, state, def) => {
      const dout = dmap.create(s.$object({ x: s.$number }))
      d.forEach(op => {
        if (dmap.$insertOpAny.check(op)) {
          dout.set(op.key, Number.parseInt(op.value))
        }
      })
      return dout
    },
  })
  const mapNumber = dt.transformer({
    $in: dmap.$deltaMap(s.$object({ x: s.$string })),
    $out: dmap.$deltaMap(s.$object({ x: s.$number })),
    state: () => null,
    transform: (d,state,def) => {
      const dout = dmap.create(s.$object({ x: s.$number }))
      d.forEach(op => {
        if (dmap.$insertOpAny.check(op)) {
          dout.set(op.key, Number.parseInt(op.value))
        }
      })
      return dout
    },
    inverse: (d, state, def) => {
      return mapString.transform(d, state, mapString)
    },
  })
  mapString.pipe(mapNumber)
  // @ts-expect-error
  mapString.pipe(mapString)
  // @ts-expect-error
  mapString.pipe(mapNumber,mapNumber)
  const q = mapString.pipe(mapNumber).init()
  {
    const d1 = dmap.create(s.$object({ x: s.$number }))
    const d1_ = q.applyA(d1)
    t.compare(d1, d1_)
  }
}
