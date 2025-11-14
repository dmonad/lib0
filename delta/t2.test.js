import * as t from '../testing.js' // eslint-disable-line
import * as s from '../schema.js' // eslint-disable-line
import * as d from './d2.js'

/**
 * @template {d.DeltaAny|null} [DeltaA=null]
 * @template {d.DeltaAny|null} [DeltaB=null]
 * @typedef {{ a: DeltaA|null, b: DeltaB|null }} TransformResult
 */

/**
 * @template {any} [State=any]
 * @template {(a:d.DeltaAny)=>TransformResult} [ApplyA=any]
 * @template {(b:d.DeltaAny)=>TransformResult} [ApplyB=any]
 * @typedef {object} TransformerDef
 * @property {() => State} TransformerDef.state
 * @property {ApplyA} TransformerDef.applyA
 * @property {ApplyB} TransformerDef.applyB
 */

/**
 * @template {d.DeltaAny|null} DeltaA
 * @template {d.DeltaAny|null} DeltaB
 * @param {DeltaA} a
 * @param {DeltaB} b
 * @return {TransformResult<DeltaA,DeltaB>}
 */
export const transformResult = (a, b) => ({ a, b })
export const transformResultEmpty = transformResult(null, null)

/**
 * A Delta Transformer ensures that it keeps two sources A and B in-sync, even if they use a
 * different update format.
 *
 * @template {d.DeltaAny} DeltaA
 * @template {d.DeltaAny} DeltaB
 */
export class Transformer {
  constructor () {
    /**
     * Pending a op, for internal use only
     * @type {d.DeltaAny?}
     */
    this._pa = null
    /**
     * Pending a op, for internal use only
     * @type {d.DeltaAny?}
     */
    this._pb = null
    /**
     * Whether this transformer value has been initially consumed by the parent transformer.
     */
    this._init = false
    /**
     * @type {Transformer<any,any>?}
     */
    this.parent = null
  }

  /**
   * @param {DeltaA} da
   * @return {TransformResult<DeltaA?,DeltaB?>}
   */
  applyA (da) {
    return transformResultEmpty
  }

  /**
   * @param {DeltaB} db
   * @return {TransformResult<DeltaA?,DeltaB?>}
   */
  applyB (db) {
    return transformResultEmpty
  }
}

/**
 * @template {d.DeltaAny} D
 * @extends {Transformer<D,D>}
 */
export class IdTransformer extends Transformer {
  /**
   * @template {D} DA
   * @param {DA} a
   * @return {TransformResult<null, DA>}
   */
  applyA (a) {
    return transformResult(null, a)
  }

  /**
   * @template {D} DB
   * @param {DB} b
   * @return {TransformResult<null, DB>}
   */
  applyB (b) {
    return transformResult(null, b)
  }
}

/**
 * @template {d.Delta<'x'>} DeltaA
 * @extends {Transformer<DeltaA,DeltaA extends d.Delta<infer Name,infer Attrs,infer Children,infer Text> ? d.Delta<`x-${Name}`,Attrs,Children,Text> : never>}
 */
export class RenameTransformer extends Transformer {
  /**
   * @template {DeltaA} DA
   * @param {DA} a
   * @return {TransformResult<null, DA extends d.Delta<infer Name,infer Attrs,infer Children,infer Text> ? d.Delta<`x-${Name}`,Attrs,Children,Text> : never>}
   */
  applyA (a) {
    // @ts-ignore
    return transformResult(null, a)
  }
}

/**
 * @template {d.Delta<'x'>} DeltaA
 * @template {Transformer<DeltaA,any>} T1
 * @template {Transformer<T1 extends Transformer<DeltaA,infer DeltaMid>?DeltaMid:never, any>} T2
 * @extends {Transformer<DeltaA,T2 extends Transformer<any,infer DeltaB> ? DeltaB : never>}
 */
export class PipeTransformer extends Transformer {
  /**
   * @param {T1} t1
   * @param {T2} t2
   */
  constructor (t1, t2) {
    super()
    this.t1 = t1
    this.t2 = t2
  }

  /**
   * @template {T1 extends ({ applyA: (a:infer TDA)=>any }) ? TDA : never} DA
   * @param {DA} a
   * @return {T1 extends { applyA: (a: DA)=>infer DOut } ? DOut : never}
   *
   */
  applyA (a) {
    const q = this.t1.applyA(a)
    // @ts-ignore
    return q
  }

  /**
   * @template {d.DeltaAny} DB
   * @param {DB} b
   * @return {TransformResult<null, DB>}
   */
  applyB (b) {
    return transformResult(null, b)
  }
}

/**
 * @template {Transformer<any,any>} T1
 * @template {Transformer<T1 extends Transformer<any,infer DeltaMid>?DeltaMid:never, any>} T2
 * @param {T1} t1
 * @param {T2} t2
 * @return {<D extends d.DeltaAny>($d:s.Schema<D>)=>Transformer<D,T1 extends Transformer<D,infer DMid> ? DMid : never>}
 */
const pipe = (t1, t2) => () => new PipeTransformer(t1, id)

const id = new IdTransformer()

const myTransformer = new IdTransformer()
const r = myTransformer.applyA(d.create('x').done())
const r2 = new RenameTransformer().applyA(d.create('x').set('42', 42).done())
const pt = new PipeTransformer(new RenameTransformer(), id)
const ptRes = pt.applyA(d.create('x').set('q', 42).done())
const ptRes2 = pt.t1.applyA(d.create('x').set('x', 42).done())
