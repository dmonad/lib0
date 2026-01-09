import * as t from '../testing.js'
import * as delta from './delta.js'
import * as s from '../schema.js'
import * as array from '../array.js'

/**
 * @template {delta.Delta?} DeltaA
 * @template {delta.Delta?} DeltaB
 * @typedef {{ a: DeltaA?, b: DeltaB? }} TransformResult
 */

/**
 * @template {delta.DeltaBuilder?} DeltaA
 * @template {delta.DeltaBuilder?} DeltaB
 * @param {DeltaA} a
 * @param {DeltaB} b
 * @return {TransformResult<DeltaA?,DeltaB?>}
 */
export const transformResult = (a, b) => ({ a, b })
export const transformResultEmpty = transformResult(null, null)

let x = transformResult(delta.create('x'), null)
x = transformResult(null, null)

/**
 * @template {delta.DeltaAny} DeltaA
 * @template {delta.DeltaAny} DeltaB
 * @typedef {(t:{a:DeltaA?,b:DeltaB?})=>({a:DeltaA?,b:DeltaB?})} DeltaTransformer
 */

/**
 * @template {delta.Delta<string,any,any,any>} A
 * @template {(A extends delta.Delta<infer NodeName,infer Attrs,infer Children,infer Text> ? delta.Delta<`x-${NodeName}`,Attrs,Children,Text> : never)} B
 * @param {TransformResult<A,B>} t
 * @return {TransformResult<A,B>}
 */
const rename = t => {
  /**
   * @type {any}
   */
  const tout = /** @type {any} */ (transformResult(null, null))
  if (t.a) {
    const c = /** @type {delta.Delta} */ (t.a.clone())
    c.name = 'x-' + c.name
    // @ts-ignore
    tout.b = c
  }
  if (t.b) {
    const c = /** @type {delta.Delta} */ (t.b.clone())
    c.name = c.name.slice(2)
    // @ts-ignore
    tout.a = c
  }
  return tout
}

/**
 * @param {Set<string>} allowed
 */
const filter = (allowed) => {
  /**
   * contains inserted items that didn't make it into t.b
   */
  const diff = delta.create()
  /**
   * @template {delta.Delta<string,any,any,any>?} A
   * @template {(A extends delta.Delta<infer NodeName,infer Attrs,infer Children,infer Text> ? delta.Delta<`x-${NodeName}`,Attrs,Children,Text> : never)} B
   * @param {{ a: A?, b: B? }} t
   * @return {{ a: A?, b: B? }}
   */
  return t => {
    /**
     * @type {any}
     */
    const tout = /** @type {any} */ (transformResult(null, null))
    if (t.a) {
      const c = delta.create()
      let index = 0
      /**
       * Split delta into two parts: hidden and visible. hidden contains all "hidden" changes (filtered inserts).
       * visible everything else.
       *
       * return visible.rebaseAgainstInverse(diff)
       * apply `diff.apply(merge)`
       *
       */
      for (const child of t.a.children) {
        if (delta.$insertOp.check(child)) {
          for (let i = 0; i < child.insert.length; i++) {
            const ins = child.insert[i]
            if (delta.$deltaAny.check(ins) && allowed.has(ins.name)) {
              ins
            } else {

            }
            ins
          }
        }
        if (!delta.$deleteOp.check(child)) {
          index += child.length
        }
      }
    }
    if (t.b) {
    }
    return tout
  }
}

const dd = delta.create('x', { x: 'dtrn' })
const y = rename({ a: delta.create('x', { x: 'dtrn' }), b: null })

/**
 * @template {delta.DeltaAny} DeltaA
 * @template {delta.DeltaAny} Delta_
 * @template {delta.DeltaAny} DeltaB
 * @param {(t:TransformResult<DeltaA,Delta_>)=>TransformResult<DeltaA,Delta_>} t1
 * @param {(t:TransformResult<Delta_,DeltaB>)=>TransformResult<Delta_,DeltaB>} t2
 * @return {(dx:TransformResult<DeltaA,DeltaB>)=>TransformResult<Delta_,DeltaB>}
 */
const pipe = (t1, t2) => (dx) => {
  return /** @type {any} */ (null)
}

// next idea: Transform object that changes typings

