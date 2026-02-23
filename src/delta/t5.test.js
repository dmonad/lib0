import * as error from '../error.js'
import * as delta from './delta.js'
import * as s from '../schema.js'

/**
 * @template {delta.DeltaAny} [DeltaA=delta.DeltaAny]
 * @template {delta.DeltaAny} [DeltaB=delta.DeltaAny]
 */
class TransformResult {
  /**
   * @param {DeltaA?} a
   * @param {DeltaB?} b
   */
  constructor (a, b) {
    /**
     * @type {DeltaA?}
     */
    this.a = a
    /**
     * @type {DeltaB?}
     */
    this.b = b
  }

  reverse () {
    return new TransformResult(this.b, this.a)
  }
}

/**
 * @template {delta.DeltaAny} [DeltaA=delta.DeltaAny]
 * @template {delta.DeltaAny} [DeltaB=delta.DeltaAny]
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
   * @param {delta.Delta<A>} _t
   * @return {TransformResult<delta.Delta<A>,delta.Delta<B>>}
   */
  applyA (_t) {
    error.unexpectedCase()
  }

  /**
   * @param {delta.Delta<B>} _t
   * @return {TransformResult<delta.Delta<A>,delta.Delta<B>>}
   */
  applyB (_t) {
    error.unexpectedCase()
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
 * @typedef {delta.DeltaConfOverwrite<IN,{ attrs: import('../ts.js').PropsRename<delta.DeltaConfGetAttrs<IN>,Renames> }>} ApplyAttrRename
 */

/**
 * @template {delta.DeltaConf} DConf
 * @template {delta.DeltaConf} IN
 * @typedef {{ [K in keyof DConf & keyof IN]: K extends 'attrs' ? import('../ts.js').PropsPickShared<DConf[K], IN[K]> : (DConf[K] & IN[K])} & {}} ApplyExpectType
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
 *     T extends Filter<infer DConf extends delta.DeltaConf> ? ApplyExpectType<DConf,IN> :
 *     IN
 * >} ApplyTemplate
 */

/**
 * Flattens nested Pipe instances into a single flat Template array.
 * Since pipe() always produces flat Pipes, Inner is already flat and
 * only one level of unwrapping is needed per Pipe element.
 *
 * @template {Array<Template>} TS
 * @typedef {TS extends [infer F extends Template, ...infer R extends Template[]]
 *   ? F extends Pipe<infer Inner extends Template[]>
 *     ? [...Inner, ...FlattenTemplates<R>]
 *     : [F, ...FlattenTemplates<R>]
 *   : []} FlattenTemplates
 */

/**
 * @param {delta.DeltaAny?} d
 * @param {{[K:string|number]:string|number}} renames
 * @param {{[K:string|number]:string|number}} revRenames
 * @return {TransformResult}
 */
const renameAttrs = (d, renames, revRenames) => {
  if (d == null) return createTransformResult(null, null)
  const forwardTransform = delta.clone(d)
  for (const attr of forwardTransform.attrs) {
    const key = attr.key
    const r = renames[key]
    const rv = revRenames[key]
    if (r != null) {
      // @ts-ignore
      forwardTransform.attrs[r] = attr
      // delete original
      delete forwardTransform.attrs[key]
      // @ts-ignore
      attr.key = r
    } else if (rv != null) {
      // used in a rename, delete original
      delete forwardTransform.attrs[key]
    }
  }
  return createTransformResult(null, forwardTransform)
}

/**
 * @template {{[K:string|number]:string|number}} Renames
 * @implements Template
 * @implements Transformer<any,any>
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
   * @param {delta.DeltaAny} deltaA
   * @return {TransformResult}
   */
  applyA (deltaA) {
    return renameAttrs(deltaA, this.arenames, this.brenames)
  }

  /**
   * @param {delta.DeltaAny} deltaB
   * @return {TransformResult}
   */
  applyB (deltaB) {
    return renameAttrs(deltaB, this.brenames, this.arenames).reverse()
  }
}

/**
 * @template {delta.DeltaConf} DConf
 * @implements Template
 */
export class Filter {
  /**
   * @param {s.Schema<delta.Delta<DConf>>} $d
   */
  constructor ($d) {
    s.assert($d, delta.$$delta)
    this.$d = $d
    this.$dshape = $d.shape
  }

  get stateless () { return false }

  /**
   * @template {delta.DeltaConf} IN
   * @param {s.Schema<delta.Delta<IN>>} $d
   * @return {Transformer<IN,ApplyExpectType<DConf, IN>>}
   */
  init ($d) {
    return new FilterTransformer(this.$d)
  }
}

/**
 * @template {delta.DeltaConf} IN
 * @template {delta.DeltaConf} OUT
 * @template {delta.DeltaConf} DConf
 * @implements Transformer<IN,OUT>
 */
export class FilterTransformer {
  /**
   * @param {delta.$Delta<DConf>} $d
   */
  constructor ($d) {
    this.$dshape = $d.shape
    this.filter = delta.create(delta.$delta({ children: s.$any }))
    /**
     * @type {delta.DeltaAny}
     */
    this.dreversed = delta.create()
  }

  /**
   * @param {delta.DeltaAny} deltaA
   */
  applyA (deltaA) {
    const $attrs = this.$dshape.$attrs
    const dtrans = delta.clone(deltaA)
    /**
     * @type {delta.DeltaBuilderAny}
     */
    const drev = delta.create()
    for (const entry of dtrans.attrs) {
      if (delta.$setAttrOp.check(entry) || delta.$modifyOp.check(entry)) {
        if (!$attrs.check({ [entry.key]: entry.value })) {
          delete dtrans.attrs[entry.key]
          drev.deleteAttr(entry.key, null)
        } else {
          // @ts-ignore
          drev.attrs[entry.key] = entry.clone()
        }
      } else if (delta.$deleteAttrOp.check(this.dreversed.attrs[entry.key])) {
        delete dtrans.attrs[entry.key]
      }
    }
    deltaA.children
    return createTransformResult(null, deltaA)
  }

  /**
   * @param {delta.DeltaAny} deltaB
   */
  applyB (deltaB) {
    return createTransformResult(deltaB, null)
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
 * @template {delta.DeltaConf} DConf
 * @param {s.Schema<delta.Delta<DConf>>} $d
 */
export const filter = $d => new Filter($d)

/**
 * @template {Array<Template>} Ts
 * @param {Ts} ts
 * @return {Pipe<FlattenTemplates<Ts>>}
 */
const pipe = (...ts) => /** @type {any} */ (new Pipe(ts.flatMap(t => t instanceof Pipe ? t.templates : [t])))

const r1 = rename(/** @type {const} */ ({ a: 'b' }))
const r2 = rename(/** @type {const} */ ({ b: 'a' }))
const r3 = filter(delta.$delta({ attrs: { a: [s.$number, s.$string] } }))
const i1 = r1.init(delta.$delta({ attrs: { a: s.$string, b: s.$string } }))
const $d3 = delta.$delta({ children: 42, attrs: {a: s.$string} })
const r31 = pipe(r3)
const i3 = r3.init($d3)
const i31 = r31.init($d3)
const p12 = pipe(r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2, r1, r2)
const p1212 = pipe(p12, p12)
const $d = delta.$delta(/** @type {const} */ ({
  attrs: {
    x: 'dtrn'
  }
}))
const p12init = p12.init(delta.$delta({ attrs: { a: s.$string } }))
const ddd = delta.create().setAttr('a', 'dturiane')
const dtrn = p12init.applyA(ddd)
console.log(p12init)
