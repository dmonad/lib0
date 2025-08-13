import * as error from '../error.js'
import * as delta from './index.js'
import * as s from '../schema.js'

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

/**
 * @template {any} State
 * @template {s.Unwrap<delta.$delta>} DeltaA
 * @template {s.Unwrap<delta.$delta>} DeltaB
 * @typedef {object} TransformerDef
 * @property {s.$Schema<DeltaA>} TransformerDef.$in
 * @property {s.$Schema<DeltaB>} TransformerDef.$out
 * @property {function (this: TransformerTemplate<State,DeltaA,DeltaB>): State} TransformerDef.state
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
   * @param {TransformerTemplate<State,DeltaA,DeltaB>} t
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
class TransformerTemplate {
  /**
   * @param {TransformerDef<State,DeltaA,DeltaB>} def
   */
  constructor ({ $in, $out, state, applyA, applyB }) {
    this.$in = $in
    this.$out = $out
    this.state = state
    this.applyA = applyA
    this.applyB = applyB
    /**
     * @type {Transformer<State,DeltaA,DeltaB>?}
     */
    this._tr = null
  }

  /**
   * @template {s.Unwrap<typeof delta.$delta>} TOut
   * @param {TransformerTemplate<any,DeltaB,TOut>} t
   * @return {TransformerTemplate<any,DeltaA,TOut>}
   */
  pipe (t) {
    /**
     * @type {TransformerPipeTemplate<any,any>}
     */
    const tpipe = new TransformerPipeTemplate()
    tpipe.templates.push(this, t)
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
 * Creates a transformer template after receiving schema for DeltaA.
 *
 * @template {delta.AbstractDelta} DeltaA
 * @typedef {($deltaA: DeltaA) => TransformerTemplate<any,DeltaA,any>} TransformerFactory
 */

/**
 * @template {TransformerFactory<any>} T
 * @template {delta.AbstractDelta} DeltaA
 * @typedef {T extends (($deltaA: DeltaA) => TransformerTemplate<any,DeltaA,infer DeltaB>) ? DeltaB : never } DeltaBFromTransformerFactory
 */

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {<DA extends DeltaA> ($deltaA: s.$Schema<DA>) => TransformerTemplate<any,DA,any>} TF
 * @param {s.$Schema<DeltaA>} $deltaA
 * @param {TF} transformerFactory
 * @return {TF}
 */
const defineTransformer = ($deltaA, transformerFactory) => transformerFactory

const q = defineTransformer(delta.$deltaMap(s.$object({ x: s.$number })), $d => id($d))

q(delta.$deltaMap(s.$object({ x: s.$number })))

/**
 * @type {TransformerDef<any,any,any>}
 */
const pipeTemplateDef = {
  $in: s.$any,
  $out: s.$any,
  state: function () { return /** @type {TransformerPipeTemplate<any,any>} */ (this).templates.map(t => t.init()) },
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
 * @extends {TransformerTemplate<any,DeltaA,DeltaB>}
 */
class TransformerPipeTemplate extends TransformerTemplate {
  constructor () {
    super(pipeTemplateDef)
    /**
     * @type {Array<TransformerTemplate<any,DeltaA,DeltaB>>}
     */
    this.templates = []
  }

  /**
   * @template {TransformerTemplate<any,DeltaB,any>} T
   * @param {T} t
   * @return {T extends TransformerTemplate<any,any,infer TOut> ? TransformerTemplate<any, DeltaA, TOut> : never}
   */
  pipe (t) {
    /**
     * @type {TransformerPipeTemplate<any,any>}
     */
    const tpipe = new TransformerPipeTemplate()
    tpipe.templates = this.templates.slice()
    tpipe.templates.push(t)
    return /** @type {any} */ (tpipe)
  }
}

/**
 * @template {any} State
 * @template {s.Unwrap<typeof delta.$delta>} DeltaIn
 * @template {s.Unwrap<typeof delta.$delta>} DeltaOut
 * @param {TransformerDef<State,DeltaIn,DeltaOut>} def
 * @return {TransformerTemplate<State,DeltaIn,DeltaOut>}
 */
export const transformer = def => new TransformerTemplate(/** @type {any} */ (def))

/**
 * @template {{ [key:string]: TransformerFactory<any, any>}} T
 * @param {T} def
 * @return {<DeltaA> ($deltaA: DeltaA) => TransformerTemplate<any, DeltaA, delta.DeltaMap<{ [K in keyof T]: T[K] extends TransformerFactory<DeltaA, infer DeltaB> ? DeltaB : never }>>}
 */
export const mapho = (def) => ($deltaA) => transformer({
  $in: s.$any,
  $out: s.$any,
  state: () => {
    const mapState = /** @type {{ [key: string]: Transformer<any,any,any> }} */ ({})
    for (const key in def) {
      mapState[key] = def[key]($deltaA).init()
    }
    return /** @type {{ [key in keyof T]: T extends TransformerTemplate<any,infer SDIn, infer SDOut> ? Transformer<any, SDIn, SDOut>: never }} */ (mapState)
  },
  applyA: (d, state, def) => {
    return _applyMapOpHelper(state, [{ d, src: null }])
  },
  applyB: (d, state, def) => {
    s.assert(d, delta.$deltaMap(s.$any))
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

/**
 * @template {delta.AbstractDelta} DeltaA
 * @template {delta.AbstractDelta} DeltaB
 * @param {s.$Schema<DeltaA>} $deltaA
 * @param {TransformerFactory<DeltaA,DeltaB>} gen
 * @return {TransformerFactory<DeltaA, DeltaB>}
 */
export const createHOTransformerTemplate = ($deltaA, gen) => gen

/**
 * @template {{ [key:string]: TransformerTemplate<any, any, any>}} T
 * @param {T} def
 * @return {TransformerTemplate<any, T[keyof T] extends TransformerTemplate<any,infer DIn,any> ? DIn : never, delta.DeltaMap<{ [K in keyof T]: T[K] extends TransformerTemplate<any, any, infer DOut> ? DOut : never }>>}
 */
export const map = (def) => transformer({
  $in: s.$any,
  $out: s.$any,
  state: () => {
    const mapState = /** @type {{ [key: string]: Transformer<any,any,any> }} */ ({})
    for (const key in def) {
      mapState[key] = def[key].init()
    }
    return /** @type {{ [key in keyof T]: T extends TransformerTemplate<any,infer SDIn, infer SDOut> ? Transformer<any, SDIn, SDOut>: never }} */ (mapState)
  },
  applyA: (d, state, def) => {
    return _applyMapOpHelper(state, [{ d, src: null }])
  },
  applyB: (d, state, def) => {
    s.assert(d, delta.$deltaMap(s.$any))
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

/**
 * @template {{ [key:string]: TransformerTemplate<any, any, any>}} T
 * @param {{ [key in keyof T]: T extends TransformerTemplate<any,infer SDIn, infer SDOut> ? Transformer<any, SDIn, SDOut>: never }} state
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
  applyResult.b = delta.createDeltaMap()
  for (const key in state) {
    const b = state[key]._pb
    if (b) applyResult.b.modify(key, b)
  }
  return applyResult
}

/**
 * @todo remove this superfluous transformer
 * @template {delta.AbstractDelta} Delta
 * @param {s.$Schema<Delta>} $in
 * @return {TransformerTemplate<null,Delta,Delta>}
 */
export const id = $in => transformer({
  $in: $in,
  $out: s.$any,
  state: () => null,
  applyA: (d, state, def) => {
    return transformResult(null, d)
  },
  applyB: (d, state, def) => {
    return transformResult(d, null)
  }
})

/**
 * @template {delta.AbstractDelta} D
 * @template {Array<string>} Path
 * @typedef {Path extends [infer P, infer PRest] ? (P extends string ? (D extends delta.DeltaMap<infer V> ? V[P] : never) : never) : D } QueryFollowPath
 */

/**
 * @template {Array<string>} Path
 * @typedef {Path extends [infer P, ...infer PRest] ? delta.DeltaMap<{ [K in (P extends string ? P : any)]: PathToDelta<PRest extends Array<string> ? PRest : any > }> : any} PathToDelta
 */

/**
 * @template {Array<string>} Path
 * @param {Path} path
 * @return {<DA extends PathToDelta<Path>> ($in: s.$Schema<DA>) => TransformerTemplate<Path, DA, QueryFollowPath<DA,Path>>}
 */
export const query = (...path) => $in => transformer({
  $in,
  $out: s.$any,
  state: () => path,
  applyA: (d, path, def) => {
    /**
     * @type {delta.DeltaMap<any>?}
     */
    let cd = d
    let overwritten = false
    for (let i = 0; i < path.length && cd != null; i++) {
      if (delta.$deltaMap.check(d)) {
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
    if (overwritten) {
      // @todo implement some kind of "ValueDelta" with insert, delete, modify ops. dmap is supposed
      // to automatically translate this.
      delta.create
    }
  },
  applyB: (d, state, def) => {
    error.methodUnimplemented()
  }
})

// @todo move this to tests
const xx = query('hi', 'there')(delta.$deltaMap(s.$object({ hi: delta.$deltaMap(s.$object({ there: s.$number})) })))

