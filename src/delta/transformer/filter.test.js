import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { transformerWith } from '../transformer.js'
import { filter } from './filter.js'

export const testFilterBasics = () => {
  const $d3 = delta.$delta({ children: 42, attrs: { a: s.$string } })
  // schema-first: filter($in, $allowed)
  const i3 = filter($d3, delta.$delta({ attrs: { a: [s.$number, s.$string] } })).init()
  t.assert(transformerWith($d3, delta.$delta({ attrs: { a: s.$string } })).validate(i3))
  // template form builds a fresh transformer per init
  const i3b = filter($d3, delta.$delta({ attrs: { a: [s.$number, s.$string] } })).init()
  t.assert(transformerWith($d3, delta.$delta({ attrs: { a: s.$string } })).validate(i3b))
}

export const testFilterApply = () => {
  // only attr `a` is allowed; `b` is filtered out of the transformer's bookkeeping
  const it = filter(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), delta.$delta({ attrs: { a: s.$string } })).init()
  // applyA walks both the kept (a) and dropped (b) branches; applyB passes through
  const resA = it.applyA(delta.create().setAttr('a', 'x').setAttr('b', 'y'))
  t.assert(resA.a === null)
  t.assert(resA.b != null)
  const resB = it.applyB(delta.create().setAttr('a', 'z'))
  t.assert(resB.b === null)
  t.compare(resB.a, delta.create().setAttr('a', 'z'))
}
