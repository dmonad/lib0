import * as error from '../error.js'
import * as delta from './index.js'
import * as s from '../schema.js'

/**
 * Creates a transformer template after receiving schema for DeltaA.
 *
 * @template {delta.AbstractDelta} DeltaA
 * @typedef {<DA extends DeltaA> ($deltaA: s.$Schema<DA>) => Template<any,DA,any>} TransformerFactory
 */

/**
 * @template {TransformerFactory<any>} T
 * @template {delta.AbstractDelta} DeltaA
 * @typedef {T extends (($deltaA: s.$Schema<DeltaA>) => Template<any,DeltaA,infer DeltaB>) ? DeltaB : never } DeltaBFromTransformerFactory
 */

/**
 * @template {s.Unwrap<delta.$delta>|null} [DeltaA=s.Unwrap<delta.$delta>|null]
 * @template {s.Unwrap<delta.$delta>|null} [DeltaB=s.Unwrap<delta.$delta>|null]
 * @typedef {{ a: DeltaA, b: DeltaB }} TransformResult
 */

/**
 * @template {s.Unwrap<delta.$delta>|null} DeltaA
 * @template {s.Unwrap<delta.$delta>|null} DeltaB
 * @param {DeltaA} a
 * @param {DeltaB} b
 * @return {TransformResult<DeltaA,DeltaB>}
 */
export const transformResult = (a, b) => ({ a, b })
export const transformResultEmpty = transformResult(null,null)

/**
 * @template {any} State
 * @template {s.Unwrap<delta.$delta>} DeltaA
 * @template {s.Unwrap<delta.$delta>} DeltaB
 * @typedef {object} TransformerDef
 * @property {s.$Schema<DeltaA>} TransformerDef.$in
 * @property {s.$Schema<DeltaB>} TransformerDef.$out
 * @property {function (this: Template<State,DeltaA,DeltaB>): State} TransformerDef.state
 * @property {(deltaIn:NoInfer<DeltaA>,s:NoInfer<State>,tdef:TransformerDef<State,DeltaA,DeltaB>) => TransformResult<NoInfer<DeltaA>?,NoInfer<DeltaB>?>} TransformerDef.applyA
 * @property {(deltaOut:NoInfer<DeltaB>,s:NoInfer<State>,tdef:TransformerDef<State,DeltaA,DeltaB>) => TransformResult<NoInfer<DeltaA>?,NoInfer<DeltaB>?>} TransformerDef.applyB
 */

/**
 * A Delta Transformer ensures that it keeps two sources A and B in-sync, even if they use a
 * different update format.
 *
 * @template {any} State
 * @template {s.Unwrap<typeof delta.$delta>} DeltaA
 * @template {s.Unwrap<typeof delta.$delta>} DeltaB
 */
class Transformer {
  /**
   * @param {Template<State,DeltaA,DeltaB>} t
   * @param {State} s
   */
  constructor (t, s) {
    this.t = t
    this._state = s
    /**
     * Pending a op, for internal use only
     * @type {DeltaA?}
     */
    this._pa = null
    /**
     * Pending a op, for internal use only
     * @type {DeltaB?}
     */
    this._pb = null
    /**
     * @type {Transformer<any,any,any>?}
     */
    this.parent = null
  }

  /**
   * @param {DeltaA} deltaA
   * @return {TransformResult<DeltaA?,DeltaB?>}
   */
  applyA (deltaA) {
    return this.t.applyA(deltaA, this._state, this.t)
  }

  /**
   * @param {DeltaB} deltaB
   * @return {TransformResult<DeltaA?,DeltaB?>}
   */
  applyB (deltaB) {
    return this.t.applyB(deltaB, this._state, this.t)
  }
}

/**
 * @param {Array<Transformer<any,delta.AbstractDelta,delta.AbstractDelta>>} trs
 * @param {TransformResult} output
 * @return {boolean}
 */
