import * as t from './testing.js'
import * as buffer from './buffer.js'
import * as prng from './prng.js'

/**
 * @param {t.TestCase} tc
 */
export const testRepeatBase64Encoding = tc => {
  const gen = tc.prng
  const barr = prng.uint8Array(gen, 100000)
  const encoded = buffer.toBase64(barr)
  t.assert(encoded.constructor === String)
  const decoded = buffer.fromBase64(encoded)
  t.assert(decoded.constructor = Uint8Array)
  t.assert(decoded.byteLength === barr.byteLength)
  for (let i = 0; i < barr.length; i++) {
    t.assert(barr[i] === decoded[i])
  }
}
