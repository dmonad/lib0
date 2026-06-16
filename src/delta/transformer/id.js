import { rename } from './rename.js'

/**
 * The identity {@link import('./core.js').Template Template}: it maps every change verbatim in both
 * directions, so both sides stay bit-for-bit equal. A stateless singleton (an attr-rename with no
 * renames).
 *
 * @type {import('./core.js').Template}
 */
export const id = /* @__PURE__ */ rename({})
