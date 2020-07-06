import * as t from './testing.js'
import * as buffer from './buffer.js'
import * as prng from './prng.js'

/**
 * @param {t.TestCase} tc
 */
export const testRepeatBase64Encoding = tc => {
  const gen = tc.prng
  const barr = prng.uint8Array(gen, 100000)
  const copied = buffer.copyUint8Array(barr)
  const encoded = buffer.toBase64(barr)
  t.assert(encoded.constructor === String)
  const decoded = buffer.fromBase64(encoded)
  t.assert(decoded.constructor === Uint8Array)
  t.assert(decoded.byteLength === barr.byteLength)
  for (let i = 0; i < barr.length; i++) {
    t.assert(barr[i] === decoded[i])
  }
  t.compare(copied, decoded)
}

/**
 * @param {t.TestCase} tc
 */
export const testAnyEncoding = tc => {
  const obj = { val: 1, arr: [1, 2], str: '409231dtrnä' }
  const res = buffer.decodeAny(buffer.encodeAny(obj))
  t.compare(obj, res)
}
