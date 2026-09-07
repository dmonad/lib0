/**
 * Consumer-facing type-check fixture, run by `npm run dist` through tsconfig.dist-check.json
 * AGAINST THE EMITTED `dist/*.d.ts` (its `paths` map `lib0/*` to dist). `npm run lint` checks
 * the JS+JSDoc source, and some type-level costs only exist in the declaration files: a
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
