import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { attr } from './attr.js'

// NOTE: LLM-generated, needs review.

export const testAttr = () => {
  const $d = delta.$delta({ attrs: { x: s.$string } })
  const it = attr($d, 'x').init()
  // forward: extract attr `x` into a `lib0:value` node's `value` attribute
  const res = it.applyA(delta.create().setAttr('x', 'hello'))
  t.assert(res.a === null)
  t.compare(res.b, delta.create('lib0:value').setAttr('value', 'hello'))
  // backward: maps a `lib0:value` change back (exercises applyB)
  const res2 = it.applyB(delta.create('lib0:value').setAttr('value', 'world'))
  t.assert(res2.b === null)
  t.assert(res2.a != null)
  // config-only (template) form: `.init($d)` builds an equivalent transformer
  const it2 = attr($d, 'x').init()
  t.compare(it2.applyA(delta.create().setAttr('x', 'hi')).b, delta.create('lib0:value').setAttr('value', 'hi'))
}
