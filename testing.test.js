import * as t from './testing.js'
import * as math from './math.js'
import * as binary from './binary.js'

export const testComparing = () => {
  t.compare({}, {})
  t.compare({ a: 4 }, { a: 4 }, 'simple compare (object)')
  t.compare([1, 2], [1, 2], 'simple compare (array)')
  t.compare({ a: [1, 2] }, { a: [1, 2] }, 'simple compare nested')

  t.fails(() => {
    t.compare({ a: 4 }, { b: 5 }, 'childs are not equal')
  })
  t.fails(() => {
    t.compare({ a: 4 }, [4], 'childs have different types')
  })
  t.fails(() => {
    t.compare({ a: 4 }, { a: 4, b: 5 }, 'childs have different length (object)')
  })
  t.fails(() => {
    t.compare([1], [1, 2]) // childs have different length (array) -- no message
  })
  t.fails(() => {
    t.compare(binary.createUint8ArrayFromLen(1), binary.createUint8ArrayFromLen(2), 'ArrayBuffer have different length')
  })
  t.fails(() => {
    t.compareStrings('str1', 'str2', 'Strings comparison can fail')
  })
  t.compareArrays([], [], 'Comparing empty arrays')
  t.fails(() => {
    t.compareArrays([1], [1, 2], 'Compare arrays with different length')
  })
  t.fails(() => {
    t.compareArrays([1], [2]) // Compare different arrays -- no message
  })
  t.compareObjects({ x: 1 }, { x: 1 }, 'comparing objects')
  t.fails(() => {
    t.compareObjects({}, { x: 1 }, 'compareObjects can fail')
  })
  t.fails(() => {
    t.compareObjects({ x: 3 }, { x: 1 }) // Compare different objects -- no message
  })
}

export const testFailing = () => {
  t.fails(() => {
    t.fail('This fail is expected')
  })
}

export const testSkipping = () => {
  t.skip()
  /* istanbul ignore next */
  t.fail('should have skipped')
}

export const testRepeatRepitition = () => {
  const arr = []
  const n = 100
  for (let i = 1; i <= n; i++) {
    arr.push(i)
  }
  t.assert(arr.reduce(math.add, 0) === (n + 1) * n / 2)
}
