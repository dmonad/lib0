import * as t from '../testing.js'
import * as Λ from './transformer.js'
import * as Δ from './index.js'
import * as $ from '../schema.js'
import * as binding from './binding.js'
import * as env from '../environment.js'
import * as dom from '../dom.js'

const mapString = Λ.transformStatic(Δ.$map($.$object({ x: $.$number })), Λ.template({
  $in: Δ.$map($.$object({ x: $.$number })),
  $out: Δ.$map($.$object({ x: $.$string })),
  state: () => null,
  applyA: d => {
    const dout = Δ.map($.$object({ x: $.$string }))
    d.forEach(op => {
      if (Δ.$insertOp.check(op)) {
        dout.set(op.key, op.value + '')
      }
    })
    return Λ.transformResult(null, dout)
  },
  applyB: d => {
    const dout = Δ.map($.$object({ x: $.$number }))
    d.forEach(op => {
      if (Δ.$insertOp.check(op)) {
        dout.set(op.key, Number.parseInt(op.value))
      }
    })
    return Λ.transformResult(dout, null)
  }
}))

const mapNumber = Λ.transformStatic(Δ.$map($.$object({ x: $.$string })), Λ.template({
  $in: Δ.$map($.$object({ x: $.$string })),
  $out: Δ.$map($.$object({ x: $.$number })),
  state: () => null,
  applyA: d => {
    const dout = Δ.map($.$object({ x: $.$number }))
    d.forEach(op => {
      if (Δ.$insertOp.check(op)) {
        dout.set(op.key, Number.parseInt(op.value))
      }
    })
    return Λ.transformResult(null, dout)
  },
  applyB: d => {
    const dout = Δ.map($.$object({ x: $.$string }))
    d.forEach(op => {
      if (Δ.$insertOp.check(op)) {
        dout.set(op.key, op.value + '')
      }
    })
    return Λ.transformResult(dout, null)
  }
}))

/**
 * @param {t.TestCase} _tc
 */
