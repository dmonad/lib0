import * as storage from './storage.js'
import * as t from './testing.js'

/**
 * @param {t.TestCase} tc
 */
export const testStorageModule = tc => {
  const s = storage.varStorage
  /**
   * @type {any}
   */
  let lastEvent = null
  storage.onChange(event => {
    lastEvent = event
  })
  s.setItem('key', 'value')
  t.assert(lastEvent === null)
}
