import * as storage from './storage'
import * as t from './testing'

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
