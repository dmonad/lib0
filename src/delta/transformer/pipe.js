import * as array from 'lib0/array'
import * as delta from '../delta.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * @template {{[K:string|number]:string|number}} Renames
 * @typedef {import('./rename-attrs.js').RenameAttrs<Renames>} RenameAttrsTemplate
 */

/**
 * @template {delta.DeltaConf} DConf
 * @typedef {import('./filter.js').Filter<DConf>} FilterTemplate
 */

/**
 * Marker for absent props in a NormalizedDeltaConf.
 *
 * @typedef {{ 'lib0:notset': true }} NotSet
 */

/**
 * DeltaConf in normalized form: all props defined, absent props are set to NotSet.
 *
 * ApplyPipe iterates over this form (see ApplyPipeNorm).
 *
 * @template Name
 * @template Attrs
 * @template Children
 * @template Text
 * @template RecursiveChildren
 * @template RecursiveAttrs
 * @typedef {{ name: Name, attrs: Attrs, children: Children, text: Text, recursiveChildren: RecursiveChildren, recursiveAttrs: RecursiveAttrs }} NormalizedDeltaConf
 */

/**
 * @template {delta.DeltaConf} C
 * @typedef {NormalizedDeltaConf<
 *   C extends { name: infer Name extends string } ? Name : NotSet,
 *   C extends { attrs: infer Attrs extends {[K:string|number]:any} } ? Attrs : NotSet,
 *   C extends { children: infer Children } ? Children : NotSet,
 *   C extends { text: infer Text extends boolean } ? Text : NotSet,
 *   C extends { recursiveChildren: infer RecursiveChildren extends boolean } ? RecursiveChildren : NotSet,
 *   C extends { recursiveAttrs: infer RecursiveAttrs extends boolean } ? RecursiveAttrs : NotSet
 * >} NormalizeDeltaConf
 */

/**
 * Strip NotSet props from a NormalizedDeltaConf, producing a regular DeltaConf again.
 *
 * @template NC
 * @typedef {{ [K in keyof NC as NC[K] extends NotSet ? never : K]: NC[K] } & {}} DenormalizeDeltaConf
 */

/**
 * Intersect a prop of a Filter conf with the corresponding pipe conf prop. The prop is only kept
 * if it is defined on both sides (mirrors ApplyExpectType).
 *
 * @template FilterProp
 * @template PipeProp
 * @typedef {FilterProp extends NotSet ? NotSet : PipeProp extends NotSet ? NotSet : FilterProp & PipeProp} FilterConfProp
 */

/**
 * Apply each Template to a NormalizedDeltaConf - must mirror the semantics of ApplyRenameAttrs /
 * ApplyExpectType.
 *
 * This shape is tuned to stay below typescript's instantiation-depth limit (TS2589) for long
 * pipes (~85 templates via pipe().init(), measured). What we learned:
 *
 * - The per-step destructure of NC is the load-bearing part: typescript resolves types lazily,
 *   and member inference out of the literal that was passed as a type argument in the previous
 *   step is what forces resolution of the accumulated conf. Without it (e.g. carrying the conf
 *   props as individual type params), the attrs accumulate as a deferred PropsRename chain and
 *   the limit hits at ~45 templates. Local annotations do NOT force resolution: `X & {}`,
 *   `X extends infer N ? ...`, and an inline `{ attrs: X } extends { attrs: infer A } ? ...`
 *   roundtrip were all measured to have no effect.
 * - The recursion must carry a plain object literal. Wrapping the accumulator in a helper alias
 *   (even a trivial one like NormalizedDeltaConf) defers per step and rebuilds the chain.
 * - The outer check must be on TS alone. Coupling NC into the check type (e.g.
 *   `[TS, NC] extends [[...], {...}]`) makes the conditional generic-deferred whenever the conf
 *   is generic, which sends constraint comparisons (e.g. Pipe<TS> vs Pipe<any>) into infinite
 *   recursion.
 * - Each dispatch branch costs instantiation depth. A conf-passthrough template (one whose output
 *   conf equals its input conf, e.g. transformer/inline, whose init() is typed loosely as
 *   `Transformer<IN, any>`) needs NO branch: it falls through to the trailing `NC` and composes
 *   correctly. Adding a branch for it (even `FirstT extends X ? NC : ...`) deepens every step and
 *   lowers the ~85 ceiling.
 *
 * @template {Array<Template>} TS
 * @template NC
 * @typedef {TS extends [infer FirstT extends Template, ...infer RestT extends Template[]]
 *   ? (NC extends { name: infer Name, attrs: infer Attrs extends {[K:string|number]:any}, children: infer Children, text: infer Text, recursiveChildren: infer RecursiveChildren, recursiveAttrs: infer RecursiveAttrs }
 *     ? ApplyPipeNorm<RestT,
 *       FirstT extends RenameAttrsTemplate<infer Renames> ? { name: Name, attrs: import('../../ts.js').PropsRename<Attrs extends NotSet ? {} : Attrs, Renames>, children: Children, text: Text, recursiveChildren: RecursiveChildren, recursiveAttrs: RecursiveAttrs } :
 *       FirstT extends FilterTemplate<infer DConf extends delta.DeltaConf> ? (NormalizeDeltaConf<DConf> extends { name: infer FilterName, attrs: infer FilterAttrs, children: infer FilterChildren, text: infer FilterText, recursiveChildren: infer FilterRecursiveChildren, recursiveAttrs: infer FilterRecursiveAttrs } ? {
 *         name: FilterConfProp<FilterName, Name>,
 *         attrs: FilterAttrs extends NotSet ? NotSet : Attrs extends NotSet ? NotSet : import('../../ts.js').PropsPickShared<FilterAttrs, Attrs>,
 *         children: FilterConfProp<FilterChildren, Children>,
 *         text: FilterConfProp<FilterText, Text>,
 *         recursiveChildren: FilterConfProp<FilterRecursiveChildren, RecursiveChildren>,
 *         recursiveAttrs: FilterConfProp<FilterRecursiveAttrs, RecursiveAttrs>
 *       } : never) :
 *       NC>
 *     : NC)
 *   : NC} ApplyPipeNorm
 */

