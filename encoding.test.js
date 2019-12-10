/** eslint-env: browser */

import * as encoding from './encoding.js'
import * as decoding from './decoding.js'
import * as prng from './prng.js'
import * as t from './testing.js'
import * as string from './string.js'
import * as binary from './binary.js'
import * as buffer from './buffer.js'
import * as number from './number.js'

/**
 * @type {Array<function(prng.PRNG, number):any>}
 */
const genAnyLookupTable = [
  gen => undefined, // TYPE 127
  gen => null, // TYPE 126
  gen => prng.int53(gen, number.LOWEST_INT32, number.HIGHEST_INT32), // TYPE 125
  gen => prng.real53(gen), // TYPE 124 and 123
  // gen => BigInt(prng.int53(gen, number.MIN_SAFE_INTEGER, number.MAX_SAFE_INTEGER)), // TYPE 122
  gen => true, // TYPE 121
  gen => false, // TYPE 120
  gen => prng.utf16String(gen), // TYPE 119
  (gen, depth) => ({ val: genAny(gen, depth + 1) }), // TYPE 118
  (gen, depth) => Array.from({ length: prng.int31(gen, 0, 20 - depth) }).map(() => genAny(gen, depth + 1)), // TYPE 117
  gen => prng.uint8Array(gen, prng.int31(gen, 0, 50)) // TYPE 116
]

/**
 * @param {prng.PRNG} gen
 * @param {number} _depth The current call-depth
 */
const genAny = (gen, _depth = 0) => prng.oneOf(gen, genAnyLookupTable)(gen, _depth)

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
    const buffer = encoding.toUint8Array(encoder)
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
  let reader = decoding.createDecoder(encoding.toUint8Array(encoder))
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
  const decoder = decoding.createDecoder(encoding.toUint8Array(encoder))
  const peeked = decoding.peekVarString(decoder)
  const result = decoding.readVarString(decoder)
  t.compareStrings(s, result)
  t.compareStrings(s, peeked)
}

/**
 * @param {t.TestCase} tc
 */
export const testAnyEncodeDate = tc => {
  test('Encode current date', encoding.writeAny, decoding.readAny, new Date().getTime())
}

/**
 * @param {t.TestCase} tc
 */
