/**
 * Consumer-facing type-check fixture, run by `npm run dist` through tsconfig.dist-check.json
 * AGAINST THE EMITTED `dist/*.d.ts` (`lib0/*` resolves through `exports` in package.json).
 * `npm run lint` checks the JS+JSDoc source, and some type-level costs only exist in the
 * declaration files: a
 * conditional type inferring from a class (`V extends Delta<infer C>`) is matched structurally
 * there and can recurse through `DeltaConfGetChildren`'s recursive branch to TypeScript's
 * instantiation-depth limit (TS2589). The nested condensed builders below tripped that in
 * y-prosemirror and yjs while lib0's source checked fine (see `_SanifyDelta` in
 * src/delta/delta.js); a regression fails `npm run dist`.
 */
import * as delta from 'lib0/delta'

/**
 * A root builder inserting a named node whose children are named nodes.
 *
 * @param {string} text
 */
export const rootInsertNestedNamed = (text) =>
  delta.create().insert([
    delta.create('container', {}, [
      delta.create('paragraph', {}, text)
    ])
  ]).done()

const inner = delta.create('container', {}, [delta.create('paragraph', {}, 'x')])
export const viaVariable = delta.create().insert([inner]).done()

export const chainedInserts = delta.create().insert([
  delta.create('container', {}).insert([delta.create('paragraph', {}).insert('x')])
]).done()

export const modifyWithInsert = delta.create().modify(
  delta.create().retain(1).insert([delta.create('paragraph', {}, 'x')])
).done()

// The condensed conf keeps the nesting exact: the grandchild conf must not leak into the child
// union (the structural inference did that on top of being too deep).
const nested = delta.create('p', {}, [delta.create('q', {}, [delta.create('r', {}, 'x')])])
/**
 * @typedef {import('lib0/ts').Assert<import('lib0/ts').Equal<typeof nested, delta.DeltaBuilder<{ name: 'p', attrs: {}, children: delta.Delta<{ name: 'q', attrs: {}, children: delta.Delta<{ name: 'r', attrs: {}, text: true }> }> }>>>} _CheckNestedConfExact
 */
export const nestedChildCnt = nested.done().childCnt

// A generic referenced without type arguments in JSDoc (`Delta` rather than `Delta<any>`) means
// `Delta<any>` to the source check, but is emitted verbatim and means `Delta<{}>` (the declared
// default) in the declaration files. `DeltaData`'s `attrs`/`children` had such references, which
// made the cases below fail with TS2589 / TS2345 against dist only.
const $recursive = delta.$delta({ text: true, recursiveChildren: true, attrs: { meta: delta.$deltaAny } })
export const recursiveFixedConf = delta.create($recursive)
  .setAttr('meta', delta.insert('m'))
  .insert([delta.create('p', null, 'keep'), delta.create('span').insert('new', { bold: true })])
  .done()

export const equalsShorthand = delta.create().insert('hello').equals(delta.insert('hello!'))

const attrDoc = delta.setAttr('body', delta.insert('x')).done()
const attrChange = delta.modifyAttr('body', delta.create(), { insertAt: 5 }).done()
export const applyModifyAttr = delta.clone(attrDoc).apply(attrChange)

const nestedChild = delta.create().insert([delta.create('p')])
/**
 * @typedef {import('lib0/ts').Assert<import('lib0/ts').Equal<typeof nestedChild, delta.DeltaBuilder<{ children: delta.Delta<{ name: 'p' }> }>>>} _CheckNestedChildConf
 */

// `from` takes any number of children - string and array children can be mixed. Its rest
// parameter was emitted as `Array<Children>[]` while the source check read it as `Children[]`.
const fromArr = delta.from(['a', 'b'])
const fromMixed = delta.from('div', { x: 1 }, 'text', [1, 2])
const fromName = delta.from('div')
/**
 * @typedef {import('lib0/ts').Assert<import('lib0/ts').Equal<typeof fromArr, delta.DeltaBuilder<{ children: string }>>>} _CheckFromArr
 * @typedef {import('lib0/ts').Assert<import('lib0/ts').Equal<typeof fromMixed, delta.DeltaBuilder<{ name: 'div', attrs: { x: number }, children: number, text: true }>>>} _CheckFromMixed
 * @typedef {import('lib0/ts').Assert<import('lib0/ts').Equal<typeof fromName, delta.DeltaBuilder<{ name: 'div' }>>>} _CheckFromName
 */
export const fromChildCnt = fromArr.childCnt + fromMixed.childCnt + fromName.childCnt + nestedChild.childCnt
