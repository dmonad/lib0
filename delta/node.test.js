import * as t from 'lib0/testing'
import * as delta from './index.js'

/**
 * @param {t.TestCase} _tc
 */
export const testNodeDelta = _tc => {
  const d = /** @type {delta.DeltaNode<string, { a: 1 }, string>} */ (delta.node('test'))
  d.children.insert(['hi'])
  // @ts-expect-error
  d.children.insert([42])
  d.attributes.set('a', 1)
  d.attributes.delete('a', 1)
  /**
   * @type {Array<Array<string>| number>}
   */
  const arr = []
  d.children.forEach(
    (op, index) => {
      if (delta.$insertOp.check(op)) {
        arr.push(op.insert, index)
      }
    },
    (op, index) => {
      arr.push(op.insert, index)
    },
    (op, _index) => {
      arr.push(op.retain)
    },
    (op, _index) => {
      arr.push(op.delete)
    }
  )
  t.compare(arr, [['hi', 42], 0, ['hi', 42], 0])
  const x = d.done()
  console.log(x)
}
