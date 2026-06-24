/**
 * # Positions in a delta tree
 *
 * A {@link Pos} is a resolution-independent location in a *final* (insert-only) {@link
 * import('./delta.js').Delta delta} tree — a cursor between two characters, a point inside a nested
 * node, or a reference to an attribute value. It is the value an editor stores for a caret/selection
 * and the thing a transformer maps from one bound RDT to the other (see `./transformer/`).
 *
 * A position is a `path` of steps plus an association (gravity):
 * - a **string** step descends into the attribute with that key,
 * - a **number** step is a *content* index (each character and each array element counts as 1,
 *   matching {@link import('./delta.js').Delta}'s `childCnt`): a non-terminal number descends into
 *   the child node at that slot, and the **trailing** number is the terminal cursor *gap*.
 *
 * ```
 * [5]        cursor gap at offset 5 in the root
 * ['a', 1]   inside attribute 'a', cursor gap at offset 1
 * [1, 5]     descend into the child node at slot 1, cursor gap at offset 5 inside it
 * ['a']      the value of attribute 'a' (attribute leaf; no offset)
 * []         the root node itself
 * ```
 *
 * Numbers are always read as child indices. A *number-keyed attribute* therefore has no unambiguous
 * position: {@link marksToPositions} still emits a mark inside one, but its numeric attribute step is
 * indistinguishable from a content index, so such a {@link Pos} mis-resolves and must not be round-
 * tripped through {@link import('./delta.js').DeltaBuilder#addMark}. Use string attribute keys for any
 * node that may carry marks (numeric attribute keys are not used in practice).
 *
 * @module delta/position
 */

import * as s from '../schema.js'
import * as fun from '../function.js'
import * as delta from './delta.js'

/**
 * A single step of a {@link Pos} path: a `string` attribute key, or a `number` content index.
 *
 * @typedef {string|number} PosStep
 */

/**
 * A location in a delta tree. `path` descends from the node the position is relative to and ends in
 * the terminal (a trailing-number cursor gap, or a trailing-string attribute leaf). `assoc` is the
 * gravity at a boundary: `-1` binds to the preceding content, `1` to the following content. `attrs` is
 * optional immutable user data carried with the position (e.g. an RDT's clientID/user metadata); it is
 * stored on the {@link import('./delta.js').createMark mark} when the position is written with
 * {@link import('./delta.js').DeltaBuilder#addMark} and read back by {@link marksToPositions}.
 *
 * @typedef {{ path: Array<PosStep>, assoc: -1|1, attrs?: object|null }} Pos
 */

/**
 * A {@link Pos} tagged with the unique id of a stored {@link import('./delta.js').createMark mark} —
 * what {@link marksToPositions} returns (its `attrs` is the mark's stored metadata). Add marks with
 * {@link import('./delta.js').DeltaBuilder#addMark}.
 *
 * @typedef {{ id: string } & Pos} MarkPos
 */

/**
 * Schema for a {@link Pos}.
 *
 * @type {s.Schema<Pos>}
 */
export const $pos = /* @__PURE__ */ s.$object({
  path: s.$array(s.$union(s.$string, s.$number)),
  assoc: s.$literal(-1, 1),
  attrs: s.$any.optional
})

/**
 * Create a {@link Pos} from a path, an (optional) association (gravity, default right `1`), and
 * (optional) immutable `attrs` carried with the mark. `attrs` is omitted from the result when `null`,
 * so a plain cursor position stays `{ path, assoc }`.
 *
 * @param {Array<PosStep>} path
 * @param {-1|1} [assoc]
 * @param {object?} [attrs]
 * @return {Pos}
 */
export const create = (path, assoc = 1, attrs = null) => attrs === null ? { path, assoc } : { path, assoc, attrs }

/**
 * Structural equality of two positions: same `assoc`, `id` (a plain {@link Pos} has none ⇒ both
 * `undefined`), `attrs` (deep), and `path`.
 *
 * @param {Pos|MarkPos} a
 * @param {Pos|MarkPos} b
 * @return {boolean}
 */
export const equals = (a, b) => a.assoc === b.assoc && /** @type {any} */ (a).id === /** @type {any} */ (b).id && fun.equalityDeep(a.attrs ?? null, b.attrs ?? null) && a.path.length === b.path.length && a.path.every((step, i) => step === b.path[i])

/**
 * Schema for a {@link MarkPos}.
 *
 * @type {s.Schema<MarkPos>}
 */
export const $markPos = /* @__PURE__ */ s.$object({
  id: s.$string,
  path: s.$array(s.$union(s.$string, s.$number)),
  assoc: s.$literal(-1, 1),
  attrs: s.$any.optional
})

/**
 * Reconstruct every {@link MarkPos} stored as a {@link import('./delta.js').Mark mark} inside `d` (a
 * settled delta). A mark's `path` is the content indices / attribute keys walked to reach it, plus the
 * mark's own `key`. Add marks with {@link import('./delta.js').DeltaBuilder#addMark}.
 *
 * Subtrees are pruned via each node's conservative `maybeHasMarks` flag (`false` ⇒ guaranteed empty,
 * skipped). This is also the **sole resetter** of that flag: a descended subtree that turns out to hold
 * no marks has its (stale) `true` cleared to `false`, so later calls prune it. The flag is therefore a
 * cheap hint that this read keeps eventually-accurate (a write during a read, like a lazy cache).
 *
 * @param {delta.DeltaAny} d
 * @return {Array<MarkPos>}
 */
export const marksToPositions = d => {
  /** @type {Array<MarkPos>} */
  const out = []
  /**
   * Emit the marks in `node`'s subtree and return whether any were found (used to self-correct the flag).
   *
   * @param {delta.DeltaAny} node
   * @param {Array<PosStep>} path
   * @return {boolean}
   */
  const walk = (node, path) => {
    if (!node.maybeHasMarks) return false // guaranteed no marks in this subtree
    let found = false
    if (node.marks !== null) {
      for (const m of node.marks) {
        found = true
        out.push(m.attrs === null
          ? { id: m.id, path: [...path, m.key], assoc: m.assoc }
          : { id: m.id, path: [...path, m.key], assoc: m.assoc, attrs: m.attrs })
      }
    }
    // a settled delta has only text/insert children; descend the delta-valued embeds
    let i = 0
    for (const op of node.children) {
      if (delta.$insertOp.check(op)) {
        for (const el of op.insert) {
          if (delta.$deltaAny.check(el) && el.maybeHasMarks && walk(el, [...path, i])) found = true
          i++
        }
      } else {
        i += op.length
      }
    }
    for (const op of node.attrs) {
      // descend `setAttr` (a materialized value) AND `modifyAttr` (an incremental change into a not-yet-
      // materialized sub-document attribute, which `apply` may leave on a settled node) - both hold a
      // delta value reachable here.
      if ((delta.$setAttrOp.check(op) || delta.$modifyAttrOp.check(op)) && delta.$deltaAny.check(op.value) && op.value.maybeHasMarks && walk(op.value, [...path, op.key])) {
        found = true
      }
    }
    node.maybeHasMarks = found // self-correct: clear a stale `true` so later reads prune this subtree
    return found
  }
  walk(d, [])
  return out
}
