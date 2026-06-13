import * as delta from '../delta.js'
import { Transformer, createTransformResult, $transformer } from './core.js'

/**
 * Projects an input delta onto a fixed node shape, optionally filling attributes/children from nested
 * transformers (those whose value is a {@link Transformer} instance) and constants otherwise.
 *
 * @template {delta.DeltaConf} A
 * @template {delta.DeltaConf} B
 * @extends {Transformer<A,B>}
 */
export class ProjectionTransformer extends Transformer {
  /**
   * @param {string} name
   * @param {{ [K in string|number]: any }} attrs
   * @param {Array<Array<any> | string>} children
   */
  constructor (name, attrs, children) {
    super()
    /**
     * @type {Array<{ key: number|string, t: Transformer<any,any> }>}
     */
    const ts = []
    /**
     * @type {Object<any,any>}
     */
    const fixedAttrs = {}
    /**
     * @type {Array<any>}
     */
    const fixedChildren = []
    for (const key in attrs) {
      const t = attrs[key]
      if ($transformer.check(t)) {
        ts.push({ key, t })
      } else {
        fixedAttrs[key] = t
      }
    }
    children.forEach((t, key) => {
      if ($transformer.check(t)) {
        ts.push({ key, t })
        fixedChildren.push(delta.create('lib0:value'))
      } else {
        fixedChildren.push(delta.create('lib0:value', { value: t }))
      }
    })
    /**
     * @type {delta.DeltaBuilderAny|null}
     */
    this.initOut = delta.create(name, fixedAttrs, ...fixedChildren)
    this.ts = ts
  }

  /**
   * @param {import('./core.js').TransformResultAny} tin
   * @return {import('./core.js').TransformResultAny}
   */
  apply (tin) {
    const trs = this.ts.map(t => ({ key: t.key, tr: t.t.apply(tin) }))
    // @todo this doesn't sync changes between transformer-children
    const res = createTransformResult(null, this.initOut)
    this.initOut = null
    trs.forEach(({ key, tr }) => {
      res.applyA(tr.a)
      const updatedVal = tr.b?.attrs.value
      if (updatedVal !== null) {
        if (res.b == null) res.b = delta.create()
        if (delta.$setAttrOp.check(updatedVal)) {
          res.b.setAttr(key, updatedVal.value)
        } else if (delta.$modifyAttrOp.check(updatedVal)) {
          res.b.modifyAttr(key, updatedVal.value)
        } else if (delta.$deleteAttrOp.check(updatedVal)) {
          res.b.deleteAttr(key)
        }
      }
    })
    return res
  }
}

/**
 * Create a {@link ProjectionTransformer} projecting onto node `name` with the given attrs/children.
 *
 * @param {string} name
 * @param {{ [K in string|number]: any }} attrs
 * @param {Array<Array<any> | string>} children
 */
export const projection = (name, attrs, children) => new ProjectionTransformer(name, attrs, children)
