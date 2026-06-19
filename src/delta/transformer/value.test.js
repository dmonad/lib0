import * as t from '../../testing.js'
import * as delta from '../delta.js'
import { unwrapValue } from './value.js'

const valueNode = (/** @type {any} */ v) => delta.create('lib0:value').setAttr('value', v)

export const testUnwrapValueForward = () => {
  const it = unwrapValue.init(delta.$deltaAny)
  // a lib0:value child becomes a one-position embed of its scalar
  const res = it.applyA(delta.create('p').insert([valueNode('hi')]))
  t.assert(res.a === null)
  t.compare(res.b, delta.create('p').insert(['hi']))
}

export const testUnwrapValueMixed = () => {
  const it = unwrapValue.init(delta.$deltaAny)
  // static text + a carrier + a pass-through node: only the carrier is unwrapped
  const res = it.applyA(delta.create('p').insert('a').insert([valueNode(42)]).insert([delta.create('b')]))
  t.compare(res.b, delta.create('p').insert('a').insert([42]).insert([delta.create('b')]))
}

export const testUnwrapValueUpdate = () => {
  const it = unwrapValue.init(delta.$deltaAny)
  it.applyA(delta.create('p').insert([valueNode('hi')])) // builds the carrier map
  // a data update arrives as a modify on the carrier setting its `value` attr
  const res = it.applyA(delta.create().modify(delta.create().setAttr('value', 'bye')))
  t.assert(res.a === null)
  t.compare(res.b, delta.create().delete(1).insert(['bye']))
}

export const testUnwrapValueAttrs = () => {
  const it = unwrapValue.init(delta.$deltaAny)
  // node attributes pass through untouched; only the lib0:value child is unwrapped
  const res = it.applyA(delta.create('p').setAttr('id', 'x').insert([valueNode('hi')]))
  t.compare(res.b, delta.create('p').setAttr('id', 'x').insert(['hi']))
}

export const testUnwrapValueReverseInsert = () => {
  const it = unwrapValue.init(delta.$deltaAny)
  it.applyA(delta.create('p').insert([valueNode('hi')])) // carrier at position 0
  // reverse: a view inserts a literal embed after the carrier - passes through untouched
  const res = it.applyB(delta.create().retain(1).insert([42]))
  t.assert(res.b === null)
  t.compare(res.a, delta.create().retain(1).insert([42]))
}

export const testUnwrapValueReverse = () => {
  const it = unwrapValue.init(delta.$deltaAny)
  it.applyA(delta.create('p').insert([valueNode('hi')])) // carrier at position 0
  // reverse: deleting the embed maps structurally to deleting the carrier node
  const res = it.applyB(delta.create().delete(1))
  t.assert(res.b === null)
  t.compare(res.a, delta.create().delete(1))
}
