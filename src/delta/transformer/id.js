import { renameAttrs } from './rename-attrs.js'

/**
 * The identity transformer factory: it maps every change verbatim in both directions, so both sides
 * stay bit-for-bit equal (an attr-rename with no renames). The default template factory for
 * {@link import('../rdt.js').bind}; `id($d).init()` builds the transformer.
 *
 * @template {import('../delta.js').DeltaConf} IN
 * @param {import('../../schema.js').Schema<import('../delta.js').Delta<IN>>} $d
 * @return {import('./rename-attrs.js').RenameAttrs<{}, IN>}
 */
/* @__NO_SIDE_EFFECTS__ */
export const id = ($d) => renameAttrs($d, {})
