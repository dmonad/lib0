import * as prng from './prng.js'
import * as string from './string.js'
import * as t from './testing.js'

/**
 * @param {t.TestCase} tc
 */
export const testLowercaseTransformation = tc => {
  t.compareStrings(string.fromCamelCase('ThisIsATest', ' '), 'this is a test')
  t.compareStrings(string.fromCamelCase('Testing', ' '), 'testing')
  t.compareStrings(string.fromCamelCase('testingThis', ' '), 'testing this')
  t.compareStrings(string.fromCamelCase('testYAY', ' '), 'test y a y')
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatStringUtf8Encoding = tc => {
  t.skip(!string.utf8TextDecoder)
  const str = prng.utf16String(tc.prng, 1000000)
  let nativeResult, polyfilledResult
  t.measureTime('TextEncoder utf8 encoding', () => {
    nativeResult = string._encodeUtf8Native(str)
  })
  t.measureTime('Polyfilled utf8 encoding', () => {
    polyfilledResult = string._encodeUtf8Polyfill(str)
  })
  t.compare(nativeResult, polyfilledResult, 'Encoded utf8 buffers match')
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatStringUtf8Decoding = tc => {
  t.skip(!string.utf8TextDecoder)
  const buf = string.encodeUtf8(prng.utf16String(tc.prng, 1000000))
  let nativeResult, polyfilledResult
  t.measureTime('TextEncoder utf8 decoding', () => {
    nativeResult = string._decodeUtf8Native(buf)
  })
  t.measureTime('Polyfilled utf8 decoding', () => {
    polyfilledResult = string._decodeUtf8Polyfill(buf)
  })
  t.compare(nativeResult, polyfilledResult, 'Decoded utf8 buffers match')
}

/**
 * @param {t.TestCase} tc
 */
export const testBomEncodingDecoding = tc => {
  const bomStr = '﻿bom'
  t.assert(bomStr.length === 4)
  const polyfilledResult = string._decodeUtf8Polyfill(string._encodeUtf8Polyfill(bomStr))
  t.assert(polyfilledResult.length === 4)
  t.assert(polyfilledResult === bomStr)
  if (string.utf8TextDecoder) {
    const nativeResult = string._decodeUtf8Native(string._encodeUtf8Native(bomStr))
    t.assert(nativeResult === polyfilledResult)
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testSplice = tc => {
  const initial = 'xyz'
  t.compareStrings(string.splice(initial, 0, 2), 'z')
  t.compareStrings(string.splice(initial, 0, 2, 'u'), 'uz')
}
