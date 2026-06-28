import * as s from '../../schema.js'
import * as error from '../../error.js'
import * as delta from '../delta.js'
import * as fingerprintTrait from '../../trait/fingerprint.js'

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
        this.a = a // adopt: `a` is donated to this result (callers must not reuse it)
      } else {
        this.a.apply(a, { move: true }) // ...so the merge may consume `a` rather than freeze-copy it
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
        this.b = b // adopt: `b` is donated to this result (callers must not reuse it)
      } else {
        this.b.apply(b, { move: true }) // ...so the merge may consume `b` rather than freeze-copy it
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
   * @param {s.Schema<import('../delta.js').Delta<A>>} $in input delta schema
   * @param {s.Schema<import('../delta.js').Delta<B>>} $out output delta schema (computed by the factory)
   */
  constructor ($in, $out) {
    /**
     * @type {s.Schema<import('../delta.js').Delta<A>>}
     */
    this.$in = $in
    /**
     * @type {s.Schema<import('../delta.js').Delta<B>>}
     */
    this.$out = $out
  }

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
      const bres = this.applyB(tb) // a fresh, single-use result -> its sides may be consumed (moved)
      if (ares.a) {
        ares.a.apply(bres.a, { move: true })
      } else {
        ares.a = bres.a
      }
      if (ares.b) {
        ares.b.apply(bres.b, { move: true })
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
 * A function from an input delta schema to a {@link Template} — the schema-deferred form of a
 * transformer factory. Used for `pipe` stages, recursive composition, and `bind`.
 *
 * @template {import('../delta.js').DeltaConf} In
 * @template {import('../delta.js').DeltaConf} Out
 * @typedef {($in: s.Schema<import('../delta.js').Delta<In>>) => Template<In, Out>} TemplateFactory
 */

/**
 * Force a factory's computed output conf to display fully-resolved (flatten `Omit<…> & {…}` / bare
 * alias artifacts) while staying a valid `DeltaConf` for use as a `Transformer`/`Delta` type
 * argument — conf-aware and depth-limited (nested `Delta<…>` stay intact). Implemented as an
 * overwrite-with-nothing, reusing {@link import('../delta.js').DeltaConfOverwrite}'s
 * prettify+coerce recipe. Apply to every factory's `OUT` typedef whose result is not already
 * produced by `DeltaConfOverwrite`.
 *
 * @template {import('../delta.js').DeltaConf} Conf
 * @typedef {import('../delta.js').DeltaConfOverwrite<Conf, {}>} ResolveOut
 */

/**
 * The reusable, schema-bound form of a transformer: built by a factory (`attr($d, …)`), it holds the
 * input/output delta schemas (`$in`/`$out`) and materializes a fresh stateful {@link Transformer} via
 * the parameterless `init()`. Concrete templates `extend Template`.
 *
 * Templates are {@link fingerprintTrait.Fingerprintable}: this is what lets them be embedded as values
 * (holes) in a `delta.create(...)` projection spec without collapsing the spec's type.
 *
 * @template {import('../delta.js').DeltaConf} [IN=any]
 * @template {import('../delta.js').DeltaConf} [OUT=any]
 */
export class Template {
  /**
   * @param {s.Schema<import('../delta.js').Delta<IN>>} $in input delta schema
   * @param {s.Schema<import('../delta.js').Delta<OUT>>} $out output delta schema (computed by the factory)
   */
  constructor ($in, $out) {
    /**
     * @type {s.Schema<import('../delta.js').Delta<IN>>}
     */
    this.$in = $in
    /**
     * @type {s.Schema<import('../delta.js').Delta<OUT>>}
     */
    this.$out = $out
  }

  /**
   * Stable, mangle-safe identifier folded into this template's fingerprint. Subclasses with
   * configuration override it so that e.g. `attr('a')` and `attr('b')` fingerprint differently
   * (do NOT use `constructor.name` — class names do not survive mangling).
   *
   * @return {string}
   */
  get fpName () { return 'lib0:template' }

  /**
   * @return {string}
   */
  [fingerprintTrait.FingerprintTraitSymbol] () { return this.fpName }

  /**
   * Instantiate a fresh stateful {@link Transformer} bound to this template's schema.
   *
   * @return {Transformer<IN, OUT>}
   */
  /* c8 ignore next 3 */
  init () {
    return error.methodUnimplemented()
  }
}

/**
 * Bind an input schema into the `$d => Template` lambda pattern (the shape used by {@link pipe}
 * stages, {@link import('./children.js').children} handlers, and `bind`) at the top level: calls
 * `fn` with `$d` and returns its {@link Template}. Lets you write `transform($d, $d => pipe($d, …))`
 * — keeping every template construction in the same lambda style — without a separate `const $d`
 * statement. The lambda's `$d` parameter is typed as the input delta schema, and the concrete
 * template subtype `fn` returns is preserved in the result.
 *
 * @template {import('../delta.js').DeltaConf} IN
 * @template {Template<IN, any>} T
 * @param {s.Schema<import('../delta.js').Delta<IN>>} $d
 * @param {($d: s.Schema<import('../delta.js').Delta<IN>>) => T} fn
 * @return {T}
 */
export const transform = ($d, fn) => fn($d)

/**
 * Rebuild `$in`'s delta schema with a replaced attrs-shape map (keeping name/children/text). Used by
 * the attr-renaming/filtering factories to compute a concrete output schema (`$out`). Falls back to
 * `$deltaAny` when `$in` is loose (not a concrete `$delta(...)`).
 *
 * @param {s.Schema<import('../delta.js').DeltaAny>} $in
 * @param {{[k:string|number]: s.Schema<any>}} newAttrsShape
 * @return {s.Schema<import('../delta.js').DeltaAny>}
 */
export const withAttrs = ($in, newAttrsShape) => delta.$$delta.check($in)
  ? new delta.$Delta($in.shape.$name, s.$object(newAttrsShape), $in.shape.$children, $in.shape.hasText, false, $in.shape.$formats)
  : delta.$deltaAny

/**
 * Rebuild `$in`'s delta schema with a replaced node `name` (keeping attrs/children/text). Falls back
 * to `$deltaAny` when `$in` is loose.
 *
 * @param {s.Schema<import('../delta.js').DeltaAny>} $in
 * @param {string} name
 * @return {s.Schema<import('../delta.js').DeltaAny>}
 */
export const withName = ($in, name) => delta.$$delta.check($in)
  ? new delta.$Delta(s.$(name), $in.shape.$attrs, $in.shape.$children, $in.shape.hasText, false, $in.shape.$formats)
  : delta.$deltaAny

/**
 * The `{ attrKey: Schema }` map of `$in`'s attrs, or `null` when `$in` is loose / has no object attrs
 * schema. Lets attr-renaming/filtering factories compute a concrete `$out`.
 *
 * @param {s.Schema<import('../delta.js').DeltaAny>} $in
 * @return {{[k:string|number]: s.Schema<any>}?}
 */
export const attrsShapeOf = ($in) => delta.$$delta.check($in) && s.$$object.check($in.shape.$attrs)
  ? /** @type {{[k:string|number]: s.Schema<any>}} */ ($in.shape.$attrs.shape)
  : null

/**
 * Recognize a {@link Template} by its `$type` tag. Used to detect transformer "holes" embedded in a
 * `project` spec.
 *
 * @type {s.Schema<Template>}
 */
export const $template = /** @type {s.Schema<Template>} */ (Template.prototype.$type = s.$type('d:template', Template))
