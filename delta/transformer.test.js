import * as t from '../testing.js'
import * as dt from './transformer.js'
import * as delta from './index.js'
import * as s from '../schema.js'

const mapString = dt.transformStatic(delta.$deltaMap(s.$object({ x: s.$number })), dt.transformer({
  $in: delta.$deltaMap(s.$object({ x: s.$number })),
  $out: delta.$deltaMap(s.$object({ x: s.$string })),
  state: () => null,
  applyA: d => {
    const dout = delta.createDeltaMap(s.$object({ x: s.$string }))
    d.forEach(op => {
      if (delta.$insertOp.check(op)) {
        dout.set(op.key, op.value + '')
      }
    })
    return dt.transformResult(null, dout)
  },
  applyB: d => {
    const dout = delta.createDeltaMap(s.$object({ x: s.$number }))
    d.forEach(op => {
      if (delta.$insertOp.check(op)) {
        dout.set(op.key, Number.parseInt(op.value))
      }
    })
    return dt.transformResult(dout, null)
  }
}))

const mapNumber = dt.transformStatic(delta.$deltaMap(s.$object({ x: s.$string })), dt.transformer({
  $in: delta.$deltaMap(s.$object({ x: s.$string })),
  $out: delta.$deltaMap(s.$object({ x: s.$number })),
  state: () => null,
  applyA: d => {
    const dout = delta.createDeltaMap(s.$object({ x: s.$number }))
    d.forEach(op => {
      if (delta.$insertOp.check(op)) {
        dout.set(op.key, Number.parseInt(op.value))
      }
    })
    return dt.transformResult(null, dout)
  },
  applyB: d => {
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
 * @param {t.TestCase} _tc
 */
export const testBasics = _tc => {
  const $snIn = delta.$deltaMap(s.$object({ x: s.$string }))
  const _mn = mapNumber($snIn).pipe(dt.id).pipe(mapString)
  const _q = dt.id(delta.$deltaMap(s.$object({ a: s.$number }))).pipe(dt.id)
  console.log(_mn, _q)
  dt.transform(delta.$deltaMap(s.$object({ x: s.$string })), $d => mapNumber($d).pipe(mapString))
  // @ts-expect-error
  dt.transform(delta.$deltaMap(s.$object({ x: s.$string })), $d => mapNumber($d).pipe(mapNumber))
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
  const $sa = delta.$deltaMap(s.$object({ x: s.$string }))
  const mappedMapNumber = dt.transform($sa, $d => dt.map({
    mynum: mapNumber($d)
  }))
  const m1 = mappedMapNumber($sa).init()
  const d = delta.createDeltaMap(s.$object({ x: s.$string })).set('x', '42').done()
  const res = m1.applyA(d)
  t.assert(res.a == null)
  const qq = delta.createDeltaMap(s.$object({ x: s.$number })).set('x', 42).done()
  const q = delta.createDeltaMap(s.$object({ mynum: delta.$deltaMap(s.$object({ x: s.$number })) })).modify('mynum', qq).done()
  t.compare(res.b, q)
  // @todo make sure the result is properly typed (not any)
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapQuery = _tc => {
  const $deltaA = delta.$deltaMap(s.$object({ x: s.$string }))
  const $deltaB = delta.$deltaMap(s.$object({ mynum: s.$string }))
  const xxx = dt.map({
    mynum: dt.query('x')($deltaA)
  })
  dt.$transformerTemplate($deltaA, $deltaB).check(xxx)
  const d = delta.createDeltaMap(s.$object({ x: s.$string })).set('x', '42').done()
  const res = xxx.init().applyA(d)
  t.assert(res.a == null)
  const db = delta.createDeltaMap(s.$object({ mynum: s.$string })).set('mynum', '42').done()
  t.compare(res.b, db)
}

export const testMappingTransformer = () => {
  const q = dt.transform(delta.$deltaMap(s.$object({ x: s.$number })), $d => dt.id($d))
  q(delta.$deltaMap(s.$object({ x: s.$number })))
}

export const testQuery = () => {
  const $deltaA = delta.$deltaMap(s.$object({ hi: delta.$deltaMap(s.$object({ there: s.$number })) }))
  const queryHiThere = dt.query('hi', 'there')($deltaA)
  const $deltaB = delta.$deltaValue(s.$number)
  const expectedQuerySchema = dt.$transformerTemplate($deltaA, $deltaB)
  t.assert(expectedQuerySchema.validate(queryHiThere))
}

export const testTransformerCreateUtility = () => {
  const $deltaA = delta.$deltaValue(s.$number)
  const $deltaA2 = delta.$deltaValue(s.$string)
  const idFactory = dt.transform(delta.$delta, $d => {
    const x = dt.id($d)
    const y = x.pipe(dt.id)
    return y
  })
  const idnum = idFactory($deltaA)
  t.assert(dt.$transformerTemplate($deltaA, $deltaA).validate(idnum))
  // @ts-expect-error expect to define output based on input
  t.assert(!dt.$transformerTemplate($deltaA2, $deltaA2).validate(idnum))
}
