import * as array from 'lib0/array'
import * as delta from './delta.js'
import * as s from '../schema.js'

/**
 * @template {delta.DeltaConf} [A={}]
 * @template {delta.DeltaConf} [B={}]
 */
class TransformResult {
  /**
   * @param {delta.DeltaBuilder<A>?} a
   * @param {delta.DeltaBuilder<B>?} b
   */
  constructor (a, b) {
    /**
     * @type {delta.DeltaBuilder<A>?}
     */
    this.a = a
    /**
     * @type {delta.DeltaBuilder<B>?}
     */
    this.b = b
  }

  isEmpty () {
    return this.a == null && this.b == null
  }

  clear () {
    this.a = null
    this.b = null
  }

  /**
   * @param {delta.DeltaBuilder<A>?} a
   */
  applyA (a) {
    if (a !== null) {
      if (this.a == null) {
        this.a = a
      } else {
        this.a.apply(a)
      }
    }
    return this
  }

  /**
   * @param {delta.DeltaBuilder<B>?} b
   */
  applyB (b) {
    if (b !== null) {
      if (this.b == null) {
        this.b = b
      } else {
        this.b.apply(b)
      }
    }
    return this
  }

  reverse () {
    return new TransformResult(this.b, this.a)
  }
}

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @param {s.Schema<delta.Delta<A>>} $a
 * @param {s.Schema<delta.Delta<B>>} $b
 * @return {s.Schema<TransformResult<A,B>>}
 */
export const $tresult = ($a, $b) => /** @type {any} */ (s.$instanceOf(TransformResult, tr => (tr.a === null || $a.check(tr.a)) && (tr.b === null || $b.check(tr.b))))

/**
 * @template {delta.DeltaBuilderAny} [DeltaA=delta.DeltaBuilderAny]
 * @template {delta.DeltaBuilderAny} [DeltaB=delta.DeltaBuilderAny]
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
   * @param {TransformResult<A, B>} tin
   * @return {TransformResult<A,B>}
   */
  apply (tin) {
    const ta = tin.a
    const tb = tin.b
    const ares = ta != null ? this.applyA(ta) : createTransformResult(null, null)
    // transform tb if necessary
    if (tb != null) {
      if (ares.b != null) {
        tb.rebase(ares.b, false)
      }
      const bres = this.applyB(tb)
      if (ares.a) {
        ares.a.apply(bres.a)
      } else {
        ares.a = bres.a
      }
      if (ares.b) {
        ares.b.apply(bres.b)
      } else {
        ares.b = bres.b
      }
    }
    return ares
  }

  /**
   * @param {delta.DeltaBuilder<A>} t
   * @return {TransformResult<A,B>}
   */
  applyA (t) {
    return this.apply(createTransformResult(t, null))
  }

  /**
   * @param {delta.DeltaBuilder<B>} t
   * @return {TransformResult<A,B>}
   */
  applyB (t) {
    return this.apply(createTransformResult(null, t))
  }
}

/**
 * This schema is only for typechecking, it does not actually check the transformer behavior!
 *
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @param {s.Schema<delta.Delta<A>>|A} _a
 * @param {s.Schema<delta.Delta<B>>|A} _b
 * @return {s.Schema<Transformer<A,B>>}
 */
export const transformerWith = (_a, _b) => /** @type {s.Schema<Transformer<A,B>>} */ (s.$instanceOf(Transformer))
export const $transformer = transformerWith(s.$any, s.$any)

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
 * @template {string} AttrName
 * @template {delta.DeltaConf} IN
 * @typedef {{ name: 'lib0:value', attrs: { value: IN extends { attrs: { [K in AttrName]: infer V } } ? V : never }}} ApplyQueryAttr
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
 * @extends Transformer<any,any>
 */
