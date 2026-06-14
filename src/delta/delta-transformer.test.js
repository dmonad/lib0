// Per-transformer tests live next to their implementation in ./transformer/ and are re-exported
// here so they run under this (registered) module.
export * from './transformer/id.test.js'
export * from './transformer/rename.test.js'
export * from './transformer/filter.test.js'
export * from './transformer/pipe.test.js'
export * from './transformer/query.test.js'
export * from './transformer/projection.test.js'
export * from './transformer/inline.test.js'
export * from './transformer/children.test.js'
