/* global BigInt */
import * as encoding from './encoding.js'
import * as decoding from './decoding.js'
import * as prng from './prng.js'
import * as t from './testing.js'
import * as string from './string.js'
import * as binary from './binary.js'
import * as buffer from './buffer.js'
import * as number from './number.js'
import * as math from './math.js'

/**
 * @type {Array<function(prng.PRNG, number, boolean):any>}
 */
let genAnyLookupTable = [
  gen => BigInt(prng.int53(gen, number.MIN_SAFE_INTEGER, number.MAX_SAFE_INTEGER)), // TYPE 122
  gen => undefined, // TYPE 127
  gen => null, // TYPE 126
  gen => prng.int53(gen, number.MIN_SAFE_INTEGER, number.MAX_SAFE_INTEGER), // TYPE 125
  gen => prng.real53(gen), // TYPE 124 and 123
  gen => true, // TYPE 121
  gen => false, // TYPE 120
  gen => prng.utf16String(gen), // TYPE 119
  (gen, depth, toJsonCompatible) => ({ val: genAny(gen, depth + 1, toJsonCompatible) }), // TYPE 118
  (gen, depth, toJsonCompatible) => Array.from({ length: prng.uint32(gen, 0, 20 - depth) }).map(() => genAny(gen, depth + 1, toJsonCompatible)), // TYPE 117
  gen => prng.uint8Array(gen, prng.uint32(gen, 0, 50)) // TYPE 116
]

const genAnyLookupTableJsonCompatible = genAnyLookupTable.slice(1)

if (typeof BigInt === 'undefined') {
  genAnyLookupTable = genAnyLookupTable.slice(1)
}

/**
 * @param {prng.PRNG} gen
 * @param {number} _depth The current call-depth
 */
const genAny = (gen, _depth = 0, toJsonCompatible = false) => prng.oneOf(gen, toJsonCompatible ? genAnyLookupTableJsonCompatible : genAnyLookupTable)(gen, _depth, toJsonCompatible)

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
  const encoder = encoding.createEncoder()
  write(encoder, val)
  const reader = decoding.createDecoder(encoding.toUint8Array(encoder))
  const result = read(reader)
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

export const testStringEncodingPerformanceNativeVsPolyfill = () => {
  const largeRepetitions = 20
  let bigstr = ''
  for (let i = 0; i < 10000; i++) {
    bigstr += i
  }

  const customTime = t.measureTime('large dataset: custom encoding', () => {
    const encoder = encoding.createEncoder()
    for (let i = 0; i < largeRepetitions; i++) {
      encoding._writeVarStringPolyfill(encoder, 'i')
      encoding._writeVarStringPolyfill(encoder, bigstr)
    }
  })
  const nativeTime = t.measureTime('large dataset: native encoding', () => {
    const encoder = encoding.createEncoder()
    for (let i = 0; i < largeRepetitions; i++) {
      encoding._writeVarStringNative(encoder, 'i')
      encoding._writeVarStringNative(encoder, bigstr)
    }
  })
  t.assert(nativeTime < customTime, 'We expect native encoding to be more performant for large data sets')

  const smallRepetitions = 100000
  const customTimeSmall = t.measureTime('small dataset: custom encoding', () => {
    const encoder = encoding.createEncoder()
    for (let i = 0; i < smallRepetitions; i++) {
      encoding._writeVarStringPolyfill(encoder, 'i')
      encoding._writeVarStringPolyfill(encoder, 'bb')
      encoding._writeVarStringPolyfill(encoder, 'ccc')
    }
  })
  const nativeTimeSmall = t.measureTime('small dataset: native encoding', () => {
    const encoder = encoding.createEncoder()
    for (let i = 0; i < smallRepetitions; i++) {
      encoding._writeVarStringNative(encoder, 'i')
      encoding._writeVarStringNative(encoder, 'bb')
      encoding._writeVarStringNative(encoder, 'ccc')
    }
  })
  t.assert(nativeTimeSmall < customTimeSmall * 2, 'We expect native encoding to be not much worse than custom encoding for small data sets')
}