const _forwardPipe = (trs, output) => {
  let again = false
  for (let i = 0; i < trs.length; i++) {
    const tr = trs[i]
    if (tr._pa === null) continue
    const { a, b } = tr.applyA(tr._pa)
    tr._pa = null
    if (a !== null) {
      if (i === 0) {
        output.a = delta.mergeDeltas(output.a, a)
      } else {
        // need to interate back to integrate the produced backwards-change
        again = true
        trs[i - 1]._pb = a
      }
    }
    if (b !== null) {
      if (i === trs.length - 1) {
        output.b = delta.mergeDeltas(output.b, b)
      } else {
        trs[i + 1]._pa = b
      }
    }
  }
  return again
}

/**
 * @param {Array<Transformer<any,delta.AbstractDelta,delta.AbstractDelta>>} trs
 * @param {TransformResult} output
 * @return {boolean}
 */
const _backwardPipe = (trs, output) => {
  let again = false
  for (let i = trs.length - 1; i >= 0; i--) {
    const tr = trs[i]
    if (tr._pb === null) continue
    const { a, b } = tr.applyA(tr._pb)
    tr._pb = null
    if (a !== null) {
      if (i === 0) {
        output.a = delta.mergeDeltas(output.a, a)
      } else {
        // need to interate back to integrate the produced backwards-change
        trs[i - 1]._pb = a
      }
    }
    if (b !== null) {
      if (i === trs.length - 1) {
        output.b = delta.mergeDeltas(output.b, b)
      } else {
        // need to interate back to integrate the produced backwards-change
        again = true
        trs[i + 1]._pa = a
      }
    }
  }
  return again
}

/**
 * @template State
 * @template {s.Unwrap<typeof delta.$delta>} DeltaA
 * @template {s.Unwrap<typeof delta.$delta>} DeltaB
 */
export class Template {
  /**
   * @param {TransformerDef<State,DeltaA,DeltaB>} def
   */
  constructor ({ $in, $out, state, applyA, applyB }) {
    /**
     * @type {s.$Schema<DeltaA>}
     */
    this.$in = $in
    /**
     * @type {s.$Schema<DeltaB>}
     */
    this.$out = $out
    /**
     * @type {() => State}
     */
    this.state = state
    /**
     * @type {typeof applyA}
     */
    this.applyA = applyA
    /**
     * @type {typeof applyB}
     */
    this.applyB = applyB
    /**
     * @type {Transformer<State,DeltaA,DeltaB>?}
     */
    this._tr = null
  }

  /**
   * @template {delta.AbstractDelta} R
   * @param {($d: s.$Schema<DeltaB>) => Template<any,DeltaB,R>} t
   * @return {Template<any,DeltaA,R>}
   */
  pipe (t) {
    /**
     * @type {TransformerPipeTemplate<any,any>}
     */
    const tpipe = new TransformerPipeTemplate()
    tpipe.templates.push(this, t(this.$out))
    return tpipe
  }

  init () {
    if (this._tr != null) return this._tr
    // reuse stateless transformers
    const s = this.state()
    if (s === null) {
      return (this._tr = new Transformer(this, s))
    }
    return new Transformer(this, s)
  }
}

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {Template<any,DeltaA,any>} Tr
 * @param {s.$Schema<DeltaA>} $deltaA
 * @param {Tr} transformer
 * @return {<DA extends DeltaA>($d:s.$Schema<DA>) => Tr extends Template<any,any,infer DeltaB> ? Template<any,DA,DeltaB> : never}
 */
export const transformStatic = ($deltaA, transformer) => () => /** @type {any} */ (transformer)

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {<DA extends DeltaA> ($deltaA: s.$Schema<DA>) => Template<any,DA,any>} TF
 * @param {s.$Schema<DeltaA>} _$deltaA
 * @param {TF} transformerFactory
 * @return {TF}
 */
export const transform = (_$deltaA, transformerFactory) => transformerFactory

/**
 * @type {TransformerDef<any,any,any>}
 */
