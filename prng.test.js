
import { Xoroshiro128plus } from './prng/Xoroshiro128plus.js'
import * as prng from './prng.js'
import { MAX_SAFE_INTEGER } from './number.js'
import { BITS30, BIT31, BIT32, BITS31, BITS32 } from './binary.js'
import * as t from './testing.js'
import { Xorshift32 } from './prng/Xorshift32.js'
import { Mt19937 } from './prng/Mt19937.js'
import * as dom from './dom.js'
import { isBrowser } from './environment.js'

/**
 * @param {t.TestCase} tc
 * @param {prng.PRNG} gen
 */
const runGenTest = (tc, gen) => {
  t.group('bool - bool distribution is fair', () => {
    let head = 0
    let tail = 0
    let b
    let i

    for (i = 0; i < tc.repititions; i++) {
      b = prng.bool(gen)
      if (b) {
        head++
      } else {
        tail++
      }
    }
    t.info(`Generated ${head} heads and ${tail} tails.`)
    t.assert(tail >= Math.floor(tc.repititions * 0.48), 'Generated enough tails.')
    t.assert(head >= Math.floor(tc.repititions * 0.48), 'Generated enough heads.')
  })
  t.group('int31 - integers average correctly', () => {
    let count = 0
    let i

    for (i = 0; i < tc.repititions; i++) {
      count += prng.int31(gen, 0, 100)
    }
    const average = count / tc.repititions
    const expectedAverage = 100 / 2
    t.info(`Average is: ${average}. Expected average is ${expectedAverage}.`)
    t.assert(Math.abs(average - expectedAverage) <= 1, 'Expected average is at most 1 off.')
  })

  t.group('int32 - generates integer with 32 bits', () => {
    let num = 0
    let i
    let newNum
    for (i = 0; i < tc.repititions; i++) {
      newNum = prng.int32(gen, 0, BITS32)
      if (newNum > num) {
        num = newNum
      }
    }
    t.info(`Largest number generated is ${num} (0b${num.toString(2)})`)
    t.assert((num & BIT32) !== 0, 'Largest number is 32 bits long.')
  })

  t.group('int31 - generates integer with 31 bits', () => {
    let num = 0
    let i
    let newNum
    for (i = 0; i < tc.repititions; i++) {
      newNum = prng.int31(gen, 0, BITS31)
      if (newNum > num) {
        num = newNum
      }
    }
    t.info(`Largest number generated is ${num} (0b${num.toString(2)})`)
    // t.assert(num > (BIT31 >>> 0), 'Largest number is 31 bits long.')
  })

  t.group('real - has 53 bit resolution', () => {
    let num = 0
    let i
    let newNum
    for (i = 0; i < tc.repititions; i++) {
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
    for (let i = 0; i < tc.repititions; i++) {
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
// export const testGeneratorXorshift32 = tc => runGenTest(tc, new Xorshift32(tc.seed))
// export const testGeneratorMt19937 = tc => runGenTest(tc, new Mt19937(tc.seed))

/**
 * @param {prng.PRNG} gen
 * @param {t.TestCase} tc
 */
const printDistribution = (gen, tc) => {
  const DIAMETER = tc.repititions / 50
  const canvas = dom.canvas(DIAMETER * 3, DIAMETER)
  const ctx = canvas.getContext('2d')
  if (ctx == null) {
    return t.skip()
  }
  ctx.fillStyle = 'blue'
  for (let i = 0; i < tc.repititions; i++) {
    const x = prng.int31(gen, 0, DIAMETER * 3)
    const y = prng.int31(gen, 0, DIAMETER)
    ctx.fillRect(x, y, 1, 2)
  }
  t.printCanvas(canvas, DIAMETER)
}

export const testNumberDistributions = tc => {
  t.skip(!isBrowser)
  t.group('Xoroshiro128plus', () => printDistribution(new Xoroshiro128plus(tc.seed), tc))
  t.group('Xorshift32', () => printDistribution(new Xorshift32(tc.seed), tc))
  t.group('MT19937', () => printDistribution(new Mt19937(tc.seed), tc))
}
