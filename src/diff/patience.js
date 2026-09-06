/**
 * A very simple diff algorithm. Slightly adapted to support splitting at different stages (e.g.
 * first diff lines, then diff words)
 *
 * https://bramcohen.livejournal.com/73318.html
 *
 * @experiemantal This API will likely change.
 */

import * as map from '../map.js'
import * as math from '../math.js'
import * as array from '../array.js'

/**
 * Implementation of patience diff. Expects that content is pre-split (e.g. by newline).
 *
 * A hunk inside a run of equal items is ambiguous (`aaa` → `aa` may delete any of the `a`s). By default
 * the common prefix is stripped first, so such a hunk lands at the *rightmost* slot of its run. With
 * `leftmost` the first hunk lands at the *leftmost* slot instead: nothing is stripped up front and the
 * gap before the first anchor strips its common suffix before its prefix (see {@link lcs}). Unambiguous
 * input diffs identically either way.
 *
 * @param {Array<string>} as
 * @param {Array<string>} bs
 * @param {boolean} [leftmost]
 * @return {Array<{ index: number, remove: Array<string>, insert: Array<string>}>} changeset
 */
export const diff = (as, bs, leftmost = false) => {
  if (leftmost) return lcs(as, bs, 0, true)
  const {
    middleAs,
    middleBs,
    commonPrefix
  } = removeCommonPrefixAndSuffix(as, bs)
  return lcs(middleAs, middleBs, commonPrefix, false)
}

/**
 * @param {string} a
 * @param {string} b
 * @param {RegExp|string} regexp
 */
export const diffSplitBy = (a, b, regexp) => {
  const isStringSeparator = typeof regexp === 'string'
  const separator = /** @type {string} */ (isStringSeparator ? regexp : '')
  if (isStringSeparator) {
    regexp = new RegExp(regexp, 'g')
  }
  const as = splitByRegexp(a, /** @type {RegExp} */ (regexp), !isStringSeparator)
  const bs = splitByRegexp(b, /** @type {RegExp} */ (regexp), !isStringSeparator)
  const changes = diff(as, bs)
  let prevSplitIndex = 0
  let prevStringIndex = 0
  return changes.map(change => {
    for (; prevSplitIndex < change.index; prevSplitIndex++) {
      prevStringIndex += as[prevSplitIndex].length
    }
    return {
      index: prevStringIndex,
      remove: change.remove.join(separator),
      insert: change.insert.join(separator)
    }
  })
}

/**
 * Idea: match all "non-word" characters and keep them separate (spaces, comma, exclamation marks, ..).
 * Anything that can be classivied as a word (emoji, char, number) will be bundled together. All other tokens are kept
 * individually. "hello, world!!!!" => ['hello', ',', ' ', 'world', '!', '!']
 *
 * @experimental
 */
export const smartSplitRegex = /[^\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Modifier}\u200D\uFE0F]/gu // eslint-disable-line no-misleading-character-class

/**
 * Sensible default for diffing strings using patience (it's fast though).
 *
 * Perform different types of patience diff on the content. Diff first by newline, then paragraphs, then by word
 * (split by space, brackets, punctuation)
 *
 * @param {string} a
 * @param {string} b
 */
export const diffAuto = (a, b) =>
  diffSplitBy(a, b, '\n').map(d =>
    diffSplitBy(d.remove, d.insert, smartSplitRegex).map(dd => ({ // old regex: /\. |[a-zA-Z0-9]+|[. ()[\],;{}]/g
      insert: dd.insert,
      remove: dd.remove,
      index: dd.index + d.index
    }))
  ).flat(1)

/**
 * Strip the common prefix and suffix. Whichever end is matched first claims the overlap, i.e. decides
 * where a hunk inside a run of equal items lands: prefix first (default) ⇒ rightmost slot, `suffixFirst`
 * ⇒ leftmost slot.
 *
 * @param {Array<string>} as
 * @param {Array<string>} bs
 * @param {boolean} [suffixFirst]
 */
const removeCommonPrefixAndSuffix = (as, bs, suffixFirst = false) => {
  const commonLen = math.min(as.length, bs.length)
  let commonPrefix = 0
  let commonSuffix = 0
  if (suffixFirst) {
    for (; commonSuffix < commonLen && as[as.length - 1 - commonSuffix] === bs[bs.length - 1 - commonSuffix]; commonSuffix++) { /* nop */ }
  }
  // match start
  for (; commonPrefix < commonLen - commonSuffix && as[commonPrefix] === bs[commonPrefix]; commonPrefix++) { /* nop */ }
  // match end
  for (; commonSuffix < commonLen - commonPrefix && as[as.length - 1 - commonSuffix] === bs[bs.length - 1 - commonSuffix]; commonSuffix++) { /* nop */ }
  const middleAs = as.slice(commonPrefix, as.length - commonSuffix)
  const middleBs = bs.slice(commonPrefix, bs.length - commonSuffix)
  return {
    middleAs, middleBs, commonPrefix, commonSuffix
  }
}

