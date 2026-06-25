import * as array from 'lib0/array'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * @typedef {import('../delta.js').DeltaConf} DeltaConf
 */

/**
 * A delta schema for a given conf — `Schema<Delta<C>>`. Local alias to keep the overload signatures
 * readable; defined via inline `import()` so no value import is needed.
 *
 * @template {DeltaConf} C
 * @typedef {import('../../schema.js').Schema<import('../delta.js').Delta<C>>} DSchema
 */

/**
 * Build each pipe stage's {@link Template} by threading the schema left→right: stage `k` is built
 * against stage `k-1`'s output schema (`$out`). Returns the stage templates and the final output schema.
 *
 * @param {DSchema<any>} $in
 * @param {Array<(d: DSchema<any>) => Template<any,any>>} stageFns
 * @return {{ stages: Template<any,any>[], $out: DSchema<any> }}
 */
const buildStages = ($in, stageFns) => {
  let $cur = $in
  /** @type {Template<any,any>[]} */
  const stages = []
  for (const fn of stageFns) { const t = fn($cur); stages.push(t); $cur = t.$out }
  return { stages, $out: $cur }
}

/**
 * The composite template produced by {@link pipe}: holds the threaded stage templates; `init()`
 * materializes each into a {@link PipeTransformer}.
 *
 * @template {DeltaConf} [IN=any]
 * @template {DeltaConf} [OUT=any]
 * @extends {Template<IN, OUT>}
 */
export class Pipe extends Template {
  /**
   * @param {DSchema<IN>} $in
   * @param {DSchema<OUT>} $out
   * @param {Template<any,any>[]} stages the threaded stage templates (A→B order)
   */
  constructor ($in, $out, stages) {
    super($in, $out)
    this.stages = stages
  }

  get fpName () { return 'lib0:pipe' }

  /**
   * @return {Transformer<IN, OUT>}
   */
  init () {
    return /** @type {any} */ (new PipeTransformer(this.stages.map(t => t.init())))
  }
}

/**
 * @extends {Transformer<any,any>}
 */
export class PipeTransformer extends Transformer {
  /**
   * @param {Transformer<any,any>[]} ts the per-stage transformers (materialized, A→B order)
   */
  constructor (ts) {
    super()
    /**
     * @type {Transformer<any,any>[]}
     */
    this.ts = ts
  }

  /**
   * @param {import('./core.js').TransformResultAny} tin
   * @return {import('./core.js').TransformResultAny}
   */
  apply (tin) {
    const ts = this.ts
    // the deltas we still have to apply on the respective transformers (ts[i].apply(tr[i]))
    const trs = array.unfold(ts.length, () => createTransformResult(null, null))
    // the final accumulated result
    const res = createTransformResult(null, null)
    trs[0].a = tin.a
    trs[trs.length - 1].b = tin.b
    let madeChange = false
    // change direction whenever possible, go back and forth until no more changes can be applied
    if (!tin.isEmpty()) {
      do {
        madeChange = false
        let forward = trs[0].a != null
        let i = forward ? 0 : ts.length - 1
        while (i >= 0 && i < ts.length) {
          const ti = ts[i]
          const tri = trs[i]
          if (!tri.isEmpty()) {
            madeChange = true
            const tires = ti.apply(tri)
            if (i === 0) {
              res.applyA(tires.a)
            } else {
              trs[i - 1].applyB(tires.a)
            }
            if (i === trs.length - 1) {
              res.applyB(tires.b)
            } else {
              trs[i + 1].applyA(tires.b)
            }
          }
          tri.clear()
          const hasForwardChange = i + 1 < ts.length && !trs[i + 1].isEmpty()
          const hasBackwardChange = i > 0 && !trs[i - 1].isEmpty()
          // go back and forth
          if (forward && hasBackwardChange) {
            forward = false
          } else if (!forward && hasForwardChange) {
            forward = true
          }
          forward ? i++ : i--
        }
      } while (madeChange)
    }
    return res
  }
}

/**
 * Chain transformers, threading the input schema left→right so each stage is typed against the
 * previous stage's output. `pipe($d, $d1 => …, $d2 => …)` infers the end-to-end output type
 * automatically; each stage is a `($schema) => Template` factory. Returns a reusable {@link Pipe}
 * template — call `.init()` for the transformer.
 *
 * Order is directional: an `applyA` change flows through the stages **left→right** (the leftmost maps
 * the A-side first), an `applyB` change flows **right→left**. So list stages in A→B order — e.g.
 * `pipe($d, $d1 => children($d1, …), $d2 => rename($d2, 'ul'))` maps an A-side change with `children`
 * then `rename`. Reversing the order silently produces wrong results (there is no init-time check).
 *
 * The overloads cover up to a fixed arity; longer typed pipes nest
 * (`pipe($d, …, $dk => pipe($dk, …more))`).
 *
 * @template {DeltaConf} In
 * @template {DeltaConf} O1
 * @overload
 * @param {DSchema<In>} $in
 * @param {(d: DSchema<In>) => Template<In, O1>} f1
 * @returns {Pipe<In, O1>}
 */
