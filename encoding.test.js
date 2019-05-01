import * as encoding from './encoding.js'
import * as decoding from './decoding.js'
import * as prng from './prng.js'
import * as t from './testing.js'
import * as string from './string.js'
import * as binary from './binary.js'
import * as buffer from './buffer.js'

/**
 * Check if binary encoding is compatible with golang binary encoding - binary.PutVarUint.
 *
 * Result: is compatible up to 32 bit: [0, 4294967295] / [0, 0xffffffff]. (max 32 bit unsigned integer)
 */
export const testGolangBinaryEncodingCompatibility = () => {
  const tests = [
    { in: 0, out: [0] },
    { in: 1, out: [1] },
    { in: 128, out: [128, 1] },
    { in: 200, out: [200, 1] },
    { in: 32, out: [32] },
    { in: 500, out: [244, 3] },
    { in: 256, out: [128, 2] },
    { in: 700, out: [188, 5] },
    { in: 1024, out: [128, 8] },
    { in: 1025, out: [129, 8] },
    { in: 4048, out: [208, 31] },
    { in: 5050, out: [186, 39] },
    { in: 1000000, out: [192, 132, 61] },
    { in: 34951959, out: [151, 166, 213, 16] },
    { in: 2147483646, out: [254, 255, 255, 255, 7] },
    { in: 2147483647, out: [255, 255, 255, 255, 7] },
    { in: 2147483648, out: [128, 128, 128, 128, 8] },
    { in: 2147483700, out: [180, 128, 128, 128, 8] },
    { in: 4294967294, out: [254, 255, 255, 255, 15] },
    { in: 4294967295, out: [255, 255, 255, 255, 15] }
  ]
  tests.forEach(test => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, test.in)
    const buffer = new Uint8Array(encoding.toArrayBuffer(encoder))
    t.assert(buffer.byteLength === test.out.length)
    t.assert(buffer.length > 0)
    for (let j = 0; j < buffer.length; j++) {
      t.assert(buffer[j] === test.out[j])
    }
  })
}

/**
 * @template T
 * @param {string} testname
 * @param {function(encoding.Encoder, T):void} write
 * @param {function(decoding.Decoder):T} read
 * @param {T} val
 * @param {boolean} doLog
 */
function test (testname, write, read, val, doLog = true) {
  let encoder = encoding.createEncoder()
  write(encoder, val)
  let reader = decoding.createDecoder(encoding.toArrayBuffer(encoder))
  let result = read(reader)
  const utf8ByteLength = string.utf8ByteLength(val + '')
  const binaryByteLength = encoding.length(encoder)
  if (doLog) {
    t.describe(testname, ` utf8 encode: ${utf8ByteLength} bytes / binary encode: ${binaryByteLength} bytes`)
  }
  t.compare(val, result)
  return {
    utf8ByteLength,
    binaryByteLength
  }
}

/**
 * @param {string} s
 */
const testVarString = s => {
  const encoder = encoding.createEncoder()
  encoding.writeVarString(encoder, s)
  const decoder = decoding.createDecoder(encoding.toArrayBuffer(encoder))
  const peeked = decoding.peekVarString(decoder)
  const result = decoding.readVarString(decoder)
  t.compareStrings(s, result)
  t.compareStrings(s, peeked)
}

/**
 * @param {t.TestCase} tc
 */