/**
 * Transforms should..
 * - transform from a->b->c->b->a
 * - extendable mod(Transform<A,B>):Transform<A,C>
 * - i can start with id: mod(Id($d))
 */

/**
 * @template {delta.Delta} DeltaA
 * @template {delta.Delta} DeltaB
 * @typedef {{ applyA: (da:DeltaA)=>TransformResult<DeltaA,DeltaB>, applyB: (db:DeltaB)=>TransformResult<DeltaA,DeltaB> }} Transform
 */

/**
 * @template {delta.DeltaBuilder} A
 * @template {delta.DeltaBuilder} B
 */
class Transformer {
  /**
   * @param {s.Schema<A>} $da
   */
  constructor ($da) {
    this.$da = $da
    /**
     * @type {Array<Transform<any,any>>}
     */
    this._tr = []
  }

  /**
   * @param {TransformResult<A,B>} d
   * @return {TransformResult<A?,B?>}
   */
  apply ({ a, b }) {
    if (a == null && b == null) return transformResult(null, null)
    /**
     * @type {Array<{ a: delta.DeltaBuilder?, b: delta.DeltaBuilder? }>}
     */
    const pendingApply = array.unfold(this._tr.length + 2, () => ({ a: null, b: null }))
    pendingApply[1].a = a
    pendingApply[pendingApply.length - 2].b = b
    /**
     * @param {number} i
     */
    const applyTransformI = i => {
      const p = pendingApply[i + 1]
      const t = this._tr[i]
      const aout = p.a !== null ? t.applyA(p.a) : transformResult(null, null)
      if (p.b !== null) {
        if (aout.b !== null) {
          p.b = p.b.rebase(aout.b, true)
        }
        const bout = t.applyB(p.b)
        aout.a = delta.mergeDeltas(aout.a, bout.a)
        aout.b = delta.mergeDeltas(aout.b, bout.b)
      }
      // write out.a into prev.b, and out.b into next.a
      pendingApply[i].b = delta.mergeDeltas(pendingApply[i].b, aout.a)
      pendingApply[i + 2].a = delta.mergeDeltas(pendingApply[i + 2].a, aout.b)
      return aout
    }
    let needsBackwardTransform = a != null
    let needsForwardTransform = b != null
    while (needsBackwardTransform || needsForwardTransform) {
      if (needsForwardTransform) {
        for (let i = 0; i < this._tr.length; i++) {
          const r = applyTransformI(i)
          if (i != null) {
            needsBackwardTransform = needsBackwardTransform || r.a != null
          }
        }
        needsForwardTransform = false
      }
      if (needsBackwardTransform) {
        for (let i = this._tr.length - 1; i >= 0; i--) {
          const r = applyTransformI(i)
          if (i != null) {
            needsForwardTransform = needsForwardTransform || r.b != null
          }
        }
        needsBackwardTransform = false
      }
    }
    return /** @type {TransformResult<A,B>} */ (transformResult(pendingApply[0].b, pendingApply[pendingApply.length - 1].a))
  }
}
//
// /**
//  * @template {delta.Delta} D
//  * @param {s.Schema<D>} $d
//  * @return {Transformer<D,D>}
//  */
// const id = ($d) => /** @type {Transformer<D,D>} */ (new Transformer($d))
//
// const q = id(delta.$delta({ name: 'div' }))
// const q2 = id(delta.$delta({ name: 'div', attrs: { a: s.$string } })).pipe(t.delta('h1', { color: t => query('a')(t), name:'mystuff' }, t => [query('b')(t)]))
// const q3 = t.delta('h1', { color: t => query('a')(t), name:'mystuff' }, t => [query('b')(t)])(id(delta.$delta({ name: 'div', attrs: { a: s.$string } }))))
//
//
// /**
//  * @param {Transformer<delta.Delta<any,{ a: string, name: string }>>} t
//  */
// const dataToH1 = t => t.delta('h1', { color: t => query('a')(t), name:'mystuff' }, t => [query('b')(t)])(t)
// const q4 = dataToH1(id(delta.$delta({ name: 'div', attrs: { a: s.$string } })))
//
// const dataToH1_2 = t => rename('h1')(renameAttr({ a: 'color' })(static(delta.create('h1', { name: 'mystuff' }, 'some content!'))(t)))
