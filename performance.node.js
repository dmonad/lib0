import { performance } from 'node:perf_hooks'
import { nop } from './function.js'

/* c8 ignore next */
export const measure = performance.measure ? performance.measure.bind(performance) : nop
/* c8 ignore next */
export const now = performance.now ? performance.now.bind(performance) : nop
/* c8 ignore next */
export const mark = performance.mark ? performance.mark.bind(performance) : nop
