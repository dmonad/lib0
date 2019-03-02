import * as t from './testing.js'
import * as math from './math.js'

export const testComparing = () => {
  t.compare({}, {})
  t.compare({ a: 4 }, { a: 4 }, 'simple compare')
  t.fails(() => {
    t.compare({ a: 4 }, { b: 5 })
  })
}

export const testFailing = () => {
  t.fails(() => {
    t.fail('This fail is expected')
  })
}

export const testSkipping = () => {
  t.skip()
  t.fail('should have skipped')
}

export const testRepeatRepitition = () => {
  const arr = []
  const n = 100
  for (let i = 1; i <= n; i++) {
    arr.push(i)
  }
  t.assert(arr.reduce(math.add, 0) === (n+1)*n/2, 'We can count the smart way')
}