export const testDecodingPerformanceNativeVsPolyfill = () => {
  const iterationsSmall = 10000
  const iterationsLarge = 1000
  let bigstr = ''
  for (let i = 0; i < 10000; i++) {
    bigstr += i
  }
  const encoder = encoding.createEncoder()
  const encoderLarge = encoding.createEncoder()
  for (let i = 0; i < iterationsSmall; i++) {
    encoding.writeVarString(encoder, 'i')
    encoding.writeVarString(encoder, 'bb')
    encoding.writeVarString(encoder, 'ccc')
  }
  for (let i = 0; i < iterationsLarge; i++) {
    encoding.writeVarString(encoderLarge, bigstr)
  }
  const buf = encoding.toUint8Array(encoder)
  const bufLarge = encoding.toUint8Array(encoderLarge)

  const nativeTimeSmall = t.measureTime('small dataset: native encoding', () => {
    const decoder = decoding.createDecoder(buf)
    while (decoding.hasContent(decoder)) {
      decoding._readVarStringNative(decoder)
    }
  })

  const polyfillTimeSmall = t.measureTime('small dataset: polyfill encoding', () => {
    const decoder = decoding.createDecoder(buf)
    while (decoding.hasContent(decoder)) {
      decoding.readVarString(decoder)
    }
  })

  const nativeTimeLarge = t.measureTime('large dataset: native encoding', () => {
    const decoder = decoding.createDecoder(bufLarge)
    while (decoding.hasContent(decoder)) {
      decoding._readVarStringNative(decoder)
    }
  })

  const polyfillTimeLarge = t.measureTime('large dataset: polyfill encoding', () => {
    const decoder = decoding.createDecoder(bufLarge)
    while (decoding.hasContent(decoder)) {
      decoding._readVarStringPolyfill(decoder)
    }
  })

  t.assert(nativeTimeSmall < polyfillTimeSmall * 1.5, 'Small dataset: We expect native decoding to be not much worse than')
  t.assert(nativeTimeLarge < polyfillTimeLarge, 'Large dataset: We expect native decoding to be much better than polyfill decoding')
}

export const testStringDecodingPerformance = () => {
  // test if it is faster to read N single characters, or if it is faster to read N characters in one flush.
  // to make the comparison meaningful, we read read N characters in an Array
  const N = 2000000
  const durationSingleElements = t.measureTime('read / write single elements', () => {
    const encoder = encoding.createEncoder()
    t.measureTime('read / write single elements - write', () => {
      for (let i = 0; i < N; i++) {
        encoding.writeVarString(encoder, 'i')
      }
    })
    const decoder = decoding.createDecoder(encoding.toUint8Array(encoder))
    t.measureTime('read / write single elements - read', () => {
      const arr = []
      for (let i = 0; i < N; i++) {
        arr.push(decoding.readVarString(decoder))
      }
    })
  })

  const durationConcatElements = t.measureTime('read / write concatenated string', () => {
    let stringbuf = new Uint8Array()
    const encoder = encoding.createEncoder()
    const encoderLengths = encoding.createEncoder()
    t.measureTime('read / write concatenated string - write', () => {
      let s = ''
      for (let i = 0; i < N; i++) {
        s += 'i'
        encoding.writeVarUint(encoderLengths, 1) // we write a single char.
        if (i % 20 === 0) {
          encoding.writeVarString(encoder, s)
          s = ''
        }
      }
      encoding.writeVarString(encoder, s)
      stringbuf = encoding.toUint8Array(encoder)
    })
    const decoder = decoding.createDecoder(stringbuf)
    const decoderLengths = decoding.createDecoder(encoding.toUint8Array(encoderLengths))
    t.measureTime('read / write concatenated string - read', () => {
      const arr = []
      const concatS = decoding.readVarString(decoder)
      for (let i = 0; i < N; i++) {
        const len = decoding.readVarUint(decoderLengths)
        arr.push(concatS.slice(i, len)) // push using slice
      }
    })
  })
  t.assert(durationConcatElements < durationSingleElements, 'We expect that the second approach is faster. If this fails, our expectantion is not met in your javascript environment. Please report this issue.')
}

/**
 * @param {t.TestCase} tc
 */
