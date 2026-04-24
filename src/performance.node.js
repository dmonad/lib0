import { performance } from 'node:perf_hooks'
import { nop } from './function.js'
import * as time from './time.js'

/**
 * @type {typeof performance.measure}
 */
/* c8 ignore next */
export const measure = /* @__PURE__ */(() => performance.measure ? performance.measure.bind(performance) : /** @type {any} */ (nop))()

/**
 * @type {typeof performance.now}
 */
/* c8 ignore next */
export const now = /* @__PURE__ */(() => performance.now ? performance.now.bind(performance) : time.getUnixTime)()

/**
 * @type {typeof performance.mark}
 */
/* c8 ignore next */
export const mark = /* @__PURE__ */(() => performance.mark ? performance.mark.bind(performance) : /** @type {any} */ (nop))()
