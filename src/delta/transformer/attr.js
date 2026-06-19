import * as delta from '../delta.js'
import { Transformer, Template, createTransformResult } from './core.js'

/**
 * @template {string} AttrName
 * @template {delta.DeltaConf} IN
 * @typedef {{ name: 'lib0:value', attrs: { value: IN extends { attrs: { [K in AttrName]: infer V } } ? V : never }}} ApplyAttr
 */

/**
 * @param {delta.DeltaBuilderAny} outDelta
 * @param {string|number} from
 * @param {string|number} to
 * @param {delta.DeltaBuilderAny} inDelta
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
  return outDelta
}

/**
 * Projects a single node attribute into a `lib0:value` node's `value` attribute (and back).
 *
 * @template {string} AttrName
 */
export class Attr extends Template {
  /**
   * @param {AttrName} attrName
   */
  constructor (attrName) {
    super()
    this.attrName = attrName
  }

  get stateless () { return true }

  /**
   * @template {delta.DeltaConf} IN
   * @param {import('../../schema.js').Schema<delta.Delta<IN>>} _$d
   * @return {Transformer<IN, ApplyAttr<AttrName, IN>>}
   */
  init (_$d) {
    return new AttrTransformer(this.attrName)
  }
}

/**
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @extends {Transformer<A,B>}
 */
export class AttrTransformer extends Transformer {
  /**
   * @param {string} attrName
   */
  constructor (attrName) {
    super()
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
 * Create a {@link Attr} template that projects the attribute `attrName`.
 *
 * @template {string} AttrName
 * @param {AttrName} attrName
 */
export const attr = attrName => new Attr(attrName)
