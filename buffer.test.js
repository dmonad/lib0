import * as t from './testing.js'
import * as buffer from './buffer.js'
import * as prng from './prng.js'
import * as decoding from './decoding.js'

/**
 * @param {t.TestCase} tc
 * @param {function(Uint8Array):string} encoder
 * @param {function(string):Uint8Array} decoder
 */
const testEncodingHelper = (tc, encoder, decoder) => {
  const gen = tc.prng
  const barr = prng.uint8Array(gen, prng.uint32(gen, 0, 47))
  const copied = buffer.copyUint8Array(barr)
  const encoded = encoder(barr)
  t.assert(encoded.constructor === String)
  const decoded = decoder(encoded)
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
export const testRepeatBase64urlEncoding = tc => {
  testEncodingHelper(tc, buffer.toBase64UrlEncoded, buffer.fromBase64UrlEncoded)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatBase64Encoding = tc => {
  testEncodingHelper(tc, buffer.toBase64, buffer.fromBase64)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatHexEncoding = tc => {
  testEncodingHelper(tc, buffer.toHexString, buffer.fromHexString)
}

/**
 * @param {t.TestCase} _tc
 */
export const testAnyEncoding = _tc => {
  const obj = { val: 1, arr: [1, 2], str: '409231dtrnä' }
  const res = buffer.decodeAny(buffer.encodeAny(obj))
  t.compare(obj, res)
}

/**
 * Views must never expose bytes outside of the source view (e.g. from a pooled ArrayBuffer).
 *
 * @param {t.TestCase} _tc
 */
export const testDecodingViewBounds = _tc => {
  const backing = new Uint8Array([9, 1, 2, 3, 9])
  const arr = new Uint8Array(backing.buffer, 1, 3)
  const decoder = decoding.createDecoder(arr)
  decoding.readUint8(decoder)
  t.fails(() => decoding.readUint8Array(decoder, 3))
  t.fails(() => decoding.readUint8Array(decoder, -1))
  t.fails(() => decoding.readFloat32(decoder))
  t.compare(decoding.readUint8Array(decoder, 2), new Uint8Array([2, 3]))
  t.assert(decoding.readUint8Array(decoder, 0).length === 0)
  t.fails(() => decoding.readUint8Array(decoder, 1))
}

/**
 * The decoded result must own its ArrayBuffer (Node allocates small Buffers from a shared pool).
 *
 * @param {t.TestCase} _tc
 */
export const testFromBase64OwnsBuffer = _tc => {
  const decoded = buffer.fromBase64(buffer.toBase64(new Uint8Array([1, 2, 3])))
  t.compare(decoded, new Uint8Array([1, 2, 3]))
  t.assert(decoded.byteOffset === 0 && decoded.buffer.byteLength === 3)
}
