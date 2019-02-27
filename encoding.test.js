import * as encoding from './encoding.js'
import * as decoding from './decoding.js'
import * as prng from './prng.js'
import * as t from './testing.js'
import * as string from './string.js'
import * as math from './math.js'

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

const writeVarUint = (encoder, val) => encoding.writeVarUint(encoder, val)
const readVarUint = decoder => decoding.readVarUint(decoder)

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
  test('varUint 1 byte', writeVarUint, readVarUint, 42)
  test('varUint 2 bytes', writeVarUint, readVarUint, 1 << 9 | 3)
  test('varUint 3 bytes', writeVarUint, readVarUint, 1 << 17 | 1 << 9 | 3)
  test('varUint 4 bytes', writeVarUint, readVarUint, 1 << 25 | 1 << 17 | 1 << 9 | 3)
  test('varUint of 2839012934', writeVarUint, readVarUint, 2839012934)

  t.describe(`Running ${tc.repititions} random tests on varUint`)
  let allUtf8ByteLength = 0
  let allBinaryByteLength = 0
  for (let i = 0; i < tc.repititions; i++) {
    const n = prng.int31(tc.prng, 0, (1 << 28) - 1)
    const { utf8ByteLength, binaryByteLength } = test(`varUint of ${n}`, writeVarUint, readVarUint, n, false)
    allUtf8ByteLength += utf8ByteLength
    allBinaryByteLength += binaryByteLength
  }
  t.describe(`compression of ${math.round((allBinaryByteLength / allUtf8ByteLength) * 100)}%`)
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
  t.describe(`Running ${tc.repititions} random tests on varString`)
  for (let i = 0; i < tc.repititions; i++) {
    testVarString(prng.utf16String(tc.prng))
  }
}