export const testAnyEncodeUnknowns = tc => {
  const encoder = encoding.createEncoder()
  // @ts-ignore
  encoding.writeAny(encoder, Symbol('a'))
  encoding.writeAny(encoder, undefined)
  encoding.writeAny(encoder, () => {})
  const decoder = decoding.createDecoder(encoding.toUint8Array(encoder))
  t.assert(decoding.readAny(decoder) === undefined)
  t.assert(decoding.readAny(decoder) === undefined)
  t.assert(decoding.readAny(decoder) === undefined)
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
  test('varUint of 2^53', encoding.writeVarUint, decoding.readVarUint, number.MAX_SAFE_INTEGER)
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
  test('varInt of 2^53', encoding.writeVarInt, decoding.readVarInt, number.MAX_SAFE_INTEGER)
  test('varInt of -2^53', encoding.writeVarInt, decoding.readVarInt, number.MIN_SAFE_INTEGER)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatVarUintEncoding = tc => {
  const n = prng.uint32(tc.prng, 0, (1 << 28) - 1)
  test(`varUint of ${n}`, encoding.writeVarUint, decoding.readVarUint, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatVarUintEncoding53bit = tc => {
  const n = prng.uint53(tc.prng, 0, number.MAX_SAFE_INTEGER)
  test(`varUint of ${n}`, encoding.writeVarUint, decoding.readVarUint, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatVarIntEncoding = tc => {
  const n = prng.int32(tc.prng, number.LOWEST_INT32, binary.BITS32)
  test(`varInt of ${n}`, encoding.writeVarInt, decoding.readVarInt, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatVarIntEncoding53bit = tc => {
  const n = prng.int32(tc.prng, number.MIN_SAFE_INTEGER, number.MAX_SAFE_INTEGER)
  test(`varInt of ${n}`, encoding.writeVarInt, decoding.readVarInt, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeanntAnyEncoding = tc => {
  const n = genAny(tc.prng)
  test('any encoding', encoding.writeAny, decoding.readAny, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatPeekVarUintEncoding = tc => {
  const n = prng.int32(tc.prng, 0, (1 << 28) - 1)
  test(`varUint of ${n}`, encoding.writeVarUint, decoding.peekVarUint, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatPeekVarIntEncoding = tc => {
  const n = prng.int53(tc.prng, number.MIN_SAFE_INTEGER, number.MAX_SAFE_INTEGER)
  test(`varInt of ${n}`, encoding.writeVarInt, decoding.peekVarInt, n, false)
}

/**
 * @param {t.TestCase} tc
 */
export const testAnyVsJsonEncoding = tc => {
  const n = Array.from({ length: 5000 }).map(() => genAny(tc.prng, 5, true))
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
  { name: 'varUint8Array', read: decoding.readVarUint8Array, write: encoding.writeVarUint8Array, gen: gen => prng.uint8Array(gen, prng.uint32(gen, 0, defLen)), compare: t.compare },
  { name: 'uint8', read: decoding.readUint8, write: encoding.writeUint8, gen: gen => prng.uint32(gen, 0, binary.BITS8), compare: strictComparison },
  { name: 'uint16', read: decoding.readUint16, write: encoding.writeUint16, gen: gen => prng.uint32(gen, 0, binary.BITS16), compare: strictComparison },
  { name: 'uint32', read: decoding.readUint32, write: encoding.writeUint32, gen: gen => prng.uint32(gen, 0, binary.BITS32), compare: strictComparison },
  { name: 'uint32bigEndian', read: decoding.readUint32BigEndian, write: encoding.writeUint32BigEndian, gen: gen => prng.uint32(gen, 0, binary.BITS32), compare: strictComparison },
  { name: 'varString', read: decoding.readVarString, write: encoding.writeVarString, gen: gen => prng.utf16String(gen, prng.uint32(gen, 0, defLen)), compare: strictComparison },
  { name: 'varUint', read: decoding.readVarUint, write: encoding.writeVarUint, gen: gen => prng.uint53(gen, 0, number.MAX_SAFE_INTEGER), compare: strictComparison },
  { name: 'varInt', read: decoding.readVarInt, write: encoding.writeVarInt, gen: gen => prng.int53(gen, number.MIN_SAFE_INTEGER, number.MAX_SAFE_INTEGER), compare: strictComparison },
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
  const tailData = prng.uint8Array(gen, prng.int32(gen, 0, defLen))
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

/**
 * @param {t.TestCase} tc
 */
export const testRleEncoder = tc => {
  const N = 100
  const encoder = new encoding.RleEncoder(encoding.writeVarUint)
  for (let i = 0; i < N; i++) {
    encoder.write(i)
    for (let j = 0; j < i; j++) { // write additional i times
      encoder.write(i)
    }
  }
  const decoder = new decoding.RleDecoder(encoding.toUint8Array(encoder), decoding.readVarUint)
  for (let i = 0; i < N; i++) {
    t.assert(i === decoder.read())
    for (let j = 0; j < i; j++) { // read additional i times
      t.assert(i === decoder.read())
    }
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testRleIntDiffEncoder = tc => {
  const N = 100
  const encoder = new encoding.RleIntDiffEncoder(0)
  for (let i = -N; i < N; i++) {
    encoder.write(i)
    for (let j = 0; j < i; j++) { // write additional i times
      encoder.write(i)
    }
  }
  const decoder = new decoding.RleIntDiffDecoder(encoding.toUint8Array(encoder), 0)
  for (let i = -N; i < N; i++) {
    t.assert(i === decoder.read())
    for (let j = 0; j < i; j++) { // read additional i times
      t.assert(i === decoder.read())
    }
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testUintOptRleEncoder = tc => {
  const N = 100
  const encoder = new encoding.UintOptRleEncoder()
  for (let i = 0; i < N; i++) {
    encoder.write(i)
    for (let j = 0; j < i; j++) { // write additional i times
      encoder.write(i)
    }
  }
  const decoder = new decoding.UintOptRleDecoder(encoder.toUint8Array())
  for (let i = 0; i < N; i++) {
    t.assert(i === decoder.read())
    for (let j = 0; j < i; j++) { // read additional i times
      t.assert(i === decoder.read())
    }
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testIntDiffRleEncoder = tc => {
  const N = 100
  const encoder = new encoding.IntDiffOptRleEncoder()
  for (let i = -N; i < N; i++) {
    encoder.write(i)
    for (let j = 0; j < i; j++) { // write additional i times
      encoder.write(i)
    }
  }
  const decoder = new decoding.IntDiffOptRleDecoder(encoder.toUint8Array())
  for (let i = -N; i < N; i++) {
    t.assert(i === decoder.read())
    for (let j = 0; j < i; j++) { // read additional i times
      t.assert(i === decoder.read())
    }
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testIntEncoders = tc => {
  const arrLen = 10000
  const gen = tc.prng
  /**
   * @type {Array<number>}
   */
  const vals = []
  for (let i = 0; i < arrLen; i++) {
    if (prng.bool(gen)) {
      vals.push(prng.int53(gen, math.floor(number.MIN_SAFE_INTEGER / 2), math.floor(number.MAX_SAFE_INTEGER / 2)))
    } else {
      vals.push(prng.int32(gen, -10, 10))
    }
  }
  /**
   * @type {Array<{ encoder: any, read: function(any):any }>}
   */
  const intEncoders = [
    { encoder: new encoding.IntDiffOptRleEncoder(), read: encoder => new decoding.IntDiffOptRleDecoder(encoder.toUint8Array()) },
    { encoder: new encoding.IntDiffEncoder(0), read: encoder => new decoding.IntDiffDecoder(encoding.toUint8Array(encoder), 0) },
    { encoder: new encoding.IntDiffEncoder(42), read: encoder => new decoding.IntDiffDecoder(encoding.toUint8Array(encoder), 42) },
    { encoder: new encoding.RleIntDiffEncoder(0), read: encoder => new decoding.RleIntDiffDecoder(encoding.toUint8Array(encoder), 0) }
  ]
  intEncoders.forEach(({ encoder, read }) => {
    vals.forEach(v => encoder.write(v))
    /**
     * @type {Array<number>}
     */
    const readVals = []
    const dec = read(encoder)
    for (let i = 0; i < arrLen; i++) {
      readVals.push(dec.read())
    }
    t.compare(vals, readVals)
  })
}

/**
 * @param {t.TestCase} tc
 */
export const testIntDiffEncoder = tc => {
  const N = 100
  const encoder = new encoding.IntDiffEncoder(0)
  for (let i = -N; i < N; i++) {
    encoder.write(i)
  }
  const decoder = new decoding.IntDiffDecoder(encoding.toUint8Array(encoder), 0)
  for (let i = -N; i < N; i++) {
    t.assert(i === decoder.read())
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testStringDecoder = tc => {
  const gen = tc.prng
  const N = 1000
  const words = []
  for (let i = 0; i < N; i++) {
    words.push(prng.utf16String(gen))
    if (i % 100 === 0) {
      const char = prng.char(gen).slice(0, 1)
      words.push(char)
      words.push(char)
    }
    if (i % 107 === 0) {
      words.push(prng.word(gen, 3000, 8000))
    }
  }
  const encoder = new encoding.StringEncoder()
  for (let i = 0; i < words.length; i++) {
    encoder.write(words[i])
  }
  const decoder = new decoding.StringDecoder(encoder.toUint8Array())
  for (let i = 0; i < words.length; i++) {
    t.assert(decoder.read() === words[i])
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testLargeNumberAnyEncoding = tc => {
  const encoder = encoding.createEncoder()
  const num = -2.2062063918362897e+50
  encoding.writeAny(encoder, num)
  const decoder = decoding.createDecoder(encoding.toUint8Array(encoder))
  const readNum = decoding.readAny(decoder)
  t.assert(readNum === num)
}
