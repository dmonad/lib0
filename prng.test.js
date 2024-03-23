import { Xoroshiro128plus } from './prng/Xoroshiro128plus.js'
import * as prng from './prng.js'
import { MAX_SAFE_INTEGER } from './number.js'
import * as binary from './binary.js'
import * as t from './testing.js'
import { Xorshift32 } from './prng/Xorshift32.js'
import { Mt19937 } from './prng/Mt19937.js'
import * as dom from './dom.js'
import { isBrowser, production } from './environment.js'
import * as math from './math.js'

const genTestData = 5000

/**
 * @param {t.TestCase} _tc
 * @param {prng.PRNG} gen
 */
const runGenTest = (_tc, gen) => {
  t.group('next - average distribution', () => {
    let sum = 0
    for (let i = 0; i < genTestData; i++) {
      const next = gen.next()
      if (next >= 1) {
        t.fail('unexpected prng result')
      }
      sum += next
    }
    const avg = sum / genTestData
    t.assert(avg >= 0.45)
    t.assert(avg <= 0.55)
  })

  t.group('bool - bool distribution is fair', () => {
    let head = 0
    let tail = 0
    let b
    let i

    for (i = 0; i < genTestData; i++) {
      b = prng.bool(gen)
      if (b) {
        head++
      } else {
        tail++
      }
    }
    t.info(`Generated ${head} heads and ${tail} tails.`)
    t.assert(tail >= math.floor(genTestData * 0.45), 'Generated enough tails.')
    t.assert(head >= math.floor(genTestData * 0.45), 'Generated enough heads.')
  })
  t.group('int31 - integers average correctly', () => {
    let count = 0
    let i

    for (i = 0; i < genTestData; i++) {
      count += prng.uint32(gen, 0, 100)
    }
    const average = count / genTestData
    const expectedAverage = 100 / 2
    t.info(`Average is: ${average}. Expected average is ${expectedAverage}.`)
    t.assert(math.abs(average - expectedAverage) <= 2, 'Expected average is at most 1 off.')
  })

  t.group('int32 - generates integer with 32 bits', () => {
    let largest = 0
    let smallest = 0
    let i
    let newNum
    for (i = 0; i < genTestData; i++) {
      newNum = prng.int32(gen, -binary.BITS31, binary.BITS31)
      if (newNum > largest) {
        largest = newNum
      }
      if (newNum < smallest) {
        smallest = newNum
      }
    }
    t.assert(smallest < -1000, 'Smallest number is negative')
    t.assert(largest > 1000, 'Largest number is positive')
    t.info(`Largest number generated is ${largest} (0x${largest.toString(16)})`)
    t.info(`Smallest number generated is ${smallest} (0x${smallest.toString(16)})`)
    t.assert((smallest & binary.BIT32) !== 0, 'Largest number is 32 bits long') // largest.. assuming we convert int to uint
  })

  t.group('uint32 - generates unsigned integer with 32 bits', () => {
    let num = 0
    let i
    let newNum
    for (i = 0; i < genTestData; i++) {
      newNum = prng.uint32(gen, 0, binary.BITS32)
      if (newNum > num) {
        num = newNum
      }
    }
    t.info(`Largest number generated is ${num} (0x${num.toString(16)})`)
    t.assert((num & binary.BIT32) !== 0, 'Largest number is 32 bits long.')
  })

  t.group('int53 - generates integer exceeding 32 bits', () => {
    let largest = 0
    let smallest = 0
    let i
    let newNum
    for (i = 0; i < genTestData; i++) {
      newNum = prng.int53(gen, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)
      if (newNum > largest) {
        largest = newNum
      }
      if (newNum < smallest) {
        smallest = newNum
      }
    }
    t.assert(smallest < -1000, 'Smallest number is negative')
    t.assert(largest > 1000, 'Largest number is positive')
    t.info(`Largest number generated is ${largest}`)
    t.info(`Smallest number generated is ${smallest}`)
    t.assert(largest > (binary.BITS32 >>> 0), 'Largest number exceeds BITS32')
    t.assert(smallest < binary.BITS32, 'Smallest Number is smaller than BITS32 (negative)')
  })

  t.group('uint53 - generates integer exceeding 32 bits', () => {
    let largest = 0
    let smallest = 10000
    let i
    let newNum
    for (i = 0; i < genTestData; i++) {
      newNum = prng.uint53(gen, 0, Number.MAX_SAFE_INTEGER)
      if (newNum > largest) {
        largest = newNum
      }
      /* c8 ignore next */
      if (newNum < smallest) {
        smallest = newNum
      }
    }
    t.assert(smallest >= 0, 'Smallest number is not negative')
    t.assert(largest > 1000, 'Largest number is positive')
    t.info(`Largest number generated is ${largest}`)
    t.info(`Smallest number generated is ${smallest}`)
    t.assert(largest > (binary.BITS32 >>> 0), 'Largest number exceeds BITS32')
  })

  t.group('int31 - generates integer with 31 bits', () => {
    let num = 0
    let i
    let newNum
    for (i = 0; i < genTestData; i++) {
      newNum = prng.uint32(gen, 0, binary.BITS31)
      if (newNum > num) {
        num = newNum
      }
    }
    t.info(`Largest number generated is ${num} (0x${num.toString(16)})`)
    t.assert((num & binary.BIT31) !== 0, 'Largest number is 31 bits long.')
  })

  t.group('real - has 53 bit resolution', () => {
    let num = 0
    let i
    let newNum
    for (i = 0; i < genTestData; i++) {
      newNum = prng.real53(gen) * MAX_SAFE_INTEGER
      if (newNum > num) {
        num = newNum
      }
    }
    t.info(`Largest number generated is ${num}.`)
    t.assert((MAX_SAFE_INTEGER - num) / MAX_SAFE_INTEGER < 0.01, 'Largest number is close to MAX_SAFE_INTEGER (at most 1% off).')
  })

  t.group('char - generates all ascii characters', () => {
    const charSet = new Set()
    const chars = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[/]^_`abcdefghijklmnopqrstuvwxyz{|}~"'
    for (let i = chars.length - 1; i >= 0; i--) {
      charSet.add(chars[i])
    }
    for (let i = 0; i < genTestData; i++) {
      const char = prng.char(gen)
      charSet.delete(char)
    }
    t.info(`Charactes missing: ${charSet.size} - generating all of "${chars}"`)
    t.assert(charSet.size === 0, 'Generated all documented characters.')
  })
}

/**
 * @param {t.TestCase} tc
 */
export const testGeneratorXoroshiro128plus = tc => runGenTest(tc, new Xoroshiro128plus(tc.seed))

/**
 * @param {t.TestCase} tc
 */
export const testGeneratorXorshift32 = tc => {
  t.skip(!production)
  runGenTest(tc, new Xorshift32(tc.seed))
}

/**
 * @param {t.TestCase} tc
 */
export const testGeneratorMt19937 = tc => {
  t.skip(!production)
  runGenTest(tc, new Mt19937(tc.seed))
}

/* c8 ignore next */
/**
 * @param {prng.PRNG} gen
 * @param {t.TestCase} _tc
 */
const printDistribution = (gen, _tc) => {
  const DIAMETER = genTestData / 50
  const canvas = dom.canvas(DIAMETER * 3, DIAMETER)
  const ctx = canvas.getContext('2d')
  if (ctx == null) {
    return t.skip()
  }
  ctx.fillStyle = 'blue'
  for (let i = 0; i < genTestData; i++) {
    const x = prng.int32(gen, 0, DIAMETER * 3)
    const y = prng.int32(gen, 0, DIAMETER)
    ctx.fillRect(x, y, 1, 2)
  }
  t.printCanvas(canvas, DIAMETER)
}

/* c8 ignore next */
/**
 * @param {t.TestCase} tc
 */
export const testNumberDistributions = tc => {
  t.skip(!isBrowser)
  t.group('Xoroshiro128plus', () => printDistribution(new Xoroshiro128plus(tc.seed), tc))
  t.group('Xorshift32', () => printDistribution(new Xorshift32(tc.seed), tc))
  t.group('MT19937', () => printDistribution(new Mt19937(tc.seed), tc))
}
