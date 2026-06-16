import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { transformerWith } from '../transformer.js'
import { filter } from './filter.js'

export const testFilterBasics = () => {
  const f = filter(delta.$delta({ attrs: { a: [s.$number, s.$string] } }))
  const $d3 = delta.$delta({ children: 42, attrs: { a: s.$string } })
  const i3 = f.init($d3)
  t.assert(transformerWith($d3, delta.$delta({ attrs: { a: s.$string } })).validate(i3))
  // a filter template is stateful (a fresh transformer per init)
  t.assert(f.stateless === false)
}

export const testFilterApply = () => {
  // only attr `a` is allowed; `b` is filtered out of the transformer's bookkeeping
  const f = filter(delta.$delta({ attrs: { a: s.$string } }))
  const it = f.init(delta.$delta({ attrs: { a: s.$string, b: s.$string } }))
  // applyA walks both the kept (a) and dropped (b) branches; applyB passes through
  const resA = it.applyA(delta.create().setAttr('a', 'x').setAttr('b', 'y'))
  t.assert(resA.a === null)
  t.assert(resA.b != null)
  const resB = it.applyB(delta.create().setAttr('a', 'z'))
  t.assert(resB.b === null)
  t.compare(resB.a, delta.create().setAttr('a', 'z'))
}
