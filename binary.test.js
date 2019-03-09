
import * as binary from './binary.js'
import * as t from './testing.js'
import * as prng from './prng.js'

export const testBitx = tc => {
  for (let i = 1; i <= 32; i++) {
    t.assert(binary[`BIT${i}`] === (1 << (i - 1)), `BIT${i}=${1 << (i - 1)}`)
  }
}

export const testBitsx = tc => {
  t.assert(binary.BITS0 === 0)
  for (let i = 1; i < 32; i++) {
    const expected = (1 << i) - 1
    const have = binary[`BITS${i}`]
    t.assert(have === expected, `BITS${i}=${have}=${expected}`)
  }
  t.assert(binary.BITS32 === 0xFFFFFFFF)
}

export const testRepeatBase64Encoding = tc => {
  const gen = tc.prng
  const barr = prng.uint8Array(gen, 100000)
  const encoded = binary.toBase64(barr)
  t.assert(encoded.constructor === String)
  const decoded = binary.fromBase64(encoded)
  t.assert(decoded.constructor = Uint8Array)
  t.assert(decoded.byteLength === barr.byteLength)
  for (let i = 0; i < barr.length; i++) {
    t.assert(barr[i] === decoded[i])
  }
}
