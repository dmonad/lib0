import * as t from './testing.js'

export const testComparing = () => {
  t.compare({}, {})
  t.compare({ a: 4 }, { a: 4 }, 'simple compare')
  t.fails(() => {
    t.compare({ a: 4 }, { b: 5 })
  })
}

export const testFailing = () => {
  t.fails(() => {
    t.fail('m?')
  })
}

export const testSkipping = () => {
  t.skip()
  t.fail('should have skipped')
}
