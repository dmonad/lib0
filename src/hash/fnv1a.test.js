import * as t from '../testing.js'
import * as fnv1a from './fnv1a.js'
import * as string from '../string.js'
import * as prng from '../prng.js'
import * as array from '../array.js'

/**
 * Reference implementation using BigInt arithmetic.
 *
 * @param {Uint8Array} data
 */
const refDigest = data => {
  let hash = 0x811c9dc5n
  for (let i = 0; i < data.length; i++) {
    hash = ((hash ^ BigInt(data[i])) * 0x01000193n) & 0xffffffffn
  }
  return Number(hash)
}

/**
 * Test vectors from http://www.isthe.com/chongo/src/fnv/test_fnv.c (fnv_32a)
 *
 * @param {t.TestCase} _tc
 */
export const testFnv1aTestVectors = _tc => {
  /**
   * @param {string} data
   * @param {number} result
   */
  const test = (data, result) => {
    t.assert(fnv1a.digest(string.encodeUtf8(data)) === result, `digest("${data}") === ${result.toString(16)}`)
    t.assert(fnv1a.digestString(data) === result, `digestString("${data}") === ${result.toString(16)}`)
  }
  test('', 0x811c9dc5)
  test('a', 0xe40c292c)
  test('b', 0xe70c2de5)
  test('foobar', 0xbf9cf968)
  test('chongo was here!\n', 0xd49930d5)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatFnv1aAgainstReference = tc => {
  const data = prng.uint8Array(tc.prng, prng.uint32(tc.prng, 0, 1000))
  const expected = refDigest(data)
  t.assert(fnv1a.digest(data) === expected, 'matches reference implementation')
  // digesting in chunks yields the same result
  const splitPos = prng.uint32(tc.prng, 0, data.length)
  t.assert(fnv1a.digest(data.subarray(splitPos), fnv1a.digest(data.subarray(0, splitPos))) === expected, 'chunked digest matches')
}

/**
 * `digestString` must hash exactly like `digest` over the utf8 encoding - including astral
 * code points and lone surrogates (which TextEncoder encodes as the replacement character).
 *
 * @param {t.TestCase} _tc
 */
export const testDigestStringUnicode = _tc => {
  ;['ÿ', '€', '🌍', 'a🌍€z', '\ud800', '\udfff', 'a\ud800b', '\udc00\ud800'].forEach(str => {
    t.assert(fnv1a.digestString(str) === fnv1a.digest(string.encodeUtf8(str)), `digestString("${str}") matches utf8 digest`)
  })
}

/**
 * @param {prng.PRNG} gen
 */
const genString = gen => {
  let str = ''
  const len = prng.uint32(gen, 0, 100)
  for (let i = 0; i < len; i++) {
    // sample all utf8 sizes equally; 0x800-0xffff includes (possibly lone) surrogates
    str += String.fromCodePoint(prng.oneOf(gen, [
      () => prng.uint32(gen, 0, 0x7f),
      () => prng.uint32(gen, 0x80, 0x7ff),
      () => prng.uint32(gen, 0x800, 0xffff),
      () => prng.uint32(gen, 0x10000, 0x10ffff)
    ])())
  }
  return str
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatDigestStringAgainstUtf8Digest = tc => {
  const str = genString(tc.prng)
  t.assert(fnv1a.digestString(str) === fnv1a.digest(string.encodeUtf8(str)), 'digestString matches utf8 digest')
  // digesting in chunks yields the same result (when not splitting a surrogate pair)
  const a = prng.word(tc.prng)
  const b = prng.word(tc.prng)
  t.assert(fnv1a.digestString(b, fnv1a.digestString(a)) === fnv1a.digestString(a + b), 'chunked digestString matches')
}

/**
 * @param {t.TestCase} _tc
 */
export const testBenchmarkFnv1a = _tc => {
  /**
   * @param {number} N
   * @param {number} BS
   */
  const bench = (N, BS) => {
    const gen = prng.create(42)
    const datas = array.unfold(N, () => prng.uint8Array(gen, BS))
    t.measureTime(`Hash ${N} random values of size ${BS}`, () => {
      for (let i = 0; i < N; i++) {
        const x = fnv1a.digest(datas[i])
        if (x === null) throw new Error()
      }
    })
  }
  bench(10 * 1000, 10)
  bench(10 * 1000, 50)
  t.skip(!t.extensive)
  bench(10 * 1000, 1000)
  bench(10, 5 * 1000 * 1000)
}

/**
 * Note: benchmark via `node ./src/test.js` - under coverage (`npm test`) the c8/V8 block-coverage
 * counters slow the pure-js digestString loop ~6x while leaving the native TextEncoder untouched,
 * inverting the result.
 *
 * @param {t.TestCase} _tc
 */
export const testBenchmarkDigestString = _tc => {
  const N = 10000
  const gen = prng.create(42)
  const strs = array.unfold(N, () => prng.word(gen, 10, 15))
  // warm up the JIT and flatten the rope strings that `+=` concatenation produced - otherwise
  // the first measurement pays the one-time flattening cost for all strings
  strs.forEach(str => { fnv1a.digestString(str); fnv1a.digest(string.encodeUtf8(str)) })
  t.group(`Hash ${N} random words of length 10-15`, () => {
    t.measureTime('digestString (specialized)', () => {
      for (let i = 0; i < N; i++) {
        const x = fnv1a.digestString(strs[i])
        if (x === null) throw new Error()
      }
    })
    t.measureTime('digest(encodeUtf8(str))', () => {
      for (let i = 0; i < N; i++) {
        const x = fnv1a.digest(string.encodeUtf8(strs[i]))
        if (x === null) throw new Error()
      }
    })
  })
}
