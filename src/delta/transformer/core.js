import * as s from '../../schema.js'

/**
 * @template {import('../delta.js').DeltaConf} [A={}]
 * @template {import('../delta.js').DeltaConf} [B={}]
 */
class TransformResult {
  /**
   * @param {import('../delta.js').DeltaBuilder<A>?} a
   * @param {import('../delta.js').DeltaBuilder<B>?} b
   */
  constructor (a, b) {
    /**
     * @type {import('../delta.js').DeltaBuilder<A>?}
     */
    this.a = a
    /**
     * @type {import('../delta.js').DeltaBuilder<B>?}
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
   * @param {import('../delta.js').DeltaBuilder<A>?} a
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
   * @param {import('../delta.js').DeltaBuilder<B>?} b
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
 * @typedef {TransformResult<any,any>} TransformResultAny
 */

/**
 * @template {import('../delta.js').DeltaConf} A
 * @template {import('../delta.js').DeltaConf} B
 * @param {s.Schema<import('../delta.js').Delta<A>>} $a
 * @param {s.Schema<import('../delta.js').Delta<B>>} $b
 * @return {s.Schema<TransformResult<A,B>>}
 */
export const $tresult = ($a, $b) => /** @type {any} */ (s.$instanceOf(TransformResult, tr => (tr.a === null || $a.check(tr.a)) && (tr.b === null || $b.check(tr.b))))

/**
 * Build a {@link TransformResult}. Exposed so transformers in `./` can construct their results.
 *
 * @template {import('../delta.js').DeltaBuilderAny} [DeltaA=import('../delta.js').DeltaBuilderAny]
 * @template {import('../delta.js').DeltaBuilderAny} [DeltaB=import('../delta.js').DeltaBuilderAny]
 * @param {DeltaA?} a
 * @param {DeltaB?} b
 */
export const createTransformResult = (a, b) => new TransformResult(a, b)

/**
 * @template {import('../delta.js').DeltaConf} A
 * @template {import('../delta.js').DeltaConf} B
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
   * @param {import('../delta.js').DeltaBuilder<A>} t
   * @return {TransformResult<A,B>}
   */
  applyA (t) {
    return this.apply(createTransformResult(t, null))
  }

  /**
   * @param {import('../delta.js').DeltaBuilder<B>} t
   * @return {TransformResult<A,B>}
   */
  applyB (t) {
    return this.apply(createTransformResult(null, t))
  }
}

/**
 * This schema is only for typechecking, it does not actually check the transformer behavior!
 *
 * @template {import('../delta.js').DeltaConf} A
 * @template {import('../delta.js').DeltaConf} B
 * @param {s.Schema<import('../delta.js').Delta<A>>|A} _a
 * @param {s.Schema<import('../delta.js').Delta<B>>|A} _b
 * @return {s.Schema<Transformer<A,B>>}
 */
export const transformerWith = (_a, _b) => /** @type {s.Schema<Transformer<A,B>>} */ (s.$instanceOf(Transformer))
export const $transformer = /* @__PURE__ */ transformerWith(s.$any, s.$any)

/**
 * A composable transformer factory. `init` instantiates a stateful {@link Transformer} for a given
 * input schema; `stateless` reports whether the produced transformer carries no per-instance state
 * (so it can be shared / cached).
 *
 * @typedef {object} Template
 * @property {boolean} Template.stateless
 * @property {($d:s.Schema<import('../delta.js').DeltaAny>)=>Transformer<any,any>} Template.init
 */