export class AttrRename extends Transformer {
  /**
   * @param {Renames} renames
   */
  constructor (renames) {
    super()
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
   * @param {s.Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN,ApplyAttrRename<Renames,IN>>}
   */
  init (_$d) {
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
   * @param {s.Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN,ApplyExpectType<DConf, IN>>}
   */
  init (_$d) {
    return /** @type {Transformer<IN,any>} */ (new FilterTransformer(this.$d))
  }
}

/**
 * @template {delta.DeltaConf} IN
 * @template {delta.DeltaConf} OUT
 * @template {delta.DeltaConf} DConf
 * @extends Transformer<IN,OUT>
 */
export class FilterTransformer extends Transformer {
  /**
   * @param {delta.$Delta<DConf>} $d
   */
  constructor ($d) {
    super()
    this.$dshape = $d.shape
    this.filter = delta.create(delta.$delta({ children: s.$any }))
    /**
     * @type {delta.DeltaAny}
     */
    this.dreversed = delta.create()
  }

  /**
   * @param {delta.DeltaBuilderAny} deltaA
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
    // @todo children
    return createTransformResult(null, deltaA)
  }

  /**
   * @param {delta.DeltaBuilderAny} deltaB
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
    /**
     * @type {TS}
     */
    this.templates = templates
    this.stateless = templates.every(t => t.stateless)
    /**
     * @type {PipeTransformer<any,any,this>?}
     */
    this.statelessTransformer = null
  }

  /**
   * @template {delta.DeltaConf} IN
   * @param {s.Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN, ApplyPipe<TS, IN>>}
   */
  init (_$d) {
    if (this.stateless) {
      return this.statelessTransformer || (this.statelessTransformer = new PipeTransformer(this))
    } else {
      return new PipeTransformer(this)
    }
  }
}

/**
 * @template {string} AttrName
 * @implements Template
 */
export class QueryAttr {
  /**
   * @param {AttrName} attrName
   */
  constructor (attrName) {
    this.attrName = attrName
  }

  get stateless () { return true }

  /**
   * @template {delta.DeltaConf} IN
   * @param {s.Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN, ApplyQueryAttr<AttrName, IN>>}
   */
  init (_$d) {
    return new QueryAttrTransformer(this.attrName)
  }
}

/**
 * @param {delta.DeltaBuilderAny} outDelta
 * @param {string|number} from
 * @param {string|number} to
 * @param {delta.DeltaBuilderAny} inDelta
 */
const queryAttrTransformHelper = (outDelta, from, to, inDelta) => {
  const attrOp = inDelta.attrs[from]
  if (attrOp != null) {
    const c = attrOp.clone()
    // @ts-ignore
    c.key = to
    outDelta.attrs.value = /** @type {any} */ (c)
  }
  return outDelta
}

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @extends {Transformer<A,B>}
 */
export class QueryAttrTransformer extends Transformer {
  /**
   * @param {string} attrName
   */
  constructor (attrName) {
    super()
    this.attrName = /** @type {keyof delta.DeltaConfGetAttrs<A> & (string|number)} */ (attrName)
  }

  /**
   * @param {delta.DeltaBuilder<A>} d
   * @return {TransformResult<A,B>}
   */
  applyA (d) {
    return createTransformResult(
      null,
      queryAttrTransformHelper(
        delta.create('lib0:value'),
        this.attrName,
        'value',
        d
      )
    )
  }