const pipeTemplateDef = {
  $in: s.$any,
  $out: s.$any,
  state: function () { return /** @type {TransformerPipeTemplate<any,any>} */ (/** @type {unknown} */ (this)).templates.map(t => t.init()) },
  applyA: (dchange, trs) => {
    const output = transformResult(null, null)
    let again = true
    trs[0]._pa = dchange
    while (again) {
      // apply forwards
      again = _forwardPipe(trs, output)
      // iterate back
      if (again) {
        again = _backwardPipe(trs, output)
      }
    }
    return output
  },
  applyB: (dchange, trs) => {
    const output = transformResult(null, null)
    let again = true
    trs[trs.length - 1]._pb = dchange
    while (again) {
      // iterate back
      again = _backwardPipe(trs, output)
      // apply forwards
      if (again) {
        again = _forwardPipe(trs, output)
      }
    }
    return output
  }
}

/**
 * @todo just have something like "previousTemplate" to implement pipe. This can be assembled when
 * init the template.
 * @template {s.Unwrap<typeof delta.$delta>} DeltaA
 * @template {s.Unwrap<typeof delta.$delta>} DeltaB
 * @extends {Template<any,DeltaA,DeltaB>}
 */
class TransformerPipeTemplate extends Template {
  constructor () {
    super(pipeTemplateDef)
    /**
     * @type {Array<Template<any,DeltaA,DeltaB>>}
     */
    this.templates = []
  }

  /**
   * @template {delta.AbstractDelta} R
   * @param {($d: s.$Schema<DeltaB>) => Template<any,DeltaB,R>} t
   * @return {Template<any,DeltaA,R>}
   */
  pipe (t) {
    /**
     * @type {TransformerPipeTemplate<any,any>}
     */
    const tpipe = new TransformerPipeTemplate()
    tpipe.templates = this.templates.slice()
    tpipe.templates.push(t(this.$out))
    return /** @type {any} */ (tpipe)
  }
}

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {delta.AbstractDelta} DeltaB
 * @template {delta.AbstractDelta} DeltaC
 * @param {($s: s.$Schema<DeltaA>) => Template<any,DeltaA,DeltaB>} t1
 * @param {($s: s.$Schema<DeltaB>) => Template<any,DeltaB,DeltaC>} t2
 * @return {($d: s.$Schema<DeltaA>) => Template<any,DeltaA,DeltaC>}
 */
export const pipe = (t1, t2) => ($d) => {
  /**
   * @type {TransformerPipeTemplate<any,any>}
   */
  const tpipe = new TransformerPipeTemplate()
  const t1t = t1($d)
  tpipe.templates.push(t1t, t2(t1t.$out))
  return tpipe
}

/**
 * @template {any} State
 * @template {s.Unwrap<typeof delta.$delta>} DeltaIn
 * @template {s.Unwrap<typeof delta.$delta>} DeltaOut
 * @param {TransformerDef<State,DeltaIn,DeltaOut>} def
 * @return {Template<State,DeltaIn,DeltaOut>}
 */
export const template = def => new Template(/** @type {any} */ (def))

/**
 * @template {any} MaybeTemplate
 * @typedef {MaybeTemplate extends Template<any,any,any> ? MaybeTemplate : Template<any,any,delta.DeltaValue<MaybeTemplate>>} AnyToTemplate
 */

/**
 * @template {{ [key: string]: any }} MaybeTemplateMap
 * @typedef {{ [K in keyof MaybeTemplateMap]: AnyToTemplate<MaybeTemplateMap[K]> }} AnyMapToTemplate
 */

/**
 * @template {{ [key:string]: any }} T
 * @param {T} definition
 * @return {Template<
 *   any,
 *   AnyMapToTemplate<T>[keyof T] extends Template<any, infer DeltaA,any> ? DeltaA : never,
 *   delta.DeltaMap<{ [K in keyof T]: AnyToTemplate<T[K]> extends Template<
 *     any,
 *     AnyMapToTemplate<T>[keyof T] extends Template<any,infer DeltaA,any> ? DeltaA : never,
 *     infer DeltaB
 *   > ? (DeltaB extends delta.DeltaValue<infer V> ? V : DeltaB) : never }>
 * >}
 */