/**
 * @template {DeltaConf} In
 * @template {DeltaConf} O1
 * @template {DeltaConf} O2
 * @overload
 * @param {DSchema<In>} $in
 * @param {(d: DSchema<In>) => Template<In, O1>} f1
 * @param {(d: DSchema<O1>) => Template<O1, O2>} f2
 * @returns {Pipe<In, O2>}
 */
/**
 * @template {DeltaConf} In
 * @template {DeltaConf} O1
 * @template {DeltaConf} O2
 * @template {DeltaConf} O3
 * @overload
 * @param {DSchema<In>} $in
 * @param {(d: DSchema<In>) => Template<In, O1>} f1
 * @param {(d: DSchema<O1>) => Template<O1, O2>} f2
 * @param {(d: DSchema<O2>) => Template<O2, O3>} f3
 * @returns {Pipe<In, O3>}
 */
/**
 * @template {DeltaConf} In
 * @template {DeltaConf} O1
 * @template {DeltaConf} O2
 * @template {DeltaConf} O3
 * @template {DeltaConf} O4
 * @overload
 * @param {DSchema<In>} $in
 * @param {(d: DSchema<In>) => Template<In, O1>} f1
 * @param {(d: DSchema<O1>) => Template<O1, O2>} f2
 * @param {(d: DSchema<O2>) => Template<O2, O3>} f3
 * @param {(d: DSchema<O3>) => Template<O3, O4>} f4
 * @returns {Pipe<In, O4>}
 */
/**
 * @template {DeltaConf} In
 * @template {DeltaConf} O1
 * @template {DeltaConf} O2
 * @template {DeltaConf} O3
 * @template {DeltaConf} O4
 * @template {DeltaConf} O5
 * @overload
 * @param {DSchema<In>} $in
 * @param {(d: DSchema<In>) => Template<In, O1>} f1
 * @param {(d: DSchema<O1>) => Template<O1, O2>} f2
 * @param {(d: DSchema<O2>) => Template<O2, O3>} f3
 * @param {(d: DSchema<O3>) => Template<O3, O4>} f4
 * @param {(d: DSchema<O4>) => Template<O4, O5>} f5
 * @returns {Pipe<In, O5>}
 */
/**
 * @template {DeltaConf} In
 * @template {DeltaConf} O1
 * @template {DeltaConf} O2
 * @template {DeltaConf} O3
 * @template {DeltaConf} O4
 * @template {DeltaConf} O5
 * @template {DeltaConf} O6
 * @overload
 * @param {DSchema<In>} $in
 * @param {(d: DSchema<In>) => Template<In, O1>} f1
 * @param {(d: DSchema<O1>) => Template<O1, O2>} f2
 * @param {(d: DSchema<O2>) => Template<O2, O3>} f3
 * @param {(d: DSchema<O3>) => Template<O3, O4>} f4
 * @param {(d: DSchema<O4>) => Template<O4, O5>} f5
 * @param {(d: DSchema<O5>) => Template<O5, O6>} f6
 * @returns {Pipe<In, O6>}
 */
/**
 * @template {DeltaConf} In
 * @template {DeltaConf} O1
 * @template {DeltaConf} O2
 * @template {DeltaConf} O3
 * @template {DeltaConf} O4
 * @template {DeltaConf} O5
 * @template {DeltaConf} O6
 * @template {DeltaConf} O7
 * @overload
 * @param {DSchema<In>} $in
 * @param {(d: DSchema<In>) => Template<In, O1>} f1
 * @param {(d: DSchema<O1>) => Template<O1, O2>} f2
 * @param {(d: DSchema<O2>) => Template<O2, O3>} f3
 * @param {(d: DSchema<O3>) => Template<O3, O4>} f4
 * @param {(d: DSchema<O4>) => Template<O4, O5>} f5
 * @param {(d: DSchema<O5>) => Template<O5, O6>} f6
 * @param {(d: DSchema<O6>) => Template<O6, O7>} f7
 * @returns {Pipe<In, O7>}
 */
/**
 * @template {DeltaConf} In
 * @template {DeltaConf} O1
 * @template {DeltaConf} O2
 * @template {DeltaConf} O3
 * @template {DeltaConf} O4
 * @template {DeltaConf} O5
 * @template {DeltaConf} O6
 * @template {DeltaConf} O7
 * @template {DeltaConf} O8
 * @overload
 * @param {DSchema<In>} $in
 * @param {(d: DSchema<In>) => Template<In, O1>} f1
 * @param {(d: DSchema<O1>) => Template<O1, O2>} f2
 * @param {(d: DSchema<O2>) => Template<O2, O3>} f3
 * @param {(d: DSchema<O3>) => Template<O3, O4>} f4
 * @param {(d: DSchema<O4>) => Template<O4, O5>} f5
 * @param {(d: DSchema<O5>) => Template<O5, O6>} f6
 * @param {(d: DSchema<O6>) => Template<O6, O7>} f7
 * @param {(d: DSchema<O7>) => Template<O7, O8>} f8
 * @returns {Pipe<In, O8>}
 */
/**
 * @param {DSchema<any>} $in
 * @param {...((d: DSchema<any>) => Template<any,any>)} fns
 * @returns {any}
 */
export const pipe = ($in, ...fns) => {
  const { stages, $out } = buildStages($in, fns)
  return new Pipe($in, $out, stages)
}
