import * as random from './random.js'
import * as t from './testing.js'
import * as binary from './binary.js'

export const testUint32 = tc => {
  let num = 0
  let newNum = 0
  for (let i = 0; i < 10000; i++) {
    newNum = random.uint32()
    if (newNum > num) {
      num = newNum
    }
  }
  t.info(`Largest number generated is ${num} (0x${num.toString(16)})`)
  t.assert((num & binary.BIT32) !== 0, 'Largest number is 32 bits long.')
}
