import * as t from '../testing.js'
import * as gf2 from './rabin-gf2-polynomial.js'
import { RabinUncachedEncoder } from './rabin-uncached.js'
import * as rabin from './rabin.js'
import * as math from '../math.js'
import * as array from '../array.js'
import * as prng from '../prng.js'
import * as buffer from '../buffer.js'
import * as map from '../map.js'

/**
 * @param {t.TestCase} _tc
 */
export const testPolynomialBasics = _tc => {
  const bs = new Uint8Array([1, 11])
  const p = gf2.createFromBytes(bs)
  t.assert(p.degrees.has(3))
  t.assert(p.degrees.has(1))
  t.assert(p.degrees.has(0))
  t.assert(p.degrees.has(8))
}

/**
 * @param {t.TestCase} _tc
 */
export const testIrreducibleInput = _tc => {
  const pa = gf2.createFromUint(0x53)
  const pb = gf2.createFromUint(0xCA)
  const pm = gf2.createFromUint(0x11B)
  const px = gf2.multiply(pa, pb)
  t.compare(new Uint8Array([0x53]), gf2.toUint8Array(pa))
  t.compare(new Uint8Array([0xCA]), gf2.toUint8Array(pb))
  t.assert(gf2.equals(gf2.createFromUint(0x3F7E), px))
  t.compare(new Uint8Array([0x3F, 0x7E]), gf2.toUint8Array(px))
  const pabm = gf2.mod(px, pm)
  t.compare(new Uint8Array([0x1]), gf2.toUint8Array(pabm))
}

/**
 * @param {t.TestCase} _tc
 */
export const testIrreducibleSpread = _tc => {
  const degree = 32
  const N = 1000
  const avgSpread = getSpreadAverage(degree, N)
  const diffSpread = math.abs(avgSpread - degree)
  t.info(`Average spread for degree ${degree} at ${N} repetitions: ${avgSpread}`)
  t.assert(diffSpread < 4, 'Spread of irreducible polynomials is within expected range')
}

/**
 * @param {number} degree
 * @param {number} tests
 */
const getSpreadAverage = (degree, tests) => {
  const spreads = []
  for (let i = 0, test = 0, lastI = 0; test < tests; i++) {
    const f = gf2.createRandom(degree)
    t.assert(gf2.getHighestDegree(f) === degree)
    if (gf2.isIrreducibleBenOr(f)) {
      const spread = i - lastI
      spreads.push(spread)
      lastI = i
      test++
    }
  }
  return array.fold(spreads, 0, math.add) / tests
}

/**
 * @param {t.TestCase} _tc
 */
export const testGenerateIrreducibles = _tc => {
  /**
   * @param {number} byteLen
   */
  const testIrreducibleGen = byteLen => {
    const K = byteLen * 8
    const irr = gf2.createIrreducible(K)
    t.assert(gf2.getHighestDegree(irr) === K, 'degree equals K')
    const irrBs = gf2.toUint8Array(irr)
    console.log(`K = ${K}`, irrBs)
    t.assert(irrBs[0] === 1)
    t.assert(irrBs.byteLength === byteLen + 1)
  }
  testIrreducibleGen(1)
  testIrreducibleGen(2)
  testIrreducibleGen(4)
  testIrreducibleGen(8)
  testIrreducibleGen(16)
  gf2.isIrreducibleBenOr(gf2.createFromBytes(rabin.StandardIrreducible8))
  gf2.isIrreducibleBenOr(gf2.createFromBytes(rabin.StandardIrreducible16))
  gf2.isIrreducibleBenOr(gf2.createFromBytes(rabin.StandardIrreducible32))
  gf2.isIrreducibleBenOr(gf2.createFromBytes(rabin.StandardIrreducible64))
  gf2.isIrreducibleBenOr(gf2.createFromBytes(rabin.StandardIrreducible128))
}

/**
 * @param {t.TestCase} tc
 * @param {number} K
 */
