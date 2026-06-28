/**
 * # Delta transformers
 *
 * A {@link Template} is a composable transformer factory; its `init($schema)` produces a stateful
 * {@link Transformer} that maps changes ("deltas") of one delta shape (side A) onto another (side B)
 * and back. Transformers compose with {@link pipe}.
 *
 * Each concrete transformer lives in `./transformer/` and is re-exported here so the whole set is
 * available from a single module (`lib0/delta/transformer`):
 * - {@link id} — identity (both sides stay equal)
 * - {@link renameAttrs} — rename node attributes
 * - {@link conform} — drop everything the target schema does not recognize
 * - {@link pipe} — chain templates
 * - {@link attr} — project a single attribute into a `lib0:value` node
 * - {@link inline} — inline child nodes whose name is in a configured set
 * - {@link children} — descend into child nodes and apply a per-child sub-transformer
 * - {@link project} — project the data onto a fixed structure (spec) with embedded "holes"
 * - {@link unwrapValue} — composable resolver for `lib0:value` carrier children (scalar lift)
 * - {@link rename} — rename a node's name (e.g. mark a `children`-map as `lib0:inline`)
 *
 * @module delta/transformer
 */

export * from './transformer/core.js'
export * from './transformer/id.js'
export * from './transformer/rename.js'
export * from './transformer/conform.js'
export * from './transformer/pipe.js'
export * from './transformer/attr.js'
export * from './transformer/inline.js'
export * from './transformer/children.js'
export * from './transformer/project.js'
export * from './transformer/value.js'
export * from './transformer/rename-attrs.js'
