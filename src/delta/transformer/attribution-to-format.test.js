import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { attributionToFormat } from './attribution-to-format.js'

/**
 * A representative config: content provenance renders to small display objects, attribute provenance
 * to the originating user id. Each handler returns `null` when its dimension is absent/cleared.
 *
 * @type {import('./attribution-to-format.js').Conf}
 */
const conf = {
  insert: a => a.insert ? { by: a.insert[0], at: a.insertAt } : null,
  delete: a => a.delete ? { by: a.delete[0] } : null,
  format: a => a.format ?? null,
  attrs: a => (a.insert?.[0] ?? a.delete?.[0]) ?? null
}

/**
 * A content insert's `attribution` becomes a `y-attributed-insert` format value (the handler's
 * shape), the real `bold` format is preserved, and the op carries no attribution afterwards.
 */
export const testAttributionToFormatInsert = () => {
  const $d = delta.$delta({ text: true })
  const it = attributionToFormat($d, conf).init()
  const res = it.applyA(delta.create().insert('hi', { bold: true }, { insert: ['alice'], insertAt: 1 }))
  t.assert(res.a === null)
  t.compare(res.b, delta.create().insert('hi', { bold: true, 'y-attributed-insert': { by: 'alice', at: 1 } }))
}

/**
 * A handler returning `{}` skips (no key); on an *instruction* op a `null` result clears the key
 * (`{ 'y-attributed-insert': null }`); on a *data* op a `null` result is just "nothing to render".
 */
export const testAttributionToFormatSkipAndClear = () => {
  const $d = delta.$delta({ text: true })
  const skip = attributionToFormat($d, { insert: () => ({}) }).init()
  // data op + skip ⇒ no format at all
  t.compare(skip.applyA(delta.create().insert('x', null, { insert: ['a'] })).b, delta.create().insert('x'))
  // data op + null result ⇒ still no `{k:null}` leaf on the insert (data stores resolved formats)
  const clearer = attributionToFormat($d, { insert: () => null }).init()
  t.compare(clearer.applyA(delta.create().insert('x', null, { insert: ['a'] })).b, delta.create().insert('x'))
  // instruction op + null result ⇒ clear the key (a per-key `{insert:null}` removal isn't in the
  // canonical `Attribution` type, so cast it — see the test-any-casts convention)
  t.compare(clearer.applyA(delta.create().retain(2, undefined, /** @type {any} */ ({ insert: null }))).b, delta.create().retain(2, { 'y-attributed-insert': null }))
}

/** `delete*` and `format*` provenance route to their own namespaced keys; differing ops stay split. */
export const testAttributionToFormatDeleteAndFormat = () => {
  const $d = delta.$delta({ text: true })
  const it = attributionToFormat($d, conf).init()
  const res = it.applyA(delta.create()
    .retain(1, undefined, { delete: ['bob'], deleteAt: 3 })
    .retain(1, undefined, { format: { bold: ['carol'] }, formatAt: 0 }))
  t.compare(res.b, delta.create()
    .retain(1, { 'y-attributed-delete': { by: 'bob' } })
    .retain(1, { 'y-attributed-format': { bold: ['carol'] } }))
}

/** A modified child's attr-attribution is lifted onto the parent `modify` op as `y-attributed-attrs`. */
export const testAttributionToFormatModifyAttr = () => {
  const $p = delta.$delta('p', { attrs: { style: s.$string }, text: true })
  const $d = delta.$delta({ name: s.$literal('doc'), children: $p })
  const it = attributionToFormat($d, conf).init()
  const res = it.applyA(delta.create().modify(delta.create().setAttr('style', 'x', { insert: ['alice'] })))
  t.compare(res.b, delta.create().modify(delta.create().setAttr('style', 'x'), { 'y-attributed-attrs': { style: 'alice' } }))
}

/** Two inserted nodes with different attr-attributions split into one insert op each. */
export const testAttributionToFormatInsertAttrSplit = () => {
  const $p = delta.$delta('p', { attrs: { style: s.$string } })
  const $d = delta.$delta({ name: s.$literal('doc'), children: $p })
  const it = attributionToFormat($d, conf).init()
  const res = it.applyA(delta.create().insert([
    delta.create('p').setAttr('style', 'a', { insert: ['alice'] }),
    delta.create('p').setAttr('style', 'b', { insert: ['bob'] })
  ]))
  t.compare(res.b, delta.create()
    .insert([delta.create('p').setAttr('style', 'a')], { 'y-attributed-attrs': { style: 'alice' } })
    .insert([delta.create('p').setAttr('style', 'b')], { 'y-attributed-attrs': { style: 'bob' } }))
}

/** A grandchild's attr-attribution is lifted onto its own parent — the whole tree in one pass. */
export const testAttributionToFormatNested = () => {
  const $p = delta.$delta('p', { attrs: { style: s.$string } })
  const $div = delta.$delta('div', { children: $p })
  const $d = delta.$delta({ name: s.$literal('doc'), children: $div })
  const it = attributionToFormat($d, conf).init()
  // multi-level nested builder inference unions the child node names (`div | p`) and won't unify with
  // the precise schema; the runtime delta is valid — cast the input (a known type-system gap)
  const res = it.applyA(/** @type {any} */ (delta.create().insert([
    delta.create('div').insert([delta.create('p').setAttr('style', 'x', { insert: ['alice'] })])
  ])))
  t.compare(res.b, delta.create().insert([
    delta.create('div').insert([delta.create('p').setAttr('style', 'x')], { 'y-attributed-attrs': { style: 'alice' } })
  ]))
}

