import * as t from 'lib0/testing'
import * as delta from './delta.js'
import * as dt from './transformer.js'
import * as s from 'lib0/schema'

export const testBasics = () => {
  const r1 = dt.rename(/** @type {const} */ ({ a: 'b' }))
  const r2 = dt.rename(/** @type {const} */ ({ b: 'a' }))
  const r3 = dt.filter(delta.$delta({ attrs: { a: [s.$number, s.$string] } }))
  const i1 = r1.init(delta.$delta({ attrs: { a: s.$string, b: s.$string } }))
  t.assert(dt.transformerWith(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), delta.$delta({ attrs: { b: s.$string } })).validate(i1))
  const $d3 = delta.$delta({ children: 42, attrs: { a: s.$string } })
  const r31 = dt.pipe(r3, r1)
  const i3 = r3.init($d3)
  t.assert(dt.transformerWith($d3, delta.$delta({ attrs: { a: s.$string } })).validate(i3))
  const i31 = r31.init($d3)
  t.assert(dt.transformerWith($d3, delta.$delta({ attrs: { b: s.$string } })).validate(i31))
  const p12 = dt.pipe(r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1)
  const $da = delta.$delta(/** @type {const} */ ({
    attrs: {
      a: s.$string
    }
  }))
  const $db = delta.$delta(/** @type {const} */ ({
    attrs: {
      b: s.$string
    }
  }))
  const p12init = p12.init($da)
  t.assert(dt.transformerWith($da, delta.$delta({ attrs: { b: s.$string } })).validate(p12init))
  const ddd = delta.create().setAttr('a', 'dturiane')
  const dtrn = p12init.applyA(ddd)
  t.assert(dt.$tresult($da, $db).validate(dtrn))
  console.log(dtrn)
}

export const testStatic = () => {
  dt.projection('h1', {
    k: dt.projection('h2')
  }, ['hi there ', dt.query('name')])

  dt.projection(null, {
    name: dt.pipe(dt.firstChild('user'), dt.queryAttr('q'))
  }).pipe(dt.projection('h1', {}, ['hi there ', dt.queryAttr('name')]))
}
