import { performance } from 'node:perf_hooks'
import { nop } from './function.js'

export const measure = performance.measure ? performance.measure.bind(performance) : nop
export const now = performance.now ? performance.now.bind(performance) : nop
export const mark = performance.mark ? performance.mark.bind(performance) : nop
