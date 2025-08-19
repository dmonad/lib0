import * as t from '../testing.js'
import * as dt from './transformer.js'
import * as delta from './index.js'
import * as s from '../schema.js'

// @todo just have a single `dt.transformer` function that returns a factory
const mapString = dt.defineTransformer(delta.$deltaMapWith(s.$object({ x: s.$number })), dt.transformer({
  $in: delta.$deltaMapWith(s.$object({ x: s.$number })),
  $out: delta.$deltaMapWith(s.$object({ x: s.$string })),
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
}))

const mapNumber = dt.defineTransformer(delta.$deltaMapWith(s.$object({ x: s.$string })), dt.transformer({
  $in: delta.$deltaMapWith(s.$object({ x: s.$string })),
  $out: delta.$deltaMapWith(s.$object({ x: s.$number })),
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
}))

/**
 * @todo remove this superfluous transformer
 * @template {delta.AbstractDelta} Delta
 * @param {s.$Schema<Delta>} $in
 * @return {dt.TransformerTemplate<null,Delta,Delta>}
 */
export const id = $in => dt.transformer({
  $in: $in,
  $out: s.$any,
  state: () => null,
  applyA: (d, state, def) => {
    return dt.transformResult(null, d)
  },
  applyB: (d, state, def) => {
    return dt.transformResult(d, null)
  }
})

const idFactory = dt.createTransformerFactory(delta.$deltaMap, $d => {
  const x = id($d)
  const y = x.pipe(id)
  return y
})

/**
 * @param {t.TestCase} _tc
 */
export const testBasics = _tc => {
  const idFactory = dt.createTransformerFactory(delta.$deltaMap, $d => {
    const x = id($d)
    const y = x.pipe(id)
    return y
  })

  const $snIn = delta.$deltaMapWith(s.$object({ x: s.$string }))

  const mn = mapNumber($snIn).pipe(id).pipe(mapString)

  const _q = id(delta.$deltaMap).pipe(id)
  dt.createTransformerFactory(delta.$deltaMapWith(s.$object({ x: s.$string })), $d => mapNumber($d).pipe(mapString))
  // @ts-expect-error
  dt.createTransformerFactory(delta.$deltaMapWith(s.$object({ x: s.$string })), $d => mapNumber($d).pipe(mapNumber))

  const q = mapNumber($snIn).pipe(mapString).init()
  {
    const d1 = delta.createDeltaMap(s.$object({ x: s.$string }))
    const d1_ = q.applyA(d1).b
    t.compare(d1, d1_)
  }
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapBasics = _tc => {
  const $sa = delta.$deltaMapWith(s.$object({ x: s.$string }))
  const qqq = dt.map({
    mynum: mapNumber
  })($sa)
  const mappedMapNumber = dt.createTransformerFactory($sa, dt.map({
      mynum: mapNumber
    })
  )
  const m1 = mappedMapNumber($sa).init()
  const d = delta.createDeltaMap(s.$object({ x: s.$string })).set('x', '42').done()
  const res = m1.applyA(d)
  t.assert(res.a == null)
  const qq = delta.createDeltaMap(s.$object({ x: s.$number })).set('x', 42).done()
  const q = delta.createDeltaMap(s.$object({ mynum: delta.$deltaMapWith(s.$object({ x: s.$number })) })).modify('mynum', qq).done()
  t.compare(res.b, q)
  // @todo make sure the result is properly typed (not any)
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapQuery = _tc => {
  const $sa = delta.$deltaMapWith(s.$object({ x: s.$string }))
  const q42 = dt.pipe(mapNumber, id)
  const a1 = dt.query('x')
  const xxx = dt.map({
    mynum: a1
  })($sa)
  const d = delta.createDeltaMap(s.$object({ x: s.$string })).set('x', '42').done()
  const res = xxx.init().applyA(d)
  t.assert(res.a == null)
  const qq = delta.createDeltaMap(s.$object({ x: s.$number })).set('x', 42).done()
  const q = delta.createDeltaMap(s.$object({ mynum: delta.$deltaMapWith(s.$object({ x: s.$number })) })).modify('mynum', qq).done()
  t.compare(res.b, q)
}

export const testMappingTransformer = () => {
  const q = dt.defineTransformerDynamic(delta.$deltaMapWith(s.$object({ x: s.$number })), $d => id($d))
  q(delta.$deltaMapWith(s.$object({ x: s.$number })))
}
