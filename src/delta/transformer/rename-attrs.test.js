import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { transformerWith } from '../transformer.js'
import { renameAttrs } from './rename-attrs.js'

export const testRenameAttrsBasics = () => {
  const r1 = renameAttrs(/** @type {const} */ ({ a: 'b' }))
  const i1 = r1.init(delta.$delta({ attrs: { a: s.$string, b: s.$string } }))
  t.assert(transformerWith(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), delta.$delta({ attrs: { b: s.$string } })).validate(i1))
  // forward: an a-side change renames attr `a` -> `b`
  const res = i1.applyA(delta.create().setAttr('a', 'x'))
  t.assert(res.a === null)
  t.compare(res.b, delta.create().setAttr('b', 'x'))
  // backward: a b-side change renames attr `b` -> `a`
  const res2 = i1.applyB(delta.create().setAttr('b', 'y'))
  t.assert(res2.b === null)
  t.compare(res2.a, delta.create().setAttr('a', 'y'))
  // a stateless template
  t.assert(r1.stateless === true)
}
