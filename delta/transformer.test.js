import * as t from 'lib0/testing'
import * as dt from './transformer.js'
import * as dmap from './map.js'
import * as s from '../schema.js'

/**
 * @param {t.TestCase} _tc
 */
export const testBasics = _tc => {
  const idt = dt.transformer({
    $in: dmap.$deltaMap(s.$object({ x: s.$string })),
    $out: dmap.$deltaMap(s.$object({ x: s.$string })),
    state: () => null,
    applyA: (d,state,def) => {
      return dt.transformResult(null, d)
    },
    applyB: (d, state, def) => {
      return dt.transformResult(d, null)
    }
  })
  const mapString = dt.transformer({
    $in: dmap.$deltaMap(s.$object({ x: s.$number })),
    $out: dmap.$deltaMap(s.$object({ x: s.$string })),
    state: () => null,
    applyA: (d,state,def) => {
      const dout = dmap.create(s.$object({ x: s.$string }))
      d.forEach(op => {
        if (dmap.$insertOpAny.check(op)) {
          dout.set(op.key, op.value + '')
        }
      })
      return dt.transformResult(null, dout)
    },
    applyB: (d, state, def) => {
      const dout = dmap.create(s.$object({ x: s.$number }))
      d.forEach(op => {
        if (dmap.$insertOpAny.check(op)) {
          dout.set(op.key, Number.parseInt(op.value))
        }
      })
      return dt.transformResult(dout, null)
    },
  })
  const mapNumber = dt.transformer({
    $in: dmap.$deltaMap(s.$object({ x: s.$string })),
    $out: dmap.$deltaMap(s.$object({ x: s.$number })),
    state: () => null,
    applyA: (d,state,def) => {
      const dout = dmap.create(s.$object({ x: s.$number }))
      d.forEach(op => {
        if (dmap.$insertOpAny.check(op)) {
          dout.set(op.key, Number.parseInt(op.value))
        }
      })
      return dt.transformResult(null, dout)
    },
    applyB: (d, state, def) => {
      const dout = dmap.create(s.$object({ x: s.$string }))
      d.forEach(op => {
        if (dmap.$insertOpAny.check(op)) {
          dout.set(op.key, op.value + '')
        }
      })
      return dt.transformResult(dout, null)
    },
  })
  idt.pipe(idt)
  const x = mapNumber.pipe(mapString).pipe(mapNumber).pipe(mapString)
  idt.pipe(idt)
  mapNumber.pipe(mapString)
  mapString.pipe(mapNumber)
  // @ts-expect-error
  mapString.pipe(mapString)
  // @ts-expect-error
  mapString.pipe(mapNumber,mapNumber)
  const q = mapString.pipe(mapNumber).init()
  {
    const d1 = dmap.create(s.$object({ x: s.$number }))
    const d1_ = q.applyA(d1).b
    t.compare(d1, d1_)
  }
}
