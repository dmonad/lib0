
import * as binary from './binary.js'
import * as t from './testing.js'

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
