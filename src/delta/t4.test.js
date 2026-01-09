import * as error from '../error.js'
import * as delta from './delta.js'

/**
 * @template {delta.DeltaAny} DeltaA
 * @template {delta.DeltaAny} DeltaB
 * @typedef {{ a: DeltaA, b: DeltaB }} TransformResult
 */

/**
 * @template {delta.DeltaAny} A
 * @template {delta.DeltaAny} B
 */
class Transformer {
  /**
   * @param {TransformResult<A,B>} t
   * @return {TransformResult<A,B>}
   */
  apply (t) {
    return t
  }
}

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 */
class TransformerTemplate {
  /**
   * @return {Transformer<delta.Delta<A>,delta.Delta<B>>}
   */
  init () {
    error.methodUnimplemented()
  }
}

class TransformPipe {
  constructor () {
    /**
     * @type {TransformerTemplate<any,any>[]}
     */
    this.trs = []
  }
  init () {
    return this
  }
  /**
   * @param {TransformResult<any,any>} tr
   */
  apply (tr) {
    for (let i = 0; i < this.trs.length; i++) {
      debugger
    }
    return tr
  }
}

/**
 * @template {readonly ((arg: any) => any)[]} Fns
 * @typedef {Fns extends readonly [(arg: infer A) => any, ...any[]] ? A : never} FirstArg
 */

/**
 * @template {readonly ((arg: any) => any)[]} Fns
 * @typedef {Fns extends readonly [...any[], (arg: any) => infer R] ? R : never} LastReturn
 */

/**
 * @template {readonly ((arg: any) => any)[]} Fns
 * @param {Fns} fns
 * @returns {(arg: FirstArg<Fns>) => LastReturn<Fns>}
 */
const pipe = (...fns) => (arg) => /** @type {any} */ (fns.reduce((acc, fn) => fn(acc), arg))

/**
 * @param {<A extends delta.DeltaConf,B extends delta.DeltaConf>(t:TransformerTemplate<A,B>)=>TransformerTemplate<A,B>} t1
 * @param {TransformerTemplate<any,any>} t2
 */
const pipex = (t1, t2) => {
  const tpipe = new TransformPipe()
  if (t1 instanceof TransformPipe) {
    tpipe.trs = t1.trs.concat(t2 instanceof TransformPipe ? t2.trs : [t2]) 
  } else {
    tpipe.trs.push(t1, t2)
  }
  return tpipe
}

class RenameTransformer {
  /**
   * @param {{[K:string|number]:string|number}} renames
   */
  constructor (renames) {
    this.renames = renames
  }
  init () {
    return this
  }
  /**
   * @param {TransformResult<A,B>} t
   * @return {TransformResult<A,B>}
   */
  apply (t) {
    return t
  }
}

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @template {{[K:string|number]:string|number}} Renames
 * @param {Renames} renames
 * @param {TransformerTemplate<A,B>} dt
 * @return {TransformerTemplate<A,delta.DeltaConfOverwrite<B,{ attrs: import('../ts.js').RenameProps<delta.DeltaConfGetAttrs<B>,Renames> }>>}
 */
const rename = (renames, dt) => {
  error.unexpectedCase()
}

/**
 * @typedef {{attrs:{a:number,b:string}}} XDef
 */

/**
 * @type {TransformerTemplate<XDef,XDef>}
 */
const x = new TransformerTemplate()

/**
 * @template {TransformerTemplate<delta.DeltaConf,delta.DeltaConf>} Q
 * @param {Q} t
 */
const pd = t => rename(/** @type {const} */ ({ a: 'q' }),
    t
  )

const pd_ = pd(x)

const xres = rename(/** @type {const} */ ({a: 42}))(x)

/**
 * @template {delta.DeltaConf} D
 * @param {TransformerTemplate<any,D>} dt
 */
const qq = dt => rename(/** @type {const} */ ({ b: 'q' }))(dt)


const m = rename(/** @type {const} */ ({ q: 'p' }))(qq(x))
const n = rename(/** @type {const} */ ({ p: 'o' }))(m)
const o = rename(/** @type {const} */ ({ o: 'ldtrunaedtrn1' }))(n)