/**
 * Splits string by regex and returns all strings as an array. The matched parts are also returned.
 *
 * @param {string} str
 * @param {RegExp} regexp
 * @param {boolean} includeSeparator
 */
export const splitByRegexp = (str, regexp, includeSeparator) => {
  const matches = [...str.matchAll(regexp)]
  let prevIndex = 0
  /**
   * @type {Array<string>}
   */
  const res = []
  matches.forEach(m => {
    prevIndex < (m.index || 0) && res.push(str.slice(prevIndex, m.index))
    includeSeparator && res.push(m[0]) // is always non-empty
    prevIndex = /** @type {number} */ (m.index) + m[0].length
  })
  const end = str.slice(prevIndex)
  end.length > 0 && res.push(end)
  return res
}

/**
 * An item may have multiple occurances (not when matching unique entries). It also may have a
 * reference to the stack of other items (from as to bs).
 */
class Item {
  constructor () {
    /**
     * @type {Array<number>}
     */
    this.indexes = []
    /**
     * The matching item from the other side
     * @type {Item?}
     */
    this.match = null
    /**
     * For patience sort. Reference (index of the stack) to the previous pile.
     *
     * @type {Item?}
     */
    this.ref = null
  }
}

/**
 * @param {Array<string>} xs
 */
const partition = xs => {
  /**
   * @type {Map<string,Item>}
   */
  const refs = map.create()
  xs.forEach((x, index) => {
    map.setIfUndefined(refs, x, () => new Item()).indexes.push(index)
  })
  return refs
}

/**
 * Find the longest common subsequence of items using patience sort.
 *
 * @param {Array<string>} as
 * @param {Array<string>} bs
 * @param {number} indexAdjust
 * @param {boolean} leftmost the gap before the first anchor strips its suffix first (see {@link diff})
 */
const lcs = (as, bs, indexAdjust, leftmost) => {
  if (as.length === 0 && bs.length === 0) return []
  const aParts = partition(as)
  const bParts = partition(bs)
  /**
   * @type {Array<Array<Item>>} I.e. Array<Pile<Item>>
   */
  const piles = []
  aParts.forEach((aItem, aKey) => {
    // skip if no match or if either item is not unique
    if (aItem.indexes.length > 1 || (aItem.match = bParts.get(aKey) || null) == null || aItem.match.indexes.length > 1) return
    // pile tops ascend: binary search for the first pile whose top lies beyond this match
    const bIndex = aItem.match.indexes[0]
    let lo = 0
    let hi = piles.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (bIndex < /** @type {Item} */ (array.last(piles[mid]).match).indexes[0]) {
        hi = mid
      } else {
        lo = mid + 1
      }
    }
    if (lo > 0) aItem.ref = array.last(piles[lo - 1])
    if (lo < piles.length) {
      piles[lo].push(aItem)
    } else {
      piles.push([aItem])
    }
  })
  /**
   * References to all matched items
   *
   * @type {Array<Item>}
   */
  const matches = []
  /**
   * @type {Item?}
   */
  let currPileItem = piles[piles.length - 1]?.[0]
  while (currPileItem != null) {
    matches.push(currPileItem)
    currPileItem = currPileItem.ref
  }
  matches.reverse()
  // add pseude match (assume the string terminal always matches)
  const pseudoA = new Item()
  const pseudoB = new Item()
  pseudoA.match = pseudoB
  pseudoA.indexes.push(as.length)
  pseudoB.indexes.push(bs.length)
  matches.push(pseudoA)
  /**
   * @type {Array<{ index: number, remove: Array<string>, insert: Array<string>}>}
   */
  const changeset = []
  let diffAStart = 0
  let diffBStart = 0
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const delLength = m.indexes[0] - diffAStart
    const insLength = /** @type {Item} */ (m.match).indexes[0] - diffBStart
    if (delLength !== 0 || insLength !== 0) {
      const stripped = removeCommonPrefixAndSuffix(as.slice(diffAStart, diffAStart + delLength), bs.slice(diffBStart, diffBStart + insLength), leftmost && diffAStart === 0)
      if (stripped.middleAs.length !== 0 || stripped.middleBs.length !== 0) {
        changeset.push({ index: diffAStart + indexAdjust + stripped.commonPrefix, remove: stripped.middleAs, insert: stripped.middleBs })
      }
    }
    diffAStart = m.indexes[0] + 1
    diffBStart = /** @type {Item} */ (m.match).indexes[0] + 1
  }
  return changeset
}
