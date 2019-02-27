import * as f from './function.js'

export const captureStackTrace = Error.captureStackTrace || f.nop

export const create = m => {
    const e = new Error(m)
    captureStackTrace(e, create)
    return e
}
