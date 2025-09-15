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
export const transformResultEmpty = transformResult(null, null)

/**
 * @template {any} State
 * @template {s.Unwrap<delta.$delta>} DeltaA
 * @template {s.Unwrap<delta.$delta>} DeltaB
 * @typedef {object} TransformerDef
 * @property {s.$Schema<DeltaA>} TransformerDef.$in
 * @property {s.$Schema<DeltaB>} TransformerDef.$out
 * @property {function (this: Template<State,DeltaA,DeltaB>): State} TransformerDef.state
 * @property {(deltaIn:NoInfer<DeltaA>,s:NoInfer<State>) => TransformResult<NoInfer<DeltaA>?,NoInfer<DeltaB>?>} TransformerDef.applyA
 * @property {(deltaOut:NoInfer<DeltaB>,s:NoInfer<State>) => TransformResult<NoInfer<DeltaA>?,NoInfer<DeltaB>?>} TransformerDef.applyB
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
     * Whether this transformer value has been initially consumebd by the parent transformer.
     */
    this._init = false
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
    return this.t._applyA(deltaA, this._state)
  }

  /**
   * @param {DeltaB} deltaB
   * @return {TransformResult<DeltaA?,DeltaB?>}
   */
  applyB (deltaB) {
    return this.t._applyB(deltaB, this._state)
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
    this._state = state
    /**
     * @type {typeof applyA}
     */
    this._applyA = applyA
    /**
     * @type {typeof applyB}
     */
    this._applyB = applyB
    /**
     * Cache for stateless transformers.
     *
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
    const s = this._state()
    if (s === null) {
      return (this._tr = new Transformer(this, s))
    }
    return new Transformer(this, s)
  }
}

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
 * @template {delta.AbstractDelta} DeltaA
 * @template {delta.AbstractDelta} DeltaB
 * @typedef {Template<any,DeltaA,DeltaB>|(
 *     DeltaB extends delta.Map<infer MKV>
 *       ? (MKV|DeltaB)
 *       : (DeltaB extends delta.DeltaArray<infer MArr> ? (MArr|DeltaB) : DeltaB))
 * } MaybeFixedTemplate
 */

/**
 * @template X
 * @typedef {X extends Template<any,any,infer D> ? (D extends delta.Value<infer V> ? V : D) : X} UnwrapTemplateForArray
 */

/**
 * @template {any} MaybeFixed
 * @typedef {MaybeFixed extends Template<any,any,any>
 *   ? MaybeFixed
 *   : Template<any,any,
 *     MaybeFixed extends delta.AbstractDelta
 *       ? MaybeFixed
 *       : (MaybeFixed extends Array<any>
 *         ? delta.DeltaArray<UnwrapTemplateForArray<MaybeFixed[number]>>
 *         : (MaybeFixed extends {[key:string]:any} ? delta.Map<MaybeFixed> : never))
 *   >
 * } MaybeFixedTemplateToTemplate
 */

/**
 * @template {MaybeFixedTemplate<any,any>} MaybeFixed
 * @param {MaybeFixed} maybeFixed
 * @return {MaybeFixed extends Template<any,any,any> ? MaybeFixed : Template<any,any,MaybeFixed extends delta.Delta ? MaybeFixed : delta.DeltaArray<MaybeFixed[keyof MaybeFixed]>>}
 */
export const maybeFixedToTemplate = maybeFixed => $templateAny.check(maybeFixed)
  ? /** @type {any} */ (maybeFixed)
  : (delta.$delta.check(maybeFixed)
      ? /** @type {any} */ (fixed(maybeFixed))
      : (s.$arrayAny.check(maybeFixed)
          ? /** @type {any} */ (fixed(delta.array().insert(maybeFixed).done()))
          : (s.$objectAny.check(maybeFixed) ? /** @type {any} */ (fixed(delta.map().setMany(maybeFixed).done())) : error.unexpectedCase())
        )
    )

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {Template<any,DeltaA,any>} Tr
 * @param {s.$Schema<DeltaA>} _$deltaA
 * @param {Tr} transformer
 * @return {<DA extends DeltaA>($d:s.$Schema<DA>) => Tr extends Template<any,any,infer DeltaB> ? Template<any,DA,DeltaB> : never}
 */
export const transformStatic = (_$deltaA, transformer) => () => /** @type {any} */ (transformer)

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
 * @template FixedContent
 * @param {FixedContent} fixedContent
 * @return {Template<any,any,FixedContent extends delta.AbstractDelta ? FixedContent : delta.Value<FixedContent>>}
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

/**
 * @template MaybeTemplate
 * @typedef {[MaybeTemplate] extends [Template<any,any,any>] ? MaybeTemplate : Template<any,any,
 *   [MaybeTemplate] extends [delta.AbstractDelta] ? MaybeTemplate : delta.Value<MaybeTemplate>
 * >} AnyToTemplate
 */

/**
 * @template {{ [key: string]: any }} MaybeTemplateMap
 * @typedef {{ [K in keyof MaybeTemplateMap]: AnyToTemplate<MaybeTemplateMap[K]> }} AnyMapToTemplate
 */

/**
 * @template {Array<any>} MaybeTemplateArray
 * @typedef {{ [K in keyof MaybeTemplateArray]: AnyToTemplate<MaybeTemplateArray[K]> }} AnyArrayToTemplate
 */

/**
 * @template {{ [key:string]: any }} T
 * @typedef {Template<
 *   any,
 *   AnyMapToTemplate<T>[keyof T] extends Template<any, infer DeltaA,any> ? DeltaA : never,
 *   delta.Map<{ [K in keyof T]: AnyToTemplate<T[K]> extends Template<any, any, infer DeltaB>
 *     ? (DeltaB extends delta.Value<infer V> ? V : DeltaB) : AnyToTemplate<T[K]> }>
 *  >} MapDefToTemplate
 */

/**
 * @template {{ [key:string]: any }} T
 * @param {T} definition
 * @return {MapDefToTemplate<T> extends Template<any,infer A,infer B> ? Template<any,A,B> : never}
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
 * @return {TransformResult<delta.AbstractDelta?,delta.Map<any>?>}
 */
const _applyMapOpHelper = (state, reverseAChanges) => {
  /**
     * @type {TransformResult<delta.AbstractDelta?,delta.MapBuilder<any>?>}
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
    const s = state[key]
    if (s._pb) {
      if (s._init) {
        bRes.modify(key, s._pb)
      } else {
        s._init = true
        bRes.set(key, s._pb)
      }
    }
  }
  if (bRes._changes.size > 0) {
    // opt values (iff delta is of type DeltaValue, map the change to the map)
    bRes._changes.forEach((change, key) => {
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
 * @todo This is similar to dt.map. Consider the similarities and try to merge them.
 *
 * @template {Array<any>} T
 * @param {T} definition
 * @return {Template<
 *   any,
 *   AnyArrayToTemplate<T>[number] extends Template<any, infer DeltaA, any> ? DeltaA : never,
 *   delta.DeltaArray<AnyArrayToTemplate<T>[number] extends Template<any, any, infer DeltaB> ? delta.ValueUnwrap<DeltaB> : never>
 * >}
 */
export const array = (definition) => {
  /**
   * @type {Array<Template<any,any,any>>}
   */
  const def = []
  for (let i = 0; i < definition.length; i++) {
    const d = definition[i]
    def[i] = $templateAny.check(d) ? d : fixed(d)
  }
  return /** @type {any} */ (template({
    $in: s.$any,
    $out: delta.$arrayAny,
    state: () => {
      const arrState = /** @type {Transformer<any,any,any>[]} */ ([])
      for (let i = 0; i < def.length; i++) {
        arrState[i] = def[i].init()
      }
      return /** @type {(T extends Template<any,infer SDIn, infer SDOut> ? Transformer<any, SDIn, SDOut>: never)[]} */ (arrState)
    },
    applyA: (d, state) => {
      return _applyArrayOpHelper(state, [{ d, src: null }])
    },
    applyB: (d, state) => {
      s.assert(d, delta.$arrayAny)
      /**
       * @type {Array<{ d: delta.AbstractDelta, src: Transformer<any,any,any>? }>}
       */
      const reverseAChanges = []
      d.forEach((op, index) => {
        if (delta.$deleteOp.check(op) || delta.$insertOp.check(op)) {
          error.unexpectedCase()
        } else if (delta.$modifyOp.check(op)) {
          const src = state[index]
          const res = src.applyB(op.modify)
          src._pa = res.a
          src._pb = res.b
          if (res.a != null) {
            reverseAChanges.push({ d: res.a, src })
          }
        }
      })
      return _applyArrayOpHelper(state, reverseAChanges)
    }
  }))
}

/**
 * @param {Transformer<any, any, any>[]} state
 * @param {Array<{ d: delta.AbstractDelta, src: Transformer<any,any,any>? }>} reverseAChanges
 * @return {TransformResult<delta.AbstractDelta?,delta.DeltaArray<any>?>}
 */
const _applyArrayOpHelper = (state, reverseAChanges) => {
  /**
     * @type {TransformResult<delta.AbstractDelta?,delta.DeltaArray<any>?>}
     */
  const applyResult = transformResult(null, null)
  while (reverseAChanges.length > 0) {
    /**
     * @type {Array<{ d: delta.AbstractDelta, src: Transformer<any,any,any>? }>}
     */
    let nextReverseAChanges = []
    for (let i = 0; i < state.length; i++) {
      const s = state[i]
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
  const bRes = delta.array()
  let performedChange = false
  for (let i = 0; i < state.length; i++) {
    const s = state[i]
    let spb = s._pb
    if (spb) {
      if (delta.$valueAny.check(spb)) {
        spb = spb.get()
      }
      if (s._init) {
        bRes.modify(spb)
      } else {
        s._init = true
        bRes.insert([spb])
      }
      performedChange = true
    } else {
      bRes.retain(1)
    }
  }
  if (performedChange) {
    applyResult.b = bRes.done()
  }
  return applyResult
}

/**
 * @param {TransformResult<delta.AbstractDelta?, delta.Node<any,any,any>>} res
 * @param {{ attrs: Transformer<any,any,any>, children: Transformer<any,any,any> }} state
 * @param {delta.AbstractDelta?} nextAAttrs
 * @param {delta.AbstractDelta?} nextAChildren
 */
const _nodeApplyA = (res, state, nextAAttrs, nextAChildren) => {
  while (nextAAttrs != null && nextAChildren != null) {
    const resChildren = state.children.applyA(nextAChildren)
    const resAttrs = state.attrs.applyA(delta.mergeDeltas(nextAAttrs, resChildren.a))
    nextAChildren = resAttrs.a
    nextAAttrs = null
    res.a = delta.mergeDeltas(delta.mergeDeltas(res.a, resChildren.a), resAttrs.a)
    resChildren.b && res.b.children.apply(resChildren.b)
    resAttrs.b && res.b.attributes.apply(resAttrs.b)
  }
}

/**
 * @template {{ [key:string]: any } | Template<any,any,delta.Map<any>>} T
 * @typedef {T extends Template<any,any,any> ? T : MapDefToTemplate<T>} MapOrMapDefToTemplate
 */

/**
 * @template {string} NodeName
 * @template {{ [key:string]:any } | Template<any,any,delta.Map<any>>} Attrs - accepts map or map definition
 * @template {Template<any,any,delta.DeltaArray<any>> | Array<any>} Children
 * @param {NodeName} name
 * @param {Attrs} attributes
 * @param {Children} children
 * @return {Template<
 *   any,
 *   MapOrMapDefToTemplate<Attrs> extends Template<any, infer A, any> ? A : never,
 *   delta.Node<
 *     NodeName,
 *     MapOrMapDefToTemplate<Attrs> extends Template<any,any,delta.Map<infer M>> ? M : never,
 *     MaybeFixedTemplateToTemplate<Children> extends Template<any,any,delta.DeltaArray<infer BChildren>> ? BChildren : never,
 *     'done'
 *   >
 * >}
 */
export const node = (name, attributes, children) => {
  const attrs = $templateAny.check(attributes) ? attributes : map(attributes)
  const childs = maybeFixedToTemplate(children)
  return template({
    $in: s.$any,
    $out: delta.$node(s.$literal(name), s.$any, s.$any),
    state: () => ({
      attrs: attrs.init(),
      children: childs.init()
    }),
    applyA: (d, state) => {
      const res = transformResult(null, delta.node(name))
      _nodeApplyA(res, state, d, d)
      return res
    },
    applyB: (d, state) => {
      s.assert(d, delta.$nodeAny)
      const res = transformResult(null, delta.node(name))
      const childrenRes = state.children.applyB(d.children)
      const attrsRes = state.attrs.applyB(d.attributes)
      attrsRes.b && res.b.attributes.apply(attrsRes.b)
      childrenRes.b && res.b.children.apply(childrenRes.b)
      _nodeApplyA(res, state, childrenRes.a, attrsRes.a)
      return res
    }
  })
}

/**
 * @template {any} D
 * @template {string[]} Path
 * @typedef {Path extends []
 *   ? D
 *   : Path extends [infer P, ...infer PRest]
 *     ? (
 *       P extends string ? (D extends delta.Map<{ [K in P]: infer V }> ? QueryFollowPath<V,PRest extends string[] ? PRest : never> : never) : never
 *     )
 *     : never
 * } QueryFollowPath
 */

/**
 * @template {Array<string>} Path
 * @typedef {Path extends [infer P, ...infer PRest] ? delta.Map<{ [K in (P extends string ? P : any)]: PathToDelta<PRest extends Array<string> ? PRest : any> }> : any} PathToDelta
 */

/**
 * @template {Array<string>} Path
 * @param {Path} path
 * @return {<DA extends PathToDelta<Path>>($in: s.$Schema<DA>) => Template<any, DA, delta.Value<QueryFollowPath<DA,Path>>>}
 */
export const query = (...path) => transformStatic(s.$any, template({
  $in: delta.$delta,
  $out: delta.$valueAny,
  state: () => null,
  applyA: (d) => {
    /**
     * @type {delta.Map<any>?}
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
