import * as t from 'lib0/testing'
import * as dxml from './xml.js'
import * as darray from './array.js'

/**
 * @param {t.TestCase} _tc
 */
export const testXmlDelta = _tc => {
  const d = /** @type {dxml.XmlDelta<string, string, { a: 1 }>} */ (dxml.createXmlDelta('test'))
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
      if (darray.$insertOpAny.check(op)) {
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