  /**
   * @param {delta.DeltaBuilder<B>} d
   * @return {TransformResult<A,B>}
   */
  applyB (d) {
    return createTransformResult(
      queryAttrTransformHelper(
        delta.create(),
        'value',
        this.attrName,
        d
      ),
      null
    )
  }
}

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @extends {Transformer<A,B>}
 */
export class ProjectionTransformer extends Transformer {
  /**
   * @param {string} name
   * @param {{ [K in string|number]: any }} attrs
   * @param {Array<Array<any> | string>} children
   */
  constructor (name, attrs, children) {
    super()
    /**
     * @type {Array<{ key: number|string, t: Transformer<any,any> }>}
     */
    const ts = []
    /**
     * @type {Object<any,any>}
     */
    const fixedAttrs = {}
    /**
     * @type {Array<any>}
     */
    const fixedChildren = []
    for (const key in attrs) {
      const t = attrs[key]
      if ($transformer.check(t)) {
        ts.push({ key, t })
      } else {
        fixedAttrs[key] = t
      }
    }
    children.forEach((t, key) => {
      if ($transformer.check(t)) {
        ts.push({ key, t })
        fixedChildren.push(delta.create('lib0:value'))
      } else {
        fixedChildren.push(delta.create('lib0:value', { value: t }))
      }
    })
    /**
     * @type {delta.DeltaBuilderAny|null}
     */
    this.initOut = delta.create(name, fixedAttrs, ...fixedChildren)
    this.ts = ts
  }

  /**
   * @param {TransformResult<A,B>} tin
   * @return {TransformResult<A,B>}
   */
  apply (tin) {
    const trs = this.ts.map(t => ({ key: t.key, tr: t.t.apply(tin) }))
    // @todo this doesn't sync changes between transformer-children
    const res = createTransformResult(null, this.initOut)
    this.initOut = null
    trs.forEach(({ key, tr }) => {
      res.applyA(tr.a)
      const updatedVal = tr.b?.attrs.value
      if (updatedVal !== null) {
        if (res.b == null) res.b = delta.create()
        if (delta.$setAttrOp.check(updatedVal)) {
          res.b.setAttr(key, updatedVal.value)
        } else if (delta.$modifyAttrOp.check(updatedVal)) {
          res.b.modifyAttr(key, updatedVal.value)
        } else if (delta.$deleteAttrOp.check(updatedVal)) {
          res.b.deleteAttr(key)
        }
      }
    })
    return res
  }
}

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @template {Pipe<Template[]>} PipeTemplate
 * @extends {Transformer<A,B>}
 */
export class PipeTransformer extends Transformer {
  /**
   * @param {PipeTemplate} tpipe
   */
  constructor (tpipe) {
    super()
    this.tpipe = tpipe
    /**
     * @type {Transformer<any,any>[]}
     */
    this.ts = tpipe.templates.map(t => t.init(delta.$deltaAny))
  }

  /**
   * @param {TransformResult<A,B>} tin
   * @return {TransformResult<A,B>}
   */
  apply (tin) {
    const ts = this.ts
    // the deltas we still have to apply on the respective transformers (ts[i].apply(tr[i]))
    const trs = array.unfold(ts.length, () => createTransformResult(null, null))
    // the final accumulated result
    const res = createTransformResult(null, null)
    trs[0].a = tin.a
    trs[trs.length - 1].b = tin.b
    let madeChange = false
    // change direction whenever possible, go back and forth until no more changes can be applied
    if (!tin.isEmpty()) {
      do {
        madeChange = false
        let forward = trs[0].a != null
        let i = forward ? 0 : ts.length - 1
        while (i <= 0 && i < ts.length) {
          const ti = ts[i]
          const tri = trs[i]
          if (!tri.isEmpty()) {
            madeChange = true
            const tires = ti.apply(tri)
            if (i === 0) {
              res.applyA(tires.a)
            } else {
              trs[i - 1].applyB(tires.a)
            }
            if (i === trs.length - 1) {
              res.applyB(tires.b)
            } else {
              trs[i + 1].applyA(tires.b)
            }
          }
          tri.clear()
          const hasForwardChange = i < ts.length && !trs[i + 1].isEmpty()
          const hasBackwardChange = i > 0 && !trs[i - 1].isEmpty()
          // go back and forth
          if (forward && hasBackwardChange) {
            forward = false
          } else if (!forward && hasForwardChange) {
            forward = true
          }
          forward ? i++ : i--
        }
      } while (madeChange)
    }
    return res
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
export const pipe = (...ts) => /** @type {any} */ (new Pipe(ts.flatMap(t => t instanceof Pipe ? t.templates : [t])))
