/**
 * # Delta transformers
 *
 * A {@link Template} is a composable transformer factory; its `init($schema)` produces a stateful
 * {@link Transformer} that maps changes ("deltas") of one delta shape (side A) onto another (side B)
 * and back. Transformers compose with {@link pipe}.
 *
 * Each concrete transformer lives in `./transformers/` and is re-exported here so the whole set is
 * available from a single module (`lib0/delta/transformer`):
 * - {@link id} — identity (both sides stay equal)
 * - {@link rename} — rename node attributes
 * - {@link filter} — drop everything not matching a schema
 * - {@link pipe} — chain templates
 * - {@link query} — project a single attribute into a `lib0:value` node
 * - {@link projection} — project onto a fixed node shape
 * - {@link inline} — inline child nodes whose name is in a configured set
 * - {@link children} — descend into child nodes and apply a per-child sub-transformer
 *
 * @module delta/transformer
 */

export * from './transformers/core.js'
export * from './transformers/id.js'
export * from './transformers/rename.js'
export * from './transformers/filter.js'
export * from './transformers/pipe.js'
export * from './transformers/query.js'
export * from './transformers/projection.js'
export * from './transformers/inline.js'
export * from './transformers/children.js'

/**
 * Re-exported here so `import('./transformer.js').Template` keeps working for consumers that import
 * the aggregate module.
 *
 * @typedef {import('./transformers/core.js').Template} Template
 */