export const testVarUintEncoding = tc => {
  test('varUint 1 byte', encoding.writeVarUint, decoding.readVarUint, 42)
  test('varUint 2 bytes', encoding.writeVarUint, decoding.readVarUint, 1 << 9 | 3)
  test('varUint 3 bytes', encoding.writeVarUint, decoding.readVarUint, 1 << 17 | 1 << 9 | 3)
  test('varUint 4 bytes', encoding.writeVarUint, decoding.readVarUint, 1 << 25 | 1 << 17 | 1 << 9 | 3)
  test('varUint of 2839012934', encoding.writeVarUint, decoding.readVarUint, 2839012934)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatVarUintEncoding = tc => {
  const n = prng.int31(tc.prng, 0, (1 << 28) - 1)
  test(`varUint of ${n}`, encoding.writeVarUint, decoding.readVarUint, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatPeekVarUintEncoding = tc => {
  const n = prng.int31(tc.prng, 0, (1 << 28) - 1)
  test(`varUint of ${n}`, encoding.writeVarUint, decoding.peekVarUint, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testStringEncoding = tc => {
  testVarString('hello')
  testVarString('test!')
  testVarString('☺☺☺')
  testVarString('')
  testVarString('1234')
  testVarString('쾟')
  testVarString('龟') // surrogate length 3
  testVarString('😝') // surrogate length 4
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatStringEncoding = tc =>
  testVarString(prng.utf16String(tc.prng))

/**
 * @param {t.TestCase} tc
 */
export const testSetMethods = tc => {
  const encoder = encoding.createEncoder()
  encoding.writeUint8(encoder, 1)
  encoding.writeUint16(encoder, 33)
  encoding.writeUint32(encoder, 29329)
  encoding.setUint8(encoder, 0, 8)
  encoding.setUint16(encoder, 1, 16)
  encoding.setUint32(encoder, 3, 32)
  const buf = encoding.toArrayBuffer(encoder)
  const decoder = decoding.createDecoder(buf)
  t.assert(decoding.peekUint8(decoder) === 8)
  decoding.readUint8(decoder)
  t.assert(decoding.peekUint16(decoder) === 16)
  decoding.readUint16(decoder)
  t.assert(decoding.peekUint32(decoder) === 32)
  decoding.readUint32(decoder)
}

const defLen = 1000
const loops = 10000

/**
 * @typedef {Object} EncodingPair
 * @property {function(decoding.Decoder):any} EncodingPair.read
 * @property {function(encoding.Encoder,any):void} EncodingPair.write
 * @property {function(prng.PRNG):any} EncodingPair.gen
 */

/**
 * @template T
 * @type {Array<EncodingPair>}
 */
const encodingPairs = [
  { read: decoder => decoding.readArrayBuffer(decoder, defLen), write: encoding.writeArrayBuffer, gen: gen => prng.arrayBuffer(gen, defLen) },
  { read: decoding.readPayload, write: encoding.writePayload, gen: gen => prng.arrayBuffer(gen, prng.int31(gen, 0, defLen)) },
  { read: decoding.readUint8, write: encoding.writeUint8, gen: gen => prng.uint32(gen, 0, binary.BITS8) },
  { read: decoding.readUint16, write: encoding.writeUint16, gen: gen => prng.uint32(gen, 0, binary.BITS16) },
  { read: decoding.readUint32, write: encoding.writeUint32, gen: gen => prng.uint32(gen, 0, binary.BITS32) },
  { read: decoding.readVarString, write: encoding.writeVarString, gen: gen => prng.utf16String(gen, prng.int31(gen, 0, defLen)) },
  { read: decoding.readVarUint, write: encoding.writeVarUint, gen: gen => prng.uint53(gen, 0, binary.BITS32) }
]

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomWrites = tc => {
  t.describe(`Writing ${loops} random values`, `defLen=${defLen}`)
  const gen = tc.prng
  const ops = []
  const encoder = encoding.createEncoder()
  for (let i = 0; i < 10000; i++) {
    const pair = prng.oneOf(gen, encodingPairs)
    const val = pair.gen(gen)
    pair.write(encoder, val)
    ops.push({
      read: pair.read,
      val
    })
  }
  const tailData = prng.arrayBuffer(gen, prng.int31(gen, 0, defLen))
  encoding.writeArrayBuffer(encoder, tailData)
  const buf = encoding.toArrayBuffer(encoder)
  const decoder = decoding.createDecoder(buf)
  t.assert(encoding.length(encoder) === buf.byteLength)
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]
    const val = o.read(decoder)
    t.compare(val, o.val)
  }
  t.compare(tailData, decoding.readTail(decoder))
}

/**
 * @param {t.TestCase} tc
 */
export const testSetOnOverflow = tc => {
  const encoder = encoding.createEncoder()
  const initialLen = encoder.cbuf.byteLength
  encoder.cpos = initialLen - 2
  encoding.writeUint32(encoder, binary.BITS32)
  const buf = encoding.toArrayBuffer(encoder)
  t.assert(encoding.length(encoder) === initialLen + 2)
  const decoder = decoding.createDecoder(buf)
  const space = buffer.createUint8ArrayFromArrayBuffer(decoding.readArrayBuffer(decoder, initialLen - 2))
  for (let i = 0; i < initialLen - 2; i++) {
    t.assert(space[i] === 0)
  }
  t.assert(decoding.hasContent(decoder))
  t.assert(binary.BITS32 === decoding.readUint32(decoder))
  t.assert(!decoding.hasContent(decoder))
  encoding.setUint8(encoder, 5, binary.BITS8)
  encoding.setUint8(encoder, initialLen + 1, 7)
  const buf2 = encoding.toArrayBuffer(encoder)
  t.assert(buffer.createUint8ArrayFromArrayBuffer(buf2)[5] === binary.BITS8)
  t.assert(buffer.createUint8ArrayFromArrayBuffer(buf)[5] === 0, 'old buffer is not affected')
  t.assert(buffer.createUint8ArrayFromArrayBuffer(buf2)[initialLen + 1] === 7)
}

/**
 * @param {t.TestCase} tc
 */
export const testCloneDecoder = tc => {
  const encoder = encoding.createEncoder()
  encoding.writeUint8(encoder, 12132)
  encoding.writeVarUint(encoder, 329840128734)
  encoding.writeVarString(encoder, 'dtrnuiaednudiaendturinaedt nduiaen dturinaed ')
  const buf = encoding.toArrayBuffer(encoder)
  const decoder = decoding.createDecoder(buf)
  decoding.skip8(decoder)
  const decoder2 = decoding.clone(decoder)
  const payload1 = decoding.readTail(decoder)
  const payload2 = decoding.readTail(decoder2)
  t.compare(payload1, payload2)
}

/**
 * @param {t.TestCase} tc
 */
export const testWriteBinaryEncoder = tc => {
  const encoder = encoding.createEncoder()
  encoding.writeUint16(encoder, 4)
  const encoder2 = encoding.createEncoder()
  encoding.writeVarUint(encoder2, 143095)
  encoding.writeBinaryEncoder(encoder2, encoder)
  const buf = encoding.toArrayBuffer(encoder2)
  const decoder = decoding.createDecoder(buf)
  t.assert(decoding.readVarUint(decoder) === 143095)
  t.assert(decoding.readUint16(decoder) === 4)
}

/**
 * @param {t.TestCase} tc
 */
export const testOverflowStringDecoding = tc => {
  const gen = tc.prng
  const encoder = encoding.createEncoder()
  let longStr = ''
  while (longStr.length < 11000) {
    longStr += prng.utf16String(gen, 100000)
  }
  encoding.writeVarString(encoder, longStr)
  const buf = encoding.toArrayBuffer(encoder)
  const decoder = decoding.createDecoder(buf)
  t.assert(longStr === decoding.readVarString(decoder))
}
