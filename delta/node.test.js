import * as t from 'lib0/testing'
import * as delta from './index.js'
import * as $ from '../schema.js'

/**
 * @param {t.TestCase} _tc
 */
export const testNodeDelta = _tc => {
  const d = /** @type {delta.Node<string, { a: 1 }, string>} */ (delta.node('test'))
  d.children.insert(['hi'])
  // @ts-expect-error
  d.children.insert([42])
  d.attributes.set('a', 1)
  d.attributes.delete('a', 1)
  /**
   * @type {Array<Array<string|number>| string | number>}
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

export const testRecursiveNode = () => {
  const $d = delta.$node($.$string, $.$object({ q: $.$number, m: $.$string }), $.$never, { recursive: true, withText: true })
  const d = delta.node('hi', { q: 42 })
  $d.expect(d)
  // should detect invalid attrs
  // @ts-expect-error
  t.assert(!$d.validate(delta.node('hi', { q: 'fortytwo' })))
  // when manipulating unknown props, ts should warn. but it is technically allowed to add unknown
  // properties, in the same sense as { x: 42, y: 42 } can be casted to { x: number }.
  // @ts-expect-error
  t.assert($d.validate(delta.node('hi', { p: 42 })))
  // should detect invalid child (of type string)
  // @ts-expect-error
  t.assert(!$d.validate(delta.node('hi', { q: 42 }, ['dtrn'])))
  // should allow no attributes
  t.assert($d.validate(delta.node('hi', {}, [])))
  // should allow adding valid children (of type $d)
  const p = delta.node('hi', {}, [d])
  t.assert($d.validate(p))
  // should allow adding text
  t.assert($d.validate(delta.node('hi', {}, 'hi')))
}
