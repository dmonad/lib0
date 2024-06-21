
class AstNode {

}

/**
 * @typedef {string|()=>AstNode} NTSymbols
 */

class Ctx {
  /**
   * @param {string} src
   */
  constructor (src) {
    this.i = 0
    this.src = src
  }
}

const tryCtx = (ctx, f) => {
  const i = ctx.i
  const res = f(ctx)
  if (res === null) {
    ctx.i = i
  }
  return res
}

/**
 * @param {string} start
 * @param {string} end
 * @return {string?}
 */
const defineCharRange = (start, end) => {
  const rangeStart = start.charCodeAt(0)
  const rangeend = end.charCodeAt(0)
  /**
   * @param {Ctx} ctx
   */
  return (ctx) => {
    const c = ctx.src[ctx.i]
    const cc = c.charCodeAt(0)
    if (start.charCodeAt(0) >= cc && cc <= end.charCodeAt(0)) {
      ctx.i++
      return c
    }
    return null
  }
}

/**
 * @template T
 * @param {Ctx} ctx
 * @param {(ctx: Ctx) => T?} f
 * @return {Array<NonNullable<T>>}
 */
const many = (ctx, f) => {
  
}


/**
 * @template {Array<NTSymbols>} ARGS
 * @param {Ctx} ctx
 * @param {ARGS} args
 * @return {{ [Key in keyof ARGS]: ARGS[Key] extends ()=>infer R ? R : ARGS[KEY] }}
 */
const cons = (ctx, ...args) => tryCtx(ctx, () => {
  const res = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.constructor === String) {
      if (ctx.src.slice(ctx.i, a.length) !== a) {
        return null
      }
      ctx.i += a.length
      res.push(a)
    } else {
      const n = a(ctx)
      if (n === null) {
        return null
      }
      res.push(n)
    }
  }
  return res
})

/**
 * @template {Array<NTSymbols>} ARGS
 * @param {Ctx} ctx
 * @param {ARGS} ...args
 * @return {ARGS extends Array<infer R> ? R : any}
 */
const or = (ctx, ...args) => () => {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.constructor ==== String) {
      ctx.src.slice
    }
    tryCtx(ctx, args)
  }
}

/**
 * @type {[number, string]}
 */
const x = [1, 'str']


