import * as s from '../../schema.js'
import * as error from '../../error.js'

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
 * Recognize a {@link Transformer} by its `$type` tag. Every value is either a `Transformer` or a
 * {@link Template}, never both, so the two roles can each own a single prototype `$type`.
 *
 * @type {s.Schema<Transformer<any,any>>}
 */
export const $transformer = /** @type {s.Schema<Transformer<any,any>>} */ (Transformer.prototype.$type = s.$type('d:transformer', Transformer))

/**
 * Like {@link $transformer}, but carries the side-A / side-B delta types for typechecking; the two
 * schema params do not constrain the runtime check.
 *
 * @template {import('../delta.js').DeltaConf} A
 * @template {import('../delta.js').DeltaConf} B
 * @param {s.Schema<import('../delta.js').Delta<A>>|A} _a
 * @param {s.Schema<import('../delta.js').Delta<B>>|A} _b
 * @return {s.Schema<Transformer<A,B>>}
 */
/* @__NO_SIDE_EFFECTS__ */
export const transformerWith = (_a, _b) => /** @type {s.Schema<Transformer<A,B>>} */ ($transformer)

/**
 * A composable transformer factory. `init` instantiates a stateful {@link Transformer} for a given
 * input schema; `stateless` reports whether the produced transformer carries no per-instance state
 * (so it can be shared / cached). Concrete templates `extend Template`; a class that would be both a
 * template and a transformer instead stores the transformer and returns it from `init` (see
 * {@link import('./rename.js').AttrRename}).
 */
export class Template {
  /**
   * Whether {@link Template.init} yields a transformer with no per-instance state (so a single
   * instance can be shared / cached). Overridden by every concrete template.
   *
   * @return {boolean}
   */
  /* c8 ignore next */
  get stateless () { return false }

  /**
   * Instantiate a stateful {@link Transformer} for the given input schema.
   *
   * @param {s.Schema<import('../delta.js').DeltaAny>} _$d
   * @return {Transformer<any,any>}
   */
  /* c8 ignore next 3 */
  init (_$d) {
    error.methodUnimplemented()
  }
}

/**
 * Recognize a {@link Template} by its `$type` tag. Used to detect transformer "holes" embedded in a
 * `project` spec.
 *
 * @type {s.Schema<Template>}
 */
export const $template = /** @type {s.Schema<Template>} */ (Template.prototype.$type = s.$type('d:template', Template))
