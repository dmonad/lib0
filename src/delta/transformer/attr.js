import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { Transformer, Template, createTransformResult, attrsShapeOf } from './core.js'

/**
 * @template {string} AttrName
 * @template {delta.DeltaConf} IN
 * @typedef {import('./core.js').ResolveOut<{ name: 'lib0:value', attrs: { value: IN extends { attrs: { [K in AttrName]: infer V } } ? V : never }}>} ApplyAttr
 */

/**
 * @param {delta.DeltaBuilderAny} outDelta
 * @param {string|number} from
 * @param {string|number} to
 * @param {delta.DeltaAny} inDelta
 */
const attrTransformHelper = (outDelta, from, to, inDelta) => {
  const attrOp = inDelta.attrs[from]
  if (attrOp != null) {
    const c = attrOp.clone()
    // reason: retarget the cloned attr op to the dynamic key `to`; `key` is readonly and `attrs` is
    // a mapped type over fixed conf keys, so neither write is expressible in the JSDoc types.
    // @ts-ignore
    c.key = to
    const oattrs = /** @type {any} */ (outDelta.attrs)
    oattrs[to] = c
  }
  // Move a mark on the projected attribute (`from` -> `to`); drop root marks on any other attribute or
  // content (only this one attribute exists on the other side). A mark *inside* the attribute value
  // rides on the cloned attr op above, and a mark *delete* (id-keyed) rides verbatim via mergeRootMarks.
  delta.mergeRootMarks(outDelta, inDelta, k => k === from ? to : null)
  // flag conservatively: the direct attr assignment above bypasses the builder, so a mark inside the
  // cloned attribute value would otherwise not set the flag (marksToPositions self-corrects a false +ve)
  outDelta.maybeHasMarks ||= inDelta.maybeHasMarks
  return outDelta
}

/**
 * Projects a single node attribute into a `lib0:value` node's `value` attribute (and back).
 *
 * @template {string} AttrName
 * @template {delta.DeltaConf} [IN=any]
 * @extends {Template<IN, ApplyAttr<AttrName, IN>>}
 */
export class Attr extends Template {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
   * @param {AttrName} attrName
   */
  constructor ($d, attrName) {
    const m = attrsShapeOf($d)
    const $val = (m && m[attrName]) || s.$any
    super($d, /** @type {any} */ (delta.$delta('lib0:value', { attrs: { value: $val } })))
    this.attrName = attrName
  }

  get fpName () { return 'lib0:attr:' + this.attrName }

  /**
   * @return {Transformer<IN, ApplyAttr<AttrName, IN>>}
   */
  init () {
    return /** @type {any} */ (new AttrTransformer(this.$in, this.$out, this.attrName))
  }
}

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @extends {Transformer<A,B>}
 */
export class AttrTransformer extends Transformer {
  /**
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $in
   * @param {import('../../schema.js').Schema<delta.Delta<any>>} $out
   * @param {string} attrName
   */
  constructor ($in, $out, attrName) {
    super($in, $out)
    this.attrName = /** @type {keyof delta.DeltaConfGetAttrs<A> & (string|number)} */ (attrName)
  }

  /**
   * @param {delta.DeltaBuilder<A>} d
   * @return {import('./core.js').TransformResultAny}
   */
  applyA (d) {
    return createTransformResult(
      null,
      attrTransformHelper(
        delta.create('lib0:value'),
        this.attrName,
        'value',
        d
      )
    )
  }

  /**
   * @param {delta.DeltaBuilder<B>} d
   * @return {import('./core.js').TransformResultAny}
   */
  applyB (d) {
    return createTransformResult(
      attrTransformHelper(
        delta.create(),
        'value',
        this.attrName,
        d
      ),
      null
    )
  }
}

/**
 * Project a single node attribute `attrName` into a `lib0:value` carrier (and back). Returns a
 * reusable {@link Attr} template (a `project` hole, or `.init()` for a standalone transformer).
 *
 * @template {string} AttrName
 * @template {delta.DeltaConf} IN
 * @param {import('../../schema.js').Schema<delta.Delta<IN>>} $d
 * @param {AttrName} attrName
 * @return {Attr<AttrName, IN>}
 */
export const attr = ($d, attrName) => new Attr($d, attrName)