export const testEncodeMax32bitUint = tc => {
  test('max 32bit uint', encoding.writeVarUint, decoding.readVarUint, binary.BITS32)
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
export const testVarIntEncoding = tc => {
  test('varInt 1 byte', encoding.writeVarInt, decoding.readVarInt, -42)
  test('varInt 2 bytes', encoding.writeVarInt, decoding.readVarInt, -(1 << 9 | 3))
  test('varInt 3 bytes', encoding.writeVarInt, decoding.readVarInt, -(1 << 17 | 1 << 9 | 3))
  test('varInt 4 bytes', encoding.writeVarInt, decoding.readVarInt, -(1 << 25 | 1 << 17 | 1 << 9 | 3))
  test('varInt of -691529286', encoding.writeVarInt, decoding.readVarInt, -(691529286))
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
export const testRepeatVarIntEncoding = tc => {
  const n = prng.int31(tc.prng, 0, binary.BITS32)
  test(`varInt of ${n}`, encoding.writeVarInt, decoding.readVarInt, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatAnyEncoding = tc => {
  const n = genAny(tc.prng)
  test(`any encoding`, encoding.writeAny, decoding.readAny, n, false)
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
export const testRepeatPeekVarIntEncoding = tc => {
  const n = prng.int31(tc.prng, 0, binary.BITS32)
  test(`varInt of ${n}`, encoding.writeVarInt, decoding.peekVarInt, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testAnyVsJsonEncoding = tc => {
  const n = Array.from({ length: 5000 }).map(() => genAny(tc.prng))
  t.measureTime('lib0 any encoding', () => {
    const encoder = encoding.createEncoder()
    encoding.writeAny(encoder, n)
    const buffer = encoding.toUint8Array(encoder)
    t.info('buffer length is ' + buffer.length)
    decoding.readAny(decoding.createDecoder(buffer))
  })
  t.measureTime('JSON.stringify encoding', () => {
    const encoder = encoding.createEncoder()
    encoding.writeVarString(encoder, JSON.stringify(n))
    const buffer = encoding.toUint8Array(encoder)
    t.info('buffer length is ' + buffer.length)
    JSON.parse(decoding.readVarString(decoding.createDecoder(buffer)))
  })
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
  const buf = encoding.toUint8Array(encoder)
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
 * @param {any} a
 * @param {any} b
 * @return {boolean}
 */
const strictComparison = (a, b) => a === b

/**
 * @typedef {Object} EncodingPair
 * @property {function(decoding.Decoder):any} EncodingPair.read
 * @property {function(encoding.Encoder,any):void} EncodingPair.write
 * @property {function(prng.PRNG):any} EncodingPair.gen
 * @property {function(any,any):boolean} EncodingPair.compare
 * @property {string} name
 */

/**
 * @template T
 * @type {Array<EncodingPair>}
 */
const encodingPairs = [
  { name: 'uint8Array', read: decoder => decoding.readUint8Array(decoder, defLen), write: encoding.writeUint8Array, gen: gen => prng.uint8Array(gen, defLen), compare: t.compare },
  { name: 'varUint8Array', read: decoding.readVarUint8Array, write: encoding.writeVarUint8Array, gen: gen => prng.uint8Array(gen, prng.int31(gen, 0, defLen)), compare: t.compare },
  { name: 'uint8', read: decoding.readUint8, write: encoding.writeUint8, gen: gen => prng.uint32(gen, 0, binary.BITS8), compare: strictComparison },
  { name: 'uint16', read: decoding.readUint16, write: encoding.writeUint16, gen: gen => prng.uint32(gen, 0, binary.BITS16), compare: strictComparison },
  { name: 'uint32', read: decoding.readUint32, write: encoding.writeUint32, gen: gen => prng.uint32(gen, 0, binary.BITS32), compare: strictComparison },
  { name: 'varString', read: decoding.readVarString, write: encoding.writeVarString, gen: gen => prng.utf16String(gen, prng.int31(gen, 0, defLen)), compare: strictComparison },
  { name: 'varUint', read: decoding.readVarUint, write: encoding.writeVarUint, gen: gen => prng.uint53(gen, 0, binary.BITS32), compare: strictComparison },
  { name: 'varInt', read: decoding.readVarInt, write: encoding.writeVarInt, gen: gen => prng.int53(gen, number.LOWEST_INT32, number.HIGHEST_INT32), compare: strictComparison },
  { name: 'Any', read: decoding.readAny, write: encoding.writeAny, gen: genAny, compare: t.compare }
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
      compare: pair.compare,
      read: pair.read,
      val,
      name: pair.name
    })
  }
  const tailData = prng.uint8Array(gen, prng.int31(gen, 0, defLen))
  encoding.writeUint8Array(encoder, tailData)
  const buf = encoding.toUint8Array(encoder)
  const decoder = decoding.createDecoder(buf)
  t.assert(encoding.length(encoder) === buf.byteLength)
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]
    const val = o.read(decoder)
    t.assert(o.compare(val, o.val), o.name)
  }
  t.compare(tailData, decoding.readTailAsUint8Array(decoder))
}

/**
 * @param {t.TestCase} tc
 */
export const testWriteUint8ArrayOverflow = tc => {
  const encoder = encoding.createEncoder()
  const initialLen = encoder.cbuf.byteLength
  const buf = buffer.createUint8ArrayFromLen(initialLen * 4)
  for (let i = 0; i < buf.length; i++) {
    buf[i] = i
  }
  encoding.writeUint8Array(encoder, buf)
  encoding.write(encoder, 42)
  const res = encoding.toUint8Array(encoder)
  t.assert(res.length === initialLen * 4 + 1)
  for (let i = 0; i < buf.length - 1; i++) {
    t.assert(res[i] === (i % 256))
  }
  t.assert(res[initialLen * 4] === 42)
}

/**
 * @param {t.TestCase} tc
 */
export const testSetOnOverflow = tc => {
  const encoder = encoding.createEncoder()
  const initialLen = encoder.cbuf.byteLength
  encoder.cpos = initialLen - 2
  encoding.writeUint32(encoder, binary.BITS32)
  const buf = encoding.toUint8Array(encoder)
  t.assert(encoding.length(encoder) === initialLen + 2)
  const decoder = decoding.createDecoder(buf)
  const space = buffer.createUint8ArrayFromArrayBuffer(decoding.readUint8Array(decoder, initialLen - 2))
  for (let i = 0; i < initialLen - 2; i++) {
    t.assert(space[i] === 0)
  }
  t.assert(decoding.hasContent(decoder))
  t.assert(binary.BITS32 === decoding.readUint32(decoder))
  t.assert(!decoding.hasContent(decoder))
  encoding.setUint8(encoder, 5, binary.BITS8)
  encoding.setUint8(encoder, initialLen + 1, 7)
  const buf2 = encoding.toUint8Array(encoder)
  t.assert(buf2[5] === binary.BITS8)
  t.assert(buf[5] === 0, 'old buffer is not affected')
  t.assert(buf2[initialLen + 1] === 7)
}

/**
 * @param {t.TestCase} tc
 */
export const testCloneDecoder = tc => {
  const encoder = encoding.createEncoder()
  encoding.writeUint8(encoder, 12132)
  encoding.writeVarUint(encoder, 329840128734)
  encoding.writeVarString(encoder, 'dtrnuiaednudiaendturinaedt nduiaen dturinaed ')
  const buf = encoding.toUint8Array(encoder)
  const decoder = decoding.createDecoder(buf)
  decoding.skip8(decoder)
  const decoder2 = decoding.clone(decoder)
  const payload1 = decoding.readTailAsUint8Array(decoder)
  const payload2 = decoding.readTailAsUint8Array(decoder2)
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
  const buf = encoding.toUint8Array(encoder2)
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
  const buf = encoding.toUint8Array(encoder)
  const decoder = decoding.createDecoder(buf)
  t.assert(longStr === decoding.readVarString(decoder))
}
