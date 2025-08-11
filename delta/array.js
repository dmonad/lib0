import * as error from '../error.js'
import * as s from '../schema.js'
import { AbstractDeltaArrayBuilder } from './abstract-array.js'

/**
 * @template Content
 * @typedef {import('./abstract-array.js').AbstractDeltaArray<'array',import('./abstract-array.js').DeltaArrayOps<Content>>} DeltaArray
 */

/**
 * @template ArrayContent
 * @extends AbstractDeltaArrayBuilder<'array', import('./abstract-array.js').DeltaArrayOps<ArrayContent>>
 */
export class DeltaArrayBuilder extends AbstractDeltaArrayBuilder {
  /**
   * @param {s.$Schema<ArrayContent>} $insert
   */
  constructor ($insert) {
    super('array', $insert)
  }
}

/**
 * @template [V=any]
 * @param {s.$Schema<V>} $insert
 * @return {DeltaArrayBuilder<V>}
 */
export const createDeltaArray = ($insert = s.$any) => new DeltaArrayBuilder($insert)

/**
 * @template {'custom' | 'text' | 'array'} T
 * @param {import('./abstract-array.js').DeltaJson} ops
 * @param {T} type
 */
export const fromJSON = (ops, type) => {
  const d = new AbstractDeltaArrayBuilder(type, s.$any)
  for (let i = 0; i < ops.length; i++) {
    const op = /** @type {any} */ (ops[i])
    // @ts-ignore
    if (op.insert !== undefined) {
      d.insert(op.insert, op.attributes, op.attribution)
    } else if (op.retain !== undefined) {
      d.retain(op.retain, op.attributes ?? null, op.attribution ?? null)
    } else if (op.delete !== undefined) {
      d.delete(op.delete)
    } else {
      error.unexpectedCase()
    }
  }
  return d.done()
}

export { $modifyOp, $insertOp, $insertOpAny, $retainOp, $deleteOp } from './abstract-array.js'