/**
 * @template {Array<Template>} TS
 * @template {delta.DeltaConf} IN
 * @typedef {DenormalizeDeltaConf<ApplyPipeNorm<TS, NormalizeDeltaConf<IN>>>} ApplyPipe
 */

/**
 * Flattens nested Pipe instances into a single flat Template array.
 * Since pipe() always produces flat Pipes, Inner is already flat and
 * only one level of unwrapping is needed per Pipe element.
 * Tail-recursive with an accumulator so the instantiation depth stays constant.
 *
 * @template {Array<Template>} TS
 * @template {Array<Template>} [Acc=[]]
 * @typedef {TS extends [infer F extends Template, ...infer R extends Template[]]
 *   ? FlattenTemplates<R, F extends Pipe<infer Inner extends Template[]> ? [...Acc, ...Inner] : [...Acc, F]>
 *   : Acc} FlattenTemplates
 */

/**
 * Chain multiple Templates together.
 *
 * @template {Template[]} TS
 */
export class Pipe extends Template {
  /**
   * @param {TS} templates
   */
  constructor (templates) {
    super()
    /**
     * @type {TS}
     */
    this.templates = templates
    this._stateless = templates.every(t => t.stateless)
    /**
     * @type {PipeTransformer<any,any,this>?}
     */
    this.statelessTransformer = null
  }

  get stateless () { return this._stateless }

  /**
   * @template {delta.DeltaConf} IN
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN, ApplyPipe<TS, IN>>}
   */
  init (_$d) {
    if (this.stateless) {
      return this.statelessTransformer || (this.statelessTransformer = new PipeTransformer(this))
    } else {
      return new PipeTransformer(this)
    }
  }
}

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @template {Pipe<any>} PipeTemplate
 * @extends {Transformer<A,B>}
 */
export class PipeTransformer extends Transformer {
  /**
   * @param {PipeTemplate} tpipe
   */
  constructor (tpipe) {
    super()
    this.tpipe = tpipe
    /**
     * @type {Transformer<any,any>[]}
     */
    this.ts = tpipe.templates.map((/** @type {Template} */ t) => t.init(delta.$deltaAny))
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
 * Chain multiple {@link Template}s into a single template. Nested pipes are flattened.
 *
 * Order is directional: an `applyA` change flows through the templates **left→right** (the leftmost
 * maps the A-side first), an `applyB` change flows **right→left**. So list templates in A→B order —
 * e.g. `pipe(children(...), rename('ul'))` maps an A-side change with `children` then `rename`, and a
 * B-side change with `rename` then `children`. Reversing the order silently produces wrong results
 * (there is no init-time check), so the sequence must read as the A→B mapping.
 *
 * @template {Array<Template>} Ts
 * @param {Ts} ts
 * @return {Pipe<FlattenTemplates<Ts>>}
 */
export const pipe = (...ts) => /** @type {any} */ (new Pipe(ts.flatMap(t => t instanceof Pipe ? t.templates : [t])))
