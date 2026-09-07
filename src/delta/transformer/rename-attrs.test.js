import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { transformerWith } from '../transformer.js'
import { renameAttrs } from './rename-attrs.js'

export const testRenameAttrsBasics = () => {
  const $d = delta.$delta({ attrs: { a: s.$string, b: s.$string } })
  // schema-first form: builds the transformer directly, output type is concrete
  const i1 = renameAttrs($d, { a: 'b' }).init()
  t.assert(transformerWith($d, delta.$delta({ attrs: { b: s.$string } })).validate(i1))
  // forward: an a-side change renames attr `a` -> `b`
  const res = i1.applyA(delta.setAttr('a', 'x'))
  t.assert(res.a === null)
  t.compare(res.b, delta.setAttr('b', 'x'))
  // the renamed op is a clone rekeyed `a` -> `b`: the key is fingerprinted, so the source op's cached
  // fingerprint must not ride along
  const src = delta.setAttr('a', 'x')
  t.assert(src.fingerprint) // caches the attr op's fingerprint (under key `a`)
  const renamed = i1.applyA(src).b?.attrs.b
  t.assert(renamed)
  t.assert(renamed._fingerprint === null, 'a rekeyed clone starts without a cache')
  t.assert(renamed.fingerprint === delta.setAttr('b', 'x').attrs.b?.fingerprint, 'the renamed op fingerprints under its new key')
  // backward: a b-side change renames attr `b` -> `a`
  const res2 = i1.applyB(delta.setAttr('b', 'y'))
  t.assert(res2.b === null)
  t.compare(res2.a, delta.setAttr('a', 'y'))
  // config-only (template) form: `.init($d)` builds an equivalent transformer
  const i2 = renameAttrs($d, { a: 'b' }).init()
  t.compare(i2.applyA(delta.setAttr('a', 'z')).b, delta.setAttr('b', 'z'))
}
