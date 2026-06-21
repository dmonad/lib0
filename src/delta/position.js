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
 * Numbers are always child indices, so a *number-keyed attribute* is not addressable (an accepted
 * limitation — such keys are not used in practice).
 *
 * @module delta/position
 */

import * as s from '../schema.js'

/**
 * A single step of a {@link Pos} path: a `string` attribute key, or a `number` content index.
 *
 * @typedef {string|number} PosStep
 */

/**
 * A location in a delta tree. `path` descends from the node the position is relative to and ends in
 * the terminal (a trailing-number cursor gap, or a trailing-string attribute leaf). `assoc` is the
 * gravity at a boundary: `-1` binds to the preceding content, `1` to the following content.
 *
 * @typedef {{ path: Array<PosStep>, assoc: -1|1 }} Pos
 */

/**
 * Schema for a {@link Pos}.
 *
 * @type {s.Schema<Pos>}
 */
export const $pos = /* @__PURE__ */ s.$object({
  path: s.$array(s.$union(s.$string, s.$number)),
  assoc: s.$literal(-1, 1)
})

/**
 * Create a {@link Pos} from a path and (optional) association.
 *
 * @param {Array<PosStep>} path
 * @param {-1|1} [assoc]
 * @return {Pos}
 */
export const createPos = (path, assoc = 1) => ({ path, assoc })

/**
 * Ergonomic {@link Pos} constructor with right gravity, e.g. `pos('a', 1)`.
 *
 * @param {...PosStep} path
 * @return {Pos}
 */
export const pos = (...path) => ({ path, assoc: 1 })

/**
 * Structural equality of two positions.
 *
 * @param {Pos} a
 * @param {Pos} b
 * @return {boolean}
 */
export const equals = (a, b) => a.assoc === b.assoc && a.path.length === b.path.length && a.path.every((step, i) => step === b.path[i])
