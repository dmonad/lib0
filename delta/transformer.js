import * as error from '../error.js'
import * as d from './abstract.js'
import * as dmap from './map.js'
import * as s from '../schema.js'

/**
 * @template {s.Unwrap<d.$delta>|null} [DeltaA=s.Unwrap<d.$delta>|null]
 * @template {s.Unwrap<d.$delta>|null} [DeltaB=s.Unwrap<d.$delta>|null]
 * @typedef {{ a: DeltaA, b: DeltaB }} TransformResult
 */

/**
 * @template {s.Unwrap<d.$delta>|null} DeltaA
 * @template {s.Unwrap<d.$delta>|null} DeltaB
 * @param {DeltaA} a
 * @param {DeltaB} b
 * @return {TransformResult<DeltaA,DeltaB>}
 */
export const transformResult = (a, b) => ({ a, b })

/**
 * @template {any} State
 * @template {s.Unwrap<d.$delta>} DeltaA
 * @template {s.Unwrap<d.$delta>} DeltaB
 * @typedef {object} TransformerDef
 * @property {s.$Schema<DeltaA>} TransformerDef.$in
 * @property {s.$Schema<DeltaB>} TransformerDef.$out
 * @property {() => State} TransformerDef.state
 * @property {(deltaIn:NoInfer<DeltaA>,s:NoInfer<State>,tdef:TransformerDef<State,DeltaA,DeltaB>) => TransformResult<NoInfer<DeltaA>?,NoInfer<DeltaB>?>} TransformerDef.applyA
 * @property {(deltaOut:NoInfer<DeltaB>,s:NoInfer<State>,tdef:TransformerDef<State,DeltaA,DeltaB>) => TransformResult<NoInfer<DeltaA>?,NoInfer<DeltaB>?>} TransformerDef.applyB
 */

/**
 * A Delta Transformer ensures that it keeps two sources A and B in-sync, even if they use a
 * different update format.
 *
 * @template {any} State
 * @template {s.Unwrap<typeof d.$delta>} DeltaA
 * @template {s.Unwrap<typeof d.$delta>} DeltaB
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
 * @param {Array<Transformer<any,d.AbstractDelta,d.AbstractDelta>>} trs
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
        output.a = d.mergeDeltas(output.a, a)
      } else {
        // need to interate back to integrate the produced backwards-change
        again = true
        trs[i - 1]._pb = a
      }
    }
    if (b !== null) {
      if (i === trs.length - 1) {
        output.b = d.mergeDeltas(output.b, b)
      } else {
        trs[i + 1]._pa = b
      }
    }
  }
  return again
}

/**
 * @param {Array<Transformer<any,d.AbstractDelta,d.AbstractDelta>>} trs
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
        output.a = d.mergeDeltas(output.a, a)
      } else {
        // need to interate back to integrate the produced backwards-change
        trs[i - 1]._pb = a
      }
    }
    if (b !== null) {
      if (i === trs.length - 1) {
        output.b = d.mergeDeltas(output.b, b)
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
 * @template {s.Unwrap<typeof d.$delta>} DeltaA
 * @template {s.Unwrap<typeof d.$delta>} DeltaB
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
   * @template {s.Unwrap<typeof d.$delta>} TOut
   * @param {TransformerTemplate<any,DeltaB,TOut>} t
   * @return {TransformerTemplate<any,DeltaA,TOut>}
   */
  pipe (t) {
    return new TransformerPipeTemplate(this, t)
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
 * @template {s.Unwrap<typeof d.$delta>} DeltaA
 * @template {s.Unwrap<typeof d.$delta>} DeltaB
 * @extends {TransformerTemplate<any,DeltaA,DeltaB>}
 */
class TransformerPipeTemplate extends TransformerTemplate {
  /**
   * @param {TransformerTemplate<any,DeltaA,any>} t1
   * @param {TransformerTemplate<any,any,DeltaB>} t2
   */
  constructor (t1, t2) {
    const templates = [t1, t2]
    super({
      $in: t1.$in,
      $out: t2.$out,
      state: () => templates.map(t => t.init()),
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
    })
    this.templates = templates
  }

  /**
   * @template {TransformerTemplate<any,DeltaB,any>} T
   * @param {T} t
   * @return {T extends TransformerTemplate<any,any,infer TOut> ? TransformerTemplate<any, DeltaA, TOut> : never}
   */
  pipe (t) {
    this.templates.push(t)
    if (this.$out.extends(t.$out)) error.create('piped schema does not match')
    this.$out = t.$out
    return /** @type {any} */ (this)
  }
}

/**
 * @template {any} State
 * @template {s.Unwrap<typeof d.$delta>} DeltaIn
 * @template {s.Unwrap<typeof d.$delta>} DeltaOut
 * @param {TransformerDef<State,DeltaIn,DeltaOut>} def
 * @return {TransformerTemplate<State,DeltaIn,DeltaOut>}
 */
export const transformer = def => new TransformerTemplate(/** @type {any} */ (def))

/**
 * @template {{ [key:string]: TransformerTemplate<any, any, any>}} T
 * @param {T} def
 * @return {TransformerTemplate<any, T[keyof T] extends TransformerTemplate<any,infer DIn,any> ? DIn : never, dmap.DeltaMap<{ [K in keyof T]: T[K] extends TransformerTemplate<any, any, infer DOut> ? DOut : never }>>}
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
    s.assert(d, dmap.$deltaMap(s.$any))
    /**
     * @type {Array<{ d: d.AbstractDelta, src: Transformer<any,any,any>? }>}
     */
    const reverseAChanges = []
    d.forEach(op => {
      if (dmap.$deleteOpAny.check(op)) {
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
 * @param {Array<{ d: d.AbstractDelta, src: Transformer<any,any,any>? }>} reverseAChanges
 * @return {TransformResult<d.AbstractDelta?,dmap.DeltaMap<any>?>}
 */
const _applyMapOpHelper = (state, reverseAChanges) => {
  /**
     * @type {TransformResult<d.AbstractDelta?,dmap.DeltaMapBuilder<any>?>}
     */
  const applyResult = transformResult(null, null)
  while (reverseAChanges.length > 0) {
    /**
       * @type {Array<{ d: d.AbstractDelta, src: Transformer<any,any,any>? }>}
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
        s._pb = d.mergeDeltas(s._pb, res.b)
        if (res.a != null) {
          nextReverseAChanges.push({ d: res.a, src: s })
        }
      }
    }
    // merge changes for output
    for (let i = 0; i < reverseAChanges.length; i++) {
      applyResult.a = d.mergeDeltas(applyResult.a, reverseAChanges[i].d)
    }
    reverseAChanges = nextReverseAChanges
    nextReverseAChanges = []
  }
  // accumulate b changes stored on transformers
  applyResult.b = dmap.createDeltaMap()
  for (const key in state) {
    const b = state[key]._pb
    if (b) applyResult.b.modify(key, b)
  }
  return applyResult
}
