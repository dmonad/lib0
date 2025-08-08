
import * as d from './abstract.js'
import * as dmap from './map.js'
import * as s from '../schema.js'

/**
 * @template {any} State
 * @template {s.Unwrap<d.$delta>} DeltaIn
 * @template {s.Unwrap<d.$delta>} DeltaOut
 * @typedef {object} TransformerDef
 * @property {s.$Schema<DeltaIn>} TransformerDef.$in
 * @property {s.$Schema<DeltaOut>} TransformerDef.$out
 * @property {() => State} TransformerDef.state
 * @property {(deltaIn:NoInfer<DeltaIn>,s:NoInfer<State>,tdef:TransformerDef<State,DeltaIn,DeltaOut>) => NoInfer<DeltaOut>} TransformerDef.transform
 * @property {(deltaOut:NoInfer<DeltaOut>,s:NoInfer<State>,tdef:TransformerDef<State,DeltaIn,DeltaOut>) => NoInfer<DeltaIn>} TransformerDef.inverse
 */

/**
 * A Delta Transformer ensures that it keeps two sources A and B in-sync, even if they use a
 * different update format.
 *
 * @template {any} State
 * @template {s.Unwrap<d.$delta>} DeltaA
 * @template {s.Unwrap<d.$delta>} DeltaB
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
     * @type {Array<DeltaA>}
     */
    this._cIn = []
    /**
     * @type {Array<DeltaB>}
     */
    this._cOut = []
    /**
     * @type {Transformer<any,any,any>?}
     */
    this.parent = null
  }

  /**
   * @param {DeltaA} deltaIn
   */
  applyA (deltaIn) {
    return this.t.transform(deltaIn, this._state, this.t)
  }

  /**
   * @param {DeltaB} deltaOut
   */
  applyB (deltaOut) {
    return this.t.inverse(deltaOut, this._state, this.t)
  }
}

/**
 * Validates and builds a chain of transformers
 * @template {TransformerTemplate<any,any,any>[]} TS - Array of transformers
 * @template {s.Unwrap<d.$delta>} CurrentIn - Current input type to match
 * 
 * @typedef {TS extends [] 
 *     ? [] 
 *     : TS extends [TransformerTemplate<any, infer TIn, infer TOut>, ...infer Rest]
 *       ? CurrentIn extends TIn
 *         ? Rest extends TransformerTemplate<any,any,any>[]
 *           ? [TransformerTemplate<any, TIn, TOut>, ...TransformerChain<Rest, TOut>]
 *           : never
 *         : never
 *       : never
 * } TransformerChain
 */

/**
 * @template State
 * @template {s.Unwrap<typeof d.$delta>} DeltaIn
 * @template {s.Unwrap<typeof d.$delta>} DeltaOut
 */
class TransformerTemplate {
  /**
   * @param {TransformerDef<State,DeltaIn,DeltaOut>} def
   */
  constructor ({ $in, $out, state, transform, inverse }) {
    this.$in = $in
    this.$out = $out
    this.state = state
    this.transform = transform
    this.inverse = inverse
    /**
     * @type {Transformer<State,DeltaIn,DeltaOut>?}
     */
    this._tr = null
  }

  /**
   * @template {Array<TransformerTemplate<any,any,any>>} TS
   * @param {TS & (TS extends [TransformerTemplate<any,any,any>] ? [TransformerTemplate<any, DeltaOut, any>] : TransformerChain<TS,DeltaOut>)} templates
   * @return {s.TupleLast<TS> extends TransformerTemplate<any,any,infer TOut> ? TransformerTemplate<any, DeltaIn, TOut> : never}
   */
  pipe (...templates) {
    return /** @type {any} */ (transformer({
      $in: this.$in,
      $out: templates[templates.length - 1].$out,
      state: () => templates.map(t => t.init()),
      transform: (d, trs) => {
        /**
         * @type {d.AbstractDelta}
         */
        let o = d
        for (let i = 0; i < trs.length; i++) {
          o = trs[i].applyA(o)
        }
        return o
      },
      inverse: (d, trs) => {
        /**
         * @type {d.AbstractDelta}
         */
        let o = d
        for (let i = trs.length - 1; i >= 0; i++) {
          o = trs[i].applyB(o)
        }
        return /** @type {any} */ (o)
      }
    }))
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
 * @return {TransformerTemplate<any, T[keyof T] extends TransformerTemplate<any,infer DIn,any> ? DIn : never, dmap.DeltaMap<dmap.$MapOpsFromValues<{ [K in keyof T]: T[K] extends TransformerTemplate<any, any, any> ? T[K] : never }>>>}
 */
export const map = (def) => {
  const x = transformer({
    $in: s.$any,
    $out: s.$any,
    state: () => {
      const mapState = /** @type {{ [key: string]: Transformer<any,any,any> }} */ ({})
      for (const key in def) {
        mapState[key] = def[key].init()
      }
      return /** @type {{ [key in keyof T]: T extends TransformerTemplate<any,infer SDIn, infer SDOut> ? Transformer<any, SDIn, SDOut>: never }} */ (mapState)
    },
    transform: (d, state, def) => {
      
    },
    inverse: (d, state, def) => {

    }
  })

  throw new Error('dtrnu')
}

const mapString = transformer({
  $in: dmap.$deltaMap(s.$object({ z: s.$number })),
  $out: dmap.$deltaMap(s.$object({ z: s.$string })),
  state: () => null,
  transform: (d,state,def) => {
    const dout = dmap.create(s.$object({ z: s.$string }))
    d.forEach(op => {
      if (dmap.$insertOpAny.check(op)) {
        dout.set(op.key, op.value + '')
      }
    })
    return dout.done()
  },
  inverse: (d, state, def) => {
    const dout = dmap.create(s.$object({ z: s.$number }))
    d.forEach(op => {
      if (dmap.$insertOpAny.check(op)) {
        dout.set(op.key, Number.parseInt(op.value))
      }
    })
    return dout.done()
  },
})
const q = map({ x: mapString })
const out = q.init().applyA(dmap.create(s.$object({ z: s.$number })).delete('z').done())
console.log(out.toJSON())
