import * as t from '../../testing.js'
import * as delta from '../delta.js'
import { id } from './id.js'

// NOTE: LLM-generated, needs review.

export const testIdBasics = () => {
  const it = id.init(delta.$deltaAny)
  // identity maps an a-side change verbatim onto the b side
  const resA = it.applyA(delta.create().setAttr('x', 'v').insert('hi'))
  t.assert(resA.a === null)
  t.compare(resA.b, delta.create().setAttr('x', 'v').insert('hi'))
  // ...and a b-side change verbatim back onto a
  const resB = it.applyB(delta.create().setAttr('x', 'w'))
  t.assert(resB.b === null)
  t.compare(resB.a, delta.create().setAttr('x', 'w'))
  // the identity template is a stateless singleton
  t.assert(id.stateless === true)
}
