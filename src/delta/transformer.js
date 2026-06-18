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
 * - {@link rename} — rename node attributes
 * - {@link filter} — drop everything not matching a schema
 * - {@link pipe} — chain templates
 * - {@link attr} — project a single attribute into a `lib0:value` node
 * - {@link projection} — project onto a fixed node shape
 * - {@link inline} — inline child nodes whose name is in a configured set
 * - {@link children} — descend into child nodes and apply a per-child sub-transformer
 *
 * @module delta/transformer
 */

export * from './transformer/core.js'
export * from './transformer/id.js'
export * from './transformer/rename.js'
export * from './transformer/filter.js'
export * from './transformer/pipe.js'
export * from './transformer/attr.js'
export * from './transformer/projection.js'
export * from './transformer/inline.js'
export * from './transformer/children.js'

/**
 * Re-exported here so `import('./transformer.js').Template` keeps working for consumers that import
 * the aggregate module.
 *
 * @typedef {import('./transformer/core.js').Template} Template
 */
