import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { unwrapValue } from './value.js'

/**
 * @template V
 * @param {V} v
 */
const valueNode = v => delta.create('lib0:value', { value: v })

export const testUnwrapValueForward = () => {
  const it = unwrapValue(delta.$delta('p', { children: delta.$delta('lib0:value', { attrs: { value: s.$string } }) })).init()
  // a lib0:value child becomes a one-position embed of its scalar
  const res = it.applyA(delta.create('p', null, [valueNode('hi')]))
  t.assert(res.a === null)
  t.compare(res.b, delta.create('p', null, ['hi']))
}

export const testUnwrapValueMixed = () => {
  const it = unwrapValue(delta.$delta('p', { text: true, children: [delta.$delta('lib0:value', { attrs: { value: s.$number } }), delta.$delta('b')] })).init()
  // static text + a carrier + a pass-through node: only the carrier is unwrapped
  const res = it.applyA(delta.create('p').insert('a').insert([valueNode(42)]).insert([delta.create('b')]))
  t.compare(res.b, delta.create('p').insert('a').insert([42]).insert([delta.create('b')]))
}

export const testUnwrapValueUpdate = () => {
  const it = unwrapValue(delta.$delta('p', { children: delta.$delta('lib0:value', { attrs: { value: s.$string } }) })).init()
  it.applyA(delta.create('p', null, [valueNode('hi')])) // builds the carrier map
  // a data update arrives as a modify on the carrier setting its `value` attr
  const res = it.applyA(delta.modify(delta.setAttr('value', 'bye')))
  t.assert(res.a === null)
  t.compare(res.b, delta.delete_(1).insert(['bye']))
}

export const testUnwrapValueAttrs = () => {
  const it = unwrapValue(delta.$delta('p', { attrs: { id: s.$string }, children: delta.$delta('lib0:value', { attrs: { value: s.$string } }) })).init()
  // node attributes pass through untouched; only the lib0:value child is unwrapped
  const res = it.applyA(delta.create('p', { id: 'x' }, [valueNode('hi')]))
  t.compare(res.b, delta.create('p', { id: 'x' }, ['hi']))
}

export const testUnwrapValueReverseInsert = () => {
  const it = unwrapValue(delta.$delta('p', { children: delta.$delta('lib0:value', { attrs: { value: s.$union(s.$string, s.$number) } }) })).init()
  it.applyA(delta.create('p', null, [valueNode('hi')])) // carrier at position 0
  // reverse: a view inserts a literal embed after the carrier - passes through untouched
  const res = it.applyB(delta.retain(1).insert([42]))
  t.assert(res.b === null)
  // TYPE-SYSTEM GAP (reported, not suppressed): res.a is typed DeltaBuilder<IN> (a 'p' document with
  // lib0:value children), but the reverse pass-through is a *change over IN* inserting a literal `42`
  // embed (conf {children:number}) - a content type IN's document schema doesn't list. t.compare's
  // single type param can't unify the precise res.a with this differently-shaped expected.
  t.compare(res.a, /** @type {any} */ (delta.retain(1).insert([42])))
}

export const testUnwrapValueReverse = () => {
  const it = unwrapValue(delta.$delta('p', { children: delta.$delta('lib0:value', { attrs: { value: s.$string } }) })).init()
  it.applyA(delta.create('p', null, [valueNode('hi')])) // carrier at position 0
  // reverse: deleting the embed maps structurally to deleting the carrier node
  const res = it.applyB(delta.delete_(1))
  t.assert(res.b === null)
  t.compare(res.a, delta.delete_(1))
}
