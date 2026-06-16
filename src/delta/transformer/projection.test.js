import * as t from '../../testing.js'
import * as delta from '../delta.js'
import { projection } from './projection.js'
import { QueryAttrTransformer } from './query.js'

// NOTE: LLM-generated, needs review.

export const testProjectionFixed = () => {
  // fixed attrs + fixed children: projects onto a constant node shape
  const p = projection('h1', { bold: 'true' }, ['hi'])
  const res = p.applyA(delta.create())
  t.assert(res.a === null)
  t.assert(res.b != null)
  t.assert(res.b?.name === 'h1', 'projects onto an h1 node')
}

export const testProjectionDynamic = () => {
  // a dynamic attr backed by a transformer: project attr `x` into output attr `title`
  const p = projection('h1', { title: new QueryAttrTransformer('x') }, [])
  const res = p.applyA(/** @type {any} */ (delta.create().setAttr('x', 'hello')))
  t.assert(res.a === null)
  const b = /** @type {any} */ (res.b)
  t.assert(b?.name === 'h1')
  t.compare(b?.attrs.title?.value, 'hello', 'dynamic attr filled from the queried value')
}