export const map = (definition) => {
  /**
   * @type {{ [key:string]: Template<any,any,any> }}
   */
  const def = {}
  for (const key in definition) {
    const d = definition[key]
    def[key] = $templateAny.check(d) ? d : fixed(d)
  }
  return template({
    $in: s.$any,
    $out: s.$any,
    state: () => {
      const mapState = /** @type {{ [key: string]: Transformer<any,any,any> }} */ ({})
      for (const key in def) {
        mapState[key] = def[key].init()
      }
      return /** @type {{ [key in keyof T]: T extends Template<any,infer SDIn, infer SDOut> ? Transformer<any, SDIn, SDOut>: never }} */ (mapState)
    },
    applyA: (d, state) => {
      return _applyMapOpHelper(state, [{ d, src: null }])
    },
    applyB: (d, state) => {
      s.assert(d, delta.$mapAny)
      /**
       * @type {Array<{ d: delta.AbstractDelta, src: Transformer<any,any,any>? }>}
       */
      const reverseAChanges = []
      d.forEach(op => {
        if (delta.$deleteOp.check(op)) {
          error.unexpectedCase()
        }
        const src = state[op.key]
        const res = src.applyB(op.value)
        src._pa = res.a
        src._pb = res.b
        if (res.a != null) {
          reverseAChanges.push({ d: res.a, src })
        }
      })
      return _applyMapOpHelper(state, reverseAChanges)
    }
  })
}

/**
 * @param {{ [key: string]: Transformer<any, any, any> }} state
 * @param {Array<{ d: delta.AbstractDelta, src: Transformer<any,any,any>? }>} reverseAChanges
 * @return {TransformResult<delta.AbstractDelta?,delta.DeltaMap<any>?>}
 */
const _applyMapOpHelper = (state, reverseAChanges) => {
  /**
     * @type {TransformResult<delta.AbstractDelta?,delta.DeltaMapBuilder<any>?>}
     */
  const applyResult = transformResult(null, null)
  while (reverseAChanges.length > 0) {
    /**
     * @type {Array<{ d: delta.AbstractDelta, src: Transformer<any,any,any>? }>}
     */
    let nextReverseAChanges = []
    for (const key in state) {
      const s = state[key]
      let transformPriority = false // false until own is found
      for (let i = 0; i < reverseAChanges.length; i++) {
        // changes are applied in reverseAChanges order.
        // rebase against all concurrent (the op stored on transformer), then apply
        const r = reverseAChanges[i]
        if (r.src === s) {
          transformPriority = true // own has less priority, concurrent is applied with higher prio
          continue // don't apply own
        }
        let rd = r.d
        if (s._pa != null) {
          rd = rd.clone()
          rd.rebase(s._pa, transformPriority)
        }
        const res = s.applyA(rd)
        s._pa = res.a
        s._pb = delta.mergeDeltas(s._pb, res.b)
        if (res.a != null) {
          nextReverseAChanges.push({ d: res.a, src: s })
        }
      }
    }
    // merge changes for output
    for (let i = 0; i < nextReverseAChanges.length; i++) {
      applyResult.a = delta.mergeDeltas(applyResult.a, nextReverseAChanges[i].d)
    }
    reverseAChanges = nextReverseAChanges
    nextReverseAChanges = []
  }
  // accumulate b changes stored on transformers
  const bRes = delta.map()
  for (const key in state) {
    const b = state[key]._pb
    if (b) bRes.modify(key, b)
  }
  if (bRes.changes.size > 0) {
    // opt values (iff delta is of type DeltaValue, map the change to the map)
    bRes.changes.forEach((change, key) => {
      if (delta.$valueAny.check(change.value)) {
        const changeOp = change.value.change
        if (delta.$insertOp.check(changeOp) || delta.$modifyOp.check(changeOp)) {
          bRes.set(key, changeOp.value)
        } else if (delta.$deleteOp.check(changeOp)) {
          bRes.delete(key)
        } else {
          error.unexpectedCase()
        }
      }
    })
    applyResult.b = bRes
  }
  return applyResult
}

