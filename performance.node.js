import { performance } from 'perf_hooks'

export const measure = performance.measure.bind(performance)
export const now = performance.now.bind(performance)
export const mark = performance.mark.bind(performance)
