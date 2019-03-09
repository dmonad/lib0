import * as encoding from './encoding.js'
import * as decoding from './decoding.js'
import * as prng from './prng.js'
import * as t from './testing.js'
import * as string from './string.js'
import * as binary from './binary.js'

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
    const buffer = new Uint8Array(encoding.toBuffer(encoder))
    if (buffer.byteLength !== test.out.length) {
      t.fail('Length don\'t match!')
    }
    for (let j = 0; j < buffer.length; j++) {
      if (buffer[j] !== test.out[j]) {
        t.fail('values don\'t match!')
      }
    }
  })
}

function test (testname, write, read, val, doLog = true) {
  let encoder = encoding.createEncoder()
  write(encoder, val)
  let reader = decoding.createDecoder(encoding.toBuffer(encoder))
  let result = read(reader)
  const utf8ByteLength = string.utf8ByteLength(val + '')
  const binaryByteLength = encoding.length(encoder)
  if (doLog) {
    t.describe(testname, ` utf8 encode: ${utf8ByteLength} bytes / binary encode: ${binaryByteLength} bytes`)
  }
  t.compareStrings(val + '', result + '')
  return {
    utf8ByteLength,
    binaryByteLength
  }
}

const testVarString = (s) => {
  let encoder = encoding.createEncoder()
  encoding.writeVarString(encoder, s)
  let reader = decoding.createDecoder(encoding.toBuffer(encoder))
  let result = decoding.readVarString(reader)
  t.compareStrings(s, result)
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

export const testRepeatVarUintEncoding = tc => {
  const n = prng.int31(tc.prng, 0, (1 << 28) - 1)
  test(`varUint of ${n}`, encoding.writeVarUint, decoding.readVarUint, n, false)
}

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

export const testRepeatStringEncoding = tc =>
  testVarString(prng.utf16String(tc.prng))

const defLen = 1000
const loops = 10000

/**
 * @type {Array<any>}
 */
const encodingPairs = [
  { read: decoder => decoding.readArrayBuffer(decoder, defLen), write: encoding.writeArrayBuffer, gen: gen => prng.arrayBuffer(gen, defLen) },
  { read: decoding.readPayload, write: encoding.writePayload, gen: gen => prng.arrayBuffer(gen, prng.int31(gen, 0, defLen)) },
  { read: decoding.readUint8, write: encoding.writeUint8, gen: gen => prng.int53(gen, 0, binary.BITS8) },
  { read: decoding.readUint16, write: encoding.writeUint16, gen: gen => prng.int53(gen, 0, binary.BITS16) },
  { read: d => decoding.readUint32(d) >>> 0, write: encoding.writeUint32, gen: gen => prng.int53(gen, binary.BITS32, binary.BITS31) >>> 0 },
  { read: decoding.readVarString, write: encoding.writeVarString, gen: gen => prng.utf16String(gen, prng.int31(gen, 0, defLen)) },
  { read: decoding.readVarUint, write: encoding.writeVarUint, gen: gen => prng.uint53(gen, 0, binary.BITS31) }
]

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
  const decoder = decoding.createDecoder(encoding.toBuffer(encoder))
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]
    const val = o.read(decoder)
    t.compare(val, o.val)
  }
  t.compare(tailData, decoding.readTail(decoder))
}