export const testBasics = _tc => {
  const $snIn = Δ.$map($.$object({ x: $.$string }))
  const _mn = mapNumber($snIn).pipe(Λ.id).pipe(mapString)
  const _q = Λ.id(Δ.$map($.$object({ a: $.$number }))).pipe(Λ.id)
  console.log(_mn, _q)
  Λ.transform(Δ.$map($.$object({ x: $.$string })), $d => mapNumber($d).pipe(mapString))
  // @ts-expect-error
  Λ.transform(Δ.$map($.$object({ x: $.$string })), $d => mapNumber($d).pipe(mapNumber))
  const q = mapNumber($snIn).pipe(mapString).init()
  {
    const d1 = Δ.map($.$object({ x: $.$string }))
    const d1_ = q.applyA(d1).b
    t.compare(d1, d1_)
  }
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapBasics = _tc => {
  const $sa = Δ.$map($.$object({ x: $.$string }))
  const mappedMapNumber = Λ.transform($sa, $d => Λ.map({
    mynum: mapNumber($d)
  }))
  const m1 = mappedMapNumber($sa).init()
  const d = Δ.map($.$object({ x: $.$string })).set('x', '42').done()
  const res = m1.applyA(d)
  t.assert(res.a == null)
  const qq = Δ.map($.$object({ x: $.$number })).set('x', 42).done()
  const q = Δ.map($.$object({ mynum: Δ.$map($.$object({ x: $.$number })) })).set('mynum', qq).done()
  t.compare(res.b, q)
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapQuery = _tc => {
  const $deltaA = Δ.$map($.$object({ x: $.$string }))
  const $deltaB = Δ.$map($.$object({ mynum: $.$string }))
  const xxx = Λ.map({
    mynum: Λ.query('x')($deltaA)
  })
  Λ.$template($deltaA, $deltaB).check(xxx)
  const d = Δ.map($.$object({ x: $.$string })).set('x', '42').done()
  const res = xxx.init().applyA(d)
  t.assert(res.a == null)
  const db = Δ.map($.$object({ mynum: $.$string })).set('mynum', '42').done()
  t.compare(res.b, db)
}

export const testMappingTransformer = () => {
  const q = Λ.transform(Δ.$map($.$object({ x: $.$number })), $d => Λ.id($d))
  q(Δ.$map($.$object({ x: $.$number })))
}

export const testQuery = () => {
  const $deltaA = Δ.$map($.$object({ hi: Δ.$map($.$object({ there: $.$number })) }))
  const queryHiThere = Λ.query('hi', 'there')($deltaA)
  const $deltaB = Δ.$value($.$number)
  const expectedQuerySchema = Λ.$template($deltaA, $deltaB)
  expectedQuerySchema.validate(queryHiThere)
}

export const testTransformerCreateUtility = () => {
  const $deltaA = Δ.$value($.$number)
  const $deltaA2 = Δ.$value($.$string)
  const idFactory = Λ.transform(Δ.$delta, $d => {
    const x = Λ.id($d)
    const y = x.pipe(Λ.id)
    return y
  })
  const idnum = idFactory($deltaA)
  Λ.$template($deltaA, $deltaA).validate(idnum)
  // @ts-expect-error expect to define output based on input
  Λ.$template($deltaA2, $deltaA2).validate(idnum)
}

export const testStaticContent = () => {
  t.group('fixed method', () => {
    const x = Λ.transform(Δ.$delta, $d =>
      Λ.map({
        myProp: Λ.fixed('hi')
      })
    )
    const res = x(Δ.$delta).init().applyA(Δ.value().set(42).done())
    const expectedResult = Δ.map($.$object({ myProp: $.$string })).set('myProp', 'hi').done()
    t.compare(res.b, expectedResult)
  })
  t.group('implicitly fixed primitive', () => {
    const x = Λ.transform(Δ.$delta, $d =>
      Λ.map({
        myProp: 'hi'
      })
    )
    const res = x(Δ.$delta).init().applyA(Δ.value().set(42).done())
    const expectedResult = Δ.map($.$object({ myProp: $.$string })).set('myProp', 'hi').done()
    t.compare(res.b, expectedResult)
  })
  t.group('implicitly fixed delta', () => {
    const x = Λ.transform(Δ.$delta, $d =>
      Λ.map({
        myProp: Δ.array($.$number).insert([7]).done()
      })
    )
    const res = x(Δ.$delta).init().applyA(Δ.value().set(42).done())
    const darr = Δ.array($.$number).insert([7]).done()
    const expectedResult = Δ.map($.$object({ myProp: Δ.$array($.$number) })).set('myProp', darr).done()
    t.compare(res.b, expectedResult)
  })
}

export const testFixedArray = () => {
  const x = Λ.array([42])
  const b = x.init().applyA(Δ.value($.$any).set(7).done()).b
  const expectedB = Δ.array($.$number).insert([42]).done()
  t.compare(b, expectedB)
}

export const testNode = () => {
  const x = Λ.node('h1', { bold: true }, ['hello world'])
  const b = x.init().applyA(Δ.value().set(7).done()).b
  const expectedChildren = Δ.array($.$string).insert(['hello world'])
  const expectedB = Δ.node('h1', Δ.map($.$object({ bold: $.$boolean })).set('bold', true), expectedChildren).done()
  t.compare(b, expectedB)
}

export const testNodeTransformer = () => {
  const $aschema = Δ.$map($.$object({ qq: $.$number, qp: $.$string }))
  const y = Λ.transform($aschema, $d => Λ.node('h1', { bold: true, eventClicked: Λ.map({ x: Λ.query('qq')($d) }) }, ['hello world']))
  const yD = y($aschema)
  const z = Λ.transformStatic($aschema, Λ.node('h1', { bold: true, eventClicked: Λ.map({ x: Λ.query('qq')($aschema) }) }, ['hello world', Λ.query('qp')($aschema)]))
  const zD = z($aschema)
  const initA = Δ.map($.$object({ qq: $.$number, qp: $.$string })).set('qq', 42).set('qp', 'hi')
  const yDB = yD.init().applyA(initA).b
  const zDB = zD.init().applyA(initA).b
  const expected = Δ.map(yDB?.attributes.$vals).setMany({ bold: true, eventClicked: Δ.map($.$object({ x: $.$number })).set('x', 42) }).done()
  t.compare(expected, yDB?.attributes)
  t.compare(expected, zDB?.attributes)
}

export const testBinding = () => {
  if (!env.isBrowser) t.skip()
  const el = dom.element('div')
  const domEM = binding.domEventEmitter(el)
  const domEM2 = binding.domEventEmitter(el)
  const template = Λ.node('div', { height: '42' }, [])
  const b = binding.bind({ template, state: null, a: domEM2, b: domEM })
  b.applyA(Δ.node('test').done())
  console.log(b)
  console.log('dom html content:', domEM.observedNode.outerHTML)
}
