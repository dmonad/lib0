// @ts-nocheck
import * as error from '../error.js'
import * as delta from './delta.js'
import * as s from '../schema.js'

/**
 * @template {delta.DeltaAny} [DeltaA=delta.DeltaBuilderAny]
 * @template {delta.DeltaAny} [DeltaB=delta.DeltaBuilderAny]
 */
class TransformResult {
  /**
   * @param {DeltaA?} a
   * @param {DeltaB?} b
   */
  constructor (a = null, b = null) {
    /**
     * @type {DeltaA?}
     */
    this.a = null
    /**
     * @type {DeltaB?}
     */
    this.b = null
  }
}

/**
 * @template {delta.DeltaAny} [DeltaA=delta.DeltaBuilderAny]
 * @template {delta.DeltaAny} [DeltaB=delta.DeltaBuilderAny]
 * @param {DeltaA?} a
 * @param {DeltaB?} b
 */
const createTransformResult = (a, b) => new TransformResult(a, b)

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 */
export class Transformer {
  /**
   * @param {TransformResult<delta.Delta<A>,delta.Delta<B>>} t
   * @return {TransformResult<delta.Delta<A>,delta.Delta<B>>}
   */
  apply (t) {
    return t
  }
}

/**
 * @typedef {object} Template
 * @property {boolean} Template.stateless
 * @property {($d:s.Schema<delta.DeltaAny>)=>Transformer<any,any>} Template.init
 */

// Helpers to get the expected output using Templated Transformers

/**
 * @template {{[K:string|number]:string|number}} Renames
 * @template {delta.DeltaConf} IN
 * @typedef {delta.DeltaConfOverwrite<IN,{ attrs: import('../ts.js').RenameProps<delta.DeltaConfGetAttrs<IN>,Renames> }>} ApplyAttrRename
 */

/**
 * @template {Array<Template>} TS
 * @template {delta.DeltaConf} IN
 * @typedef {TS extends [infer FirstT extends Template, ...infer RestT extends Template[]] ? ApplyPipe<RestT,ApplyTemplate<FirstT,IN>> : IN } ApplyPipe
 */

/**
 * @template IN
 * @typedef {IN extends infer OUT extends delta.DeltaConf ? OUT : never} EnsureDeltaConf
 */

/**
 * @template {Template} T
 * @template {delta.DeltaConf} IN
 * @typedef {EnsureDeltaConf<
 *     T extends AttrRename<infer Renames> ? ApplyAttrRename<Renames,IN> :
 *     T extends Pipe<infer TS>            ? ApplyPipe<TS,IN> :
 *     IN
 * >} ApplyTemplate
 */

/**
 * @param {delta.DeltaAny?} d
 * @param {{[K:string|number]:string|number}} renames
 * @param {{[K:string|number]:string|number}} revRenames
 */
const renameAttrs = (d, renames, revRenames) => {
  if (d == null) return null
  const forwardTransform = delta.clone(d)
  const res = createTransformResult(forwardTransform, null)
  for (const attr of forwardTransform.attrs) {
    const key = attr.key
    const r = renames[key]
    const rv = revRenames[key]
    if (r != null) {
      // @ts-ignore
      forwardTransform.attrs[r] = attr
      // delete original
      delete forwardTransform.attrs[key]
    } else if (rv != null) {
      // used in a rename, delete original
      delete forwardTransform.attrs[key]
      ;(res.b ?? (res.b = delta.create())).deleteAttr(key)
    }
  }
  return forwardTransform
}

/**
 * @template {{[K:string|number]:string|number}} Renames
 * @implements Template
 */
export class AttrRename {
  /**
   * @param {Renames} renames
   */
  constructor (renames) {
    this.arenames = renames
    /**
     * @type {{[K:string|number]:string|number}}
     */
    this.brenames = {}
    for (const k in renames) {
      this.brenames[renames[k]] = k
    }
  }

  get stateless () { return true }

  /**
   * @template {delta.DeltaConf} IN
   * @param {s.Schema<delta.Delta<IN>>} $d
   * @return {Transformer<IN,ApplyAttrRename<Renames,IN>>}
   */
  init ($d) {
    return this
  }

  /**
   * @param {TransformResult} tin
   */
  apply (tin) {
    return {
      a: renameAttrs(tin.b?.clone(), this.brenames),
      b: renameAttrs(tin.a?.clone(), this.arenames)
    }
  }
}

/**
 * Chain multiple Templates together.
 *
 * @template {Template[]} TS
 * @implements Template
 */
export class Pipe {
  /**
   * @param {TS} templates
   */
  constructor (templates) {
    this.templates = templates
    this.stateless = templates.every(t => t.stateless)
  }

  /**
   * @template {delta.DeltaConf} IN
   * @param {s.Schema<delta.Delta<IN>>} $d
   * @return {Transformer<IN, ApplyPipe<TS, IN>>}
   */
  init ($d) {
    error.methodUnimplemented()
  }
}

/**
 * @template {{[K:string|number]:string|number}} Renames
 * @param {Renames} renames
 */
export const rename = renames => new AttrRename(renames)
/**
 * @template {Array<Template>} Ts
 * @param {Ts} ts
 */
const pipe = (...ts) => new Pipe(ts)

const r1 = rename(/** @type {const} */ ({ a: 'b' }))
const r2 = rename(/** @type {const} */ ({ b: 'c' }))

const p12 = pipe(r1, r2)
const p12init = p12.init(delta.$delta({ attrs: { a: s.$string } }))
console.log(p12init)