const _testFingerprintCompatiblityK = (tc, K) => {
  /**
   * @type {Array<Uint8Array>}
   */
  const dataObjects = []
  const N = 300
  const MSIZE = 130
  t.info(`N=${N} K=${K} MSIZE=${MSIZE}`)
  /**
   * @type {gf2.GF2Polynomial}
   */
  let irreducible
  /**
   * @type {Uint8Array}
   */
  let irreducibleBuffer
  t.measureTime(`find irreducible of ${K}`, () => {
    irreducible = gf2.createIrreducible(K)
    irreducibleBuffer = gf2.toUint8Array(irreducible)
  })
  for (let i = 0; i < N; i++) {
    dataObjects.push(prng.uint8Array(tc.prng, MSIZE))
  }
  /**
   * @type {Array<Uint8Array>}
   */
  let fingerprints1 = []
  t.measureTime('polynomial direct', () => {
    fingerprints1 = dataObjects.map((o, _index) => gf2.fingerprint(o, irreducible))
  })
  const testSet = new Set(fingerprints1.map(buffer.toBase64))
  t.assert(K < 32 || testSet.size === N)
  /**
   * @type {Array<Uint8Array>}
   */
  let fingerprints2 = []
  t.measureTime('polynomial incremental', () => {
    fingerprints2 = dataObjects.map((o, _index) => {
      const encoder = new gf2.RabinPolynomialEncoder(irreducible)
      for (let i = 0; i < o.byteLength; i++) {
        encoder.write(o[i])
      }
      return encoder.getFingerprint()
    })
  })
  t.compare(fingerprints1, fingerprints2)
  /**
   * @type {Array<Uint8Array>}
   */
  let fingerprints3 = []
  t.measureTime('polynomial incremental (efficent))', () => {
    fingerprints3 = dataObjects.map((o, _index) => {
      const encoder = new RabinUncachedEncoder(irreducibleBuffer)
      for (let i = 0; i < o.byteLength; i++) {
        encoder.write(o[i])
      }
      return encoder.getFingerprint()
    })
  })
  t.compare(fingerprints1, fingerprints3)
  // ensuring that the cache is already populated
  // @ts-ignore
  // eslint-disable-next-line
  new rabin.RabinEncoder(irreducibleBuffer)
  /**
   * @type {Array<Uint8Array>}
   */
  let fingerprints4 = []
  t.measureTime('polynomial incremental (efficent & cached)) using encoder', () => {
    fingerprints4 = dataObjects.map((o, _index) => {
      const encoder = new rabin.RabinEncoder(irreducibleBuffer)
      for (let i = 0; i < o.byteLength; i++) {
        encoder.write(o[i])
      }
      return encoder.getFingerprint()
    })
  })
  t.compare(fingerprints1, fingerprints4)
  /**
   * @type {Array<Uint8Array>}
   */
  let fingerprints5 = []
  t.measureTime('polynomial incremental (efficent & cached))', () => {
    fingerprints5 = dataObjects.map((o, _index) => {
      return rabin.fingerprint(irreducibleBuffer, o)
    })
  })
  t.compare(fingerprints1, fingerprints5)
}

/**
 * @param {t.TestCase} tc
 */
export const testFingerprintCompatiblity = tc => {
  _testFingerprintCompatiblityK(tc, 8)
  _testFingerprintCompatiblityK(tc, 16)
  _testFingerprintCompatiblityK(tc, 32)
  _testFingerprintCompatiblityK(tc, 64)
  _testFingerprintCompatiblityK(tc, 128)
}

/**
 * @param {t.TestCase} tc
 */
export const testConflicts = tc => {
  /**
   * @type {Array<Uint8Array>}
   */
  const data = []
  const N = 100
  const Irr = rabin.StandardIrreducible8
  t.measureTime(`generate ${N} items`, () => {
    for (let i = 0; i < N; i++) {
      data.push(prng.uint8Array(tc.prng, prng.uint32(tc.prng, 5, 50)))
    }
  })
  /**
   * @type {Map<string, Set<string>>}
   */
  const results = new Map()
  t.measureTime(`fingerprint ${N} items`, () => {
    data.forEach(d => {
      const f = buffer.toBase64(rabin.fingerprint(Irr, d))
      map.setIfUndefined(results, f, () => new Set()).add(buffer.toBase64(d))
    })
  })
  const conflicts = array.fold(map.map(results, (ds) => ds.size - 1), 0, math.add)
  const usedFields = results.size
  const unusedFieds = math.pow(2, (Irr.length - 1) * 8) - results.size
  console.log({ conflicts, usedFields, unusedFieds })
}
