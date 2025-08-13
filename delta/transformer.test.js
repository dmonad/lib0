import * as t from '../testing.js'
import * as dt from './transformer.js'
import * as delta from './index.js'
import * as s from '../schema.js'

const idt = dt.transformer({
  $in: delta.$deltaMap(s.$object({ x: s.$string })),
  $out: delta.$deltaMap(s.$object({ x: s.$string })),
  state: () => null,
  applyA: (d, state, def) => {
    return dt.transformResult(null, d)
  },
  applyB: (d, state, def) => {
    return dt.transformResult(d, null)
  }
})
const mapString = dt.transformer({
  $in: delta.$deltaMap(s.$object({ x: s.$number })),
  $out: delta.$deltaMap(s.$object({ x: s.$string })),
  state: () => null,
  applyA: (d, state, def) => {
    const dout = delta.createDeltaMap(s.$object({ x: s.$string }))
    d.forEach(op => {
      if (delta.$insertOp.check(op)) {
        dout.set(op.key, op.value + '')
      }
    })
    return dt.transformResult(null, dout)
  },
  applyB: (d, state, def) => {
    const dout = delta.createDeltaMap(s.$object({ x: s.$number }))
    d.forEach(op => {
      if (delta.$insertOp.check(op)) {
        dout.set(op.key, Number.parseInt(op.value))
      }
    })
    return dt.transformResult(dout, null)
  }
})
const mapNumber = dt.transformer({
  $in: delta.$deltaMap(s.$object({ x: s.$string })),
  $out: delta.$deltaMap(s.$object({ x: s.$number })),
  state: () => null,
  applyA: (d, state, def) => {
    const dout = delta.createDeltaMap(s.$object({ x: s.$number }))
    d.forEach(op => {
      if (delta.$insertOp.check(op)) {
        dout.set(op.key, Number.parseInt(op.value))
      }
    })
    return dt.transformResult(null, dout)
  },
  applyB: (d, state, def) => {
    const dout = delta.createDeltaMap(s.$object({ x: s.$string }))
    d.forEach(op => {
      if (delta.$insertOp.check(op)) {
        dout.set(op.key, op.value + '')
      }
    })
    return dt.transformResult(dout, null)
  }
})

/**
 * @param {t.TestCase} _tc
 */
export const testBasics = _tc => {
  idt.pipe(idt)
  idt.pipe(idt)
  mapNumber.pipe(mapString)
  mapString.pipe(mapNumber)
  // @ts-expect-error
  mapString.pipe(mapString)
  // @ts-expect-error
  mapString.pipe(mapNumber, mapNumber)
  const q = mapString.pipe(mapNumber).init()
  {
    const d1 = delta.createDeltaMap(s.$object({ x: s.$number }))
    const d1_ = q.applyA(d1).b
    t.compare(d1, d1_)
  }
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapBasics = _tc => {
  const m1 = dt.map({
    mynum: mapNumber
  }).init()
  const d = delta.createDeltaMap(s.$object({ x: s.$string })).set('x', '42').done()
  const res = m1.applyA(d)
  t.assert(res.a == null)
  const qq = delta.createDeltaMap(s.$object({ x: s.$number })).set('x', 42).done()
  const q = delta.createDeltaMap(s.$object({ mynum: delta.$deltaMap(s.$object({ x: s.$number })) })).modify('mynum', qq).done()
  t.compare(res.b, q)
}