/**
 * @template {any} D
 * @template {string[]} Path
 * @typedef {Path extends []
 *   ? D
 *   : Path extends [infer P, ...infer PRest]
 *     ? (
 *       P extends string ? (D extends delta.DeltaMap<{ [K in P]: infer V }> ? QueryFollowPath<V,PRest extends string[] ? PRest : never> : never) : never
 *     )
 *     : never
 * } QueryFollowPath
 */

/**
 * @template {Array<string>} Path
 * @typedef {Path extends [infer P, ...infer PRest] ? delta.DeltaMap<{ [K in (P extends string ? P : any)]: PathToDelta<PRest extends Array<string> ? PRest : any > }> : any} PathToDelta
 */

/**
 * @template {Array<string>} Path
 * @param {Path} path
 * @return {<DA extends PathToDelta<Path>>($in: s.$Schema<DA>) => Template<any, DA, delta.DeltaValue<QueryFollowPath<DA,Path>>>}
 */
export const query = (...path) => transformStatic(s.$any, template({
  $in: delta.$delta,
  $out: delta.$valueAny,
  state: () => null,
  applyA: (d) => {
    /**
     * @type {delta.DeltaMap<any>?}
     */
    let cd = delta.$mapAny.cast(d)
    let overwritten = false
    for (let i = 0; i < path.length && cd != null; i++) {
      if (delta.$mapAny.check(d)) {
        const c = cd.get(path[i])
        if (delta.$insertOp.check(c)) {
          overwritten = true
          cd = c.value
        } else if (delta.$deleteOp.check(c)) {
          overwritten = true
          cd = null
          break
        } else if (delta.$modifyOp.check(c)) {
          cd = c.value
        }
      } else {
        cd = null
      }
    }
    const dv = delta.value()
    if (overwritten) {
      // @todo implement some kind of "ValueDelta" with insert, delete, modify ops. dmap is supposed
      // to automatically translate this.
      if (cd == null) {
        dv.delete()
      } else {
        dv.set(cd)
      }
    } else {
      dv.modify(delta)
    }
    return transformResult(null, dv)
  },
  applyB: (d) => {
    const dop = d.change
    let resD = delta.map()
    let i = path.length - 1
    const p = path[i]
    if (delta.$modifyOp.check(dop)) {
      resD.modify(p, dop.value)
    } else if (delta.$insertOp.check(dop)) {
      resD.set(p, dop.value)
    } else if (delta.$deleteOp.check(dop)) {
      resD.delete(p)
    }
    for (i--; i >= 0; i--) {
      const tmpDmap = delta.map()
      tmpDmap.modify(p, resD)
      resD = tmpDmap
    }
    return /** @type {TransformResult<any,null>} */ (transformResult(resD, null))
  }
}))

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {delta.AbstractDelta} DeltaB
 * @param {s.$Schema<DeltaA>} $deltaA
 * @param {s.$Schema<DeltaB>} $deltaB
 * @return {s.$Schema<Template<any,DeltaA,DeltaB>>}
 */
export const $template = ($deltaA, $deltaB) => /** @type {s.$Schema<Template<any,any,any>>} */ (s.$instanceOf(Template, o => o.$in.extends($deltaA) && o.$out.extends($deltaB)))
export const $templateAny = /** @type {s.$Schema<Template<any,any,any>>} */ (s.$instanceOf(Template))

/**
 * @template {string|any} FixedContent
 * @param {FixedContent} fixedContent
 * @return {Template<any,any,FixedContent extends delta.AbstractDelta ? FixedContent : delta.DeltaValue<FixedContent>>}
 */
export const fixed = fixedContent => {
  const staticDelta = delta.$delta.check(fixedContent) ? fixedContent : delta.value().set(fixedContent).done()
  return template({
    $in: s.$any,
    $out: s.$any,
    state: () => ({ e: false }),
    applyA: (_d, s) => {
      if (!s.e) {
        s.e = true
        return transformResult(null, staticDelta)
      }
      return transformResultEmpty
    },
    applyB: () => {
      // @todo should reverse the change and give back
      error.unexpectedCase()
    }
  })
}
