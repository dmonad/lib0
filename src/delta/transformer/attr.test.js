import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { attr } from './attr.js'

// NOTE: LLM-generated, needs review.

export const testAttr = () => {
  const $d = delta.$delta({ attrs: { x: s.$string } })
  const it = attr($d, 'x').init()
  // forward: extract attr `x` into a `lib0:value` node's `value` attribute
  const res = it.applyA(delta.setAttr('x', 'hello'))
  t.assert(res.a === null)
  t.compare(res.b, delta.create('lib0:value', { value: 'hello' }))
  // the projected op is a clone rekeyed `x` -> `value`: the key is fingerprinted, so the source op's
  // cached fingerprint must not ride along
  const src = delta.setAttr('x', 'hello')
  t.assert(src.fingerprint) // caches the attr op's fingerprint (under key `x`)
  const projected = it.applyA(src).b?.attrs.value
  t.assert(projected)
  t.assert(projected._fingerprint === null, 'a rekeyed clone starts without a cache')
  t.assert(projected.fingerprint === delta.setAttr('value', 'hello').attrs.value?.fingerprint, 'the projected op fingerprints under its new key')
  // backward: maps a `lib0:value` change back (exercises applyB)
  const res2 = it.applyB(delta.create('lib0:value', { value: 'world' }))
  t.assert(res2.b === null)
  t.assert(res2.a != null)
  // config-only (template) form: `.init($d)` builds an equivalent transformer
  const it2 = attr($d, 'x').init()
  t.compare(it2.applyA(delta.setAttr('x', 'hi')).b, delta.create('lib0:value', { value: 'hi' }))
}
