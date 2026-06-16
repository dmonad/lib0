import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { query } from './query.js'

// NOTE: LLM-generated, needs review.

export const testQueryAttr = () => {
  const q = query('x')
  const it = q.init(delta.$delta({ attrs: { x: s.$string } }))
  t.assert(q.stateless === true)
  // forward: extract attr `x` into a `lib0:value` node's `value` attribute
  const res = it.applyA(delta.create().setAttr('x', 'hello'))
  t.assert(res.a === null)
  t.compare(res.b, delta.create('lib0:value').setAttr('value', 'hello'))
  // backward: maps a `lib0:value` change back (exercises applyB)
  const res2 = it.applyB(delta.create('lib0:value').setAttr('value', 'world'))
  t.assert(res2.b === null)
  t.assert(res2.a != null)
}
