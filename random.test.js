import * as random from './random.js'
import * as t from './testing.js'
import * as binary from './binary.js'
import * as math from './math.js'

/**
 * @param {t.TestCase} tc
 */
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

/**
 * @param {t.TestCase} tc
 */
export const testUuidv4 = tc => {
  t.info(`Generated a UUIDv4: ${random.uuidv4()}`)
}

/**
 * @param {t.TestCase} tc
 */
export const testUuidv4Overlaps = tc => {
  t.skip(!t.production)
  const iterations = 1000000
  const uuids = new Set()
  for (let i = 0; i < iterations; i++) {
    const uuid = random.uuidv4()
    if (uuids.has(uuid)) {
      t.fail('uuid already exists')
    } else {
      uuids.add(uuid)
    }
    if (uuids.size % (iterations / 20) === 0) {
      t.info(`${math.round(uuids.size * 100 / iterations)}% complete`)
    }
  }
  t.assert(uuids.size === iterations)
}
