// Per-transformer tests live next to their implementation in ./transformers/ and are re-exported
// here so they run under this (registered) module.
export * from './transformers/id.test.js'
export * from './transformers/rename.test.js'
export * from './transformers/filter.test.js'
export * from './transformers/pipe.test.js'
export * from './transformers/query.test.js'
export * from './transformers/projection.test.js'
export * from './transformers/InlineNullNodes.test.js'
