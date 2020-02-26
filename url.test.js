import * as t from './testing.js'
import * as url from './url.js'

/**
 * @param {Object<string,any>} params
 */
const paramTest = params => {
  const out = url.decodeQueryParams(url.encodeQueryParams(params))
  t.compareObjects(params, out, 'Compare params')
}

/**
 * @param {t.TestCase} tc
 */
export const testUrlParamQuery = tc => {
  paramTest({})
  paramTest({ a: '4' })
  paramTest({ a: 'dtrn', b: '0x0' })

  t.compareObjects({ }, url.decodeQueryParams('http://localhost:8080/dtrn?'))
  t.compareObjects({ a: 'ay' }, url.decodeQueryParams('http://localhost:8080/dtrn?a=ay'))
  t.compareObjects({ a: '' }, url.decodeQueryParams('http://localhost:8080/dtrn?a='))
  t.compareObjects({ a: '' }, url.decodeQueryParams('http://localhost:8080/dtrn?a'))
  t.compareObjects({ a: 'ay' }, url.decodeQueryParams('http://localhost:8080/dtrn?a=ay&'))
  t.compareObjects({ a: 'ay', b: 'bey' }, url.decodeQueryParams('http://localhost:8080/dtrn?a=ay&b=bey'))
}