/**
 * A node's OWN attr-attribution (here a delta-valued `modifyAttr` at the root) has no parent op to
 * lift to, so it is dropped; the attr op passes through without attribution, and the delta-valued
 * attr's inner content is not recursed into (out of scope).
 */
export const testAttributionToFormatRootAttrDropped = () => {
  const $body = delta.$delta({ text: true })
  const $d = delta.$delta({ attrs: { body: $body } })
  const it = attributionToFormat($d, conf).init()
  const res = it.applyA(delta.create($d).modifyAttr('body', delta.create().insert('hi'), { insert: ['alice'] }))
  t.compare(res.b, delta.create().modifyAttr('body', delta.create().insert('hi')))
}

/** Reverse strips every `y-attributed-*` key (content + the `y-attributed-attrs` lift), keeping the rest. */
export const testAttributionToFormatReverse = () => {
  const $d = delta.$delta({ text: true })
  const it = attributionToFormat($d, conf).init()
  const res = it.applyB(delta.create().retain(2, { bold: true, 'y-attributed-insert': { by: 'alice' } }))
  t.assert(res.b === null)
  t.compare(res.a, delta.create().retain(2, { bold: true }))

  const $p = delta.$delta('p', { attrs: { style: s.$string } })
  const $doc = delta.$delta({ name: s.$literal('doc'), children: $p })
  const it2 = attributionToFormat($doc, conf).init()
  const res2 = it2.applyB(delta.create().modify(delta.create().setAttr('style', 'x'), { 'y-attributed-attrs': { style: 'alice' } }))
  t.compare(res2.a, delta.create().modify(delta.create().setAttr('style', 'x')))
}

/**
 * @param {delta.DeltaAny} d
 */
const assertNoAttribution = d => {
  for (const op of d.attrs) t.assert(op.attribution == null)
  for (const op of d.children) {
    if (delta.$insertOp.check(op)) {
      t.assert(op.attribution == null)
      for (const el of op.insert) if (delta.$deltaAny.check(el)) assertNoAttribution(el)
    } else if (delta.$textOp.check(op) || delta.$retainOp.check(op)) {
      t.assert(op.attribution == null)
    } else if (delta.$modifyOp.check(op)) {
      t.assert(op.attribution == null)
      assertNoAttribution(op.value)
    }
  }
}

/**
 * @param {delta.DeltaAny} d
 */
const assertNoYFormat = d => {
  for (const op of d.children) {
    const fmt = /** @type {{[k:string]:any}|null|undefined} */ (/** @type {any} */ (op).format)
    if (fmt != null) for (const k in fmt) t.assert(!k.startsWith('y-attributed-'))
    if (delta.$insertOp.check(op)) {
      for (const el of op.insert) if (delta.$deltaAny.check(el)) assertNoYFormat(el)
    } else if (delta.$modifyOp.check(op)) {
      assertNoYFormat(op.value)
    }
  }
}

/**
 * Fuzz: forward output of a random attributed delta (and of a random change over it) carries no
 * `attribution` anywhere, preserves content length, and reverse strips every `y-attributed-*` format.
 *
 * @param {t.TestCase} tc
 */
export const testRepeatAttributionToFormatRoundtrip = tc => {
  // a child node carrying its own attrs exercises the attr-lift onto the parent op; content/format
  // provenance exercises the namespaced content keys (mirrors the repo's $richXmlDelta fuzz schema)
  const $leaf = delta.$delta({ name: ['span', 'em'], text: true, attrs: { c: s.$string }, formats: { italic: s.$boolean.optional } })
  const $d = delta.$delta({ name: ['div', 'p'], text: true, attrs: { a: s.$string, b: s.$number }, formats: { bold: s.$boolean.optional }, children: s.$union(s.$number, s.$string, $leaf) })
  const it = attributionToFormat($d, conf).init()
  // typing a random/transformed delta through a precise recursive schema is a known type-system gap;
  // cast at the apply boundary (the runtime values are ordinary deltas)
  const fwd = /** @param {any} d @return {delta.DeltaAny} */ d => /** @type {any} */ (it.applyA(d).b)
  const rev = /** @param {any} d @return {delta.DeltaAny} */ d => /** @type {any} */ (it.applyB(d).a)

  const start = delta.random(tc.prng, $d, { attribution: true }).done()
  const fwdStart = fwd(start)
  assertNoAttribution(fwdStart)
  t.assert(fwdStart.childCnt === start.childCnt) // structure-preserving
  assertNoYFormat(rev(fwdStart))

  // a source-based change exercises retain / modify / delete / attribution-update ops
  const change = delta.random(tc.prng, $d, { source: start, attribution: true })
  const fwdChange = fwd(change)
  assertNoAttribution(fwdChange)
  assertNoYFormat(rev(fwdChange))
}
