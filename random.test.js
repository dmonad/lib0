import * as random from './random.js'
import * as t from './testing.js'
import * as binary from './binary.js'
import * as math from './math.js'
import * as number from './number.js'

/**
 * @param {t.TestCase} tc
 */
export const testUint32 = tc => {
  const iterations = 10000
  let largest = 0
  let smallest = number.HIGHEST_INT32
  let newNum = 0
  let lenSum = 0
  let ones = 0
  for (let i = 0; i < iterations; i++) {
    newNum = random.uint32()
    lenSum += newNum.toString().length
    ones += newNum.toString(2).split('').filter(x => x === '1').length
    if (newNum > largest) {
      largest = newNum
    }
    if (newNum < smallest) {
      smallest = newNum
    }
  }
  t.info(`Largest number generated is ${largest} (0x${largest.toString(16)})`)
  t.info(`Smallest number generated is ${smallest} (0x${smallest.toString(16)})`)
  t.info(`Average decimal length of number is ${lenSum / iterations}`)
  t.info(`Average number of 1s in number is ${ones / iterations} (expecting ~16)`)
  t.assert(((largest & binary.BITS32) >>> 0) === largest, 'Largest number is 32 bits long.')
  t.assert(((smallest & binary.BITS32) >>> 0) === smallest, 'Smallest number is 32 bits long.')
}

/**
 * @param {t.TestCase} tc
 */
export const testUint53 = tc => {
  const iterations = 10000
  let largest = 0
  let smallest = number.MAX_SAFE_INTEGER
  let newNum = 0
  let lenSum = 0
  let ones = 0
  for (let i = 0; i < iterations; i++) {
    newNum = random.uint53()
    lenSum += newNum.toString().length
    ones += newNum.toString(2).split('').filter(x => x === '1').length
    if (newNum > largest) {
      largest = newNum
    }
    if (newNum < smallest) {
      smallest = newNum
    }
  }
  t.info(`Largest number generated is ${largest}`)
  t.info(`Smallest number generated is ${smallest}`)
  t.info(`Average decimal length of number is ${lenSum / iterations}`)
  t.info(`Average number of 1s in number is ${ones / iterations} (expecting ~26.5)`)
  t.assert(largest > number.MAX_SAFE_INTEGER * 0.9)
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
  const iterations = t.extensive ? 1000000 : 10000
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
