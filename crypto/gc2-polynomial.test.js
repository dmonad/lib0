import * as t from '../testing.js'
import * as gc2 from './gc2-polynomial.js'
import * as math from '../math.js'
import * as array from '../array.js'
import * as prng from '../prng.js'
import * as buffer from '../buffer.js'

/**
 * @param {t.TestCase} _tc
 */
export const testPolynomialBasics = _tc => {
  const bs = new Uint8Array([1, 11])
  const p = gc2.createFromBytes(bs)
  t.assert(p.degrees.has(3))
  t.assert(p.degrees.has(1))
  t.assert(p.degrees.has(0))
  t.assert(p.degrees.has(8))
}

/**
 * @param {t.TestCase} _tc
 */
export const testIrreducibleInput = _tc => {
  const pa = gc2.createFromUint(0x53)
  const pb = gc2.createFromUint(0xCA)
  const pm = gc2.createFromUint(0x11B)
  const px = gc2.multiply(pa, pb)
  t.compare(new Uint8Array([0x53]), gc2.toUint8Array(pa))
  t.compare(new Uint8Array([0xCA]), gc2.toUint8Array(pb))
  t.assert(gc2.equals(gc2.createFromUint(0x3F7E), px))
  t.compare(new Uint8Array([0x3F, 0x7E]), gc2.toUint8Array(px))
  const pabm = gc2.mod(px, pm)
  t.compare(new Uint8Array([0x1]), gc2.toUint8Array(pabm))
}

/**
 * @param {t.TestCase} _tc
 */
export const testIrreducibleSpread = _tc => {
  const degree = 53
  const N = 200
  const avgSpread = getSpreadAverage(degree, N)
  const diffSpread = math.abs(avgSpread - degree)
  t.info(`Average spread for degree ${degree} at ${N} repetitions: ${avgSpread}`)
  t.assert(diffSpread < 3, 'Spread of irreducible polynomials is within expected range')
}

/**
 * @param {number} degree
 * @param {number} tests
 */
const getSpreadAverage = (degree, tests) => {
  const spreads = []
  for (let i = 0, test = 0, lastI = 0; test < tests; i++) {
    const f = gc2.createRandom(degree)
    t.assert(gc2.getHighestDegree(f) === degree)
    if (gc2.isIrreducibleBenOr(f)) {
      const spread = i - lastI
      spreads.push(spread)
      lastI = i
      test++
    }
  }
  return array.fold(spreads, 0, math.add) / tests
}

/**
 * @param {t.TestCase} tc
 */
export const testFingerprint = tc => {
  /**
   * @type {Array<Uint8Array>}
   */
  const dataObjects = []
  const N = 3000
  const K = 32
  const MSIZE = 130
  t.info(`N=${N} K=${K} MSIZE=${MSIZE}`)
  /**
   * @type {gc2.GC2Polynomial}
   */
  let irreducible
  t.measureTime(`find irreducible of ${K}`, () => {
    irreducible = gc2.createIrreducible(K)
  })
  for (let i = 0; i < N; i++) {
    dataObjects.push(prng.uint8Array(tc.prng, MSIZE))
  }
  /**
   * @type {Array<Uint8Array>}
   */
  let fingerprints1 = []
  t.measureTime('polynomial direct', () => {
    fingerprints1 = dataObjects.map((o, _index) => gc2.fingerprint(o, irreducible))
  })
  const testSet = new Set(fingerprints1.map(buffer.toBase64))
  t.assert(testSet.size === N)
  /**
   * @type {Array<Uint8Array>}
   */
  let fingerprints2 = []
  t.measureTime('polynomial incremental', () => {
    fingerprints2 = dataObjects.map((o, _index) => {
      const encoder = new gc2.FingerprintEncoder(irreducible)
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
      const encoder = new gc2.EfficientFingerprintEncoder(gc2.toUint8Array(irreducible))
      for (let i = 0; i < o.byteLength; i++) {
        encoder.write(o[i])
      }
      return encoder.getFingerprint()
    })
  })
  t.compare(fingerprints1, fingerprints3)
  /**
   * @type {Array<Uint8Array>}
   */
  let fingerprints4 = []
  t.measureTime('polynomial incremental (efficent & cached))', () => {
    fingerprints4 = dataObjects.map((o, _index) => {
      const encoder = new gc2.CachedEfficientFingerprintEncoder(gc2.toUint8Array(irreducible))
      for (let i = 0; i < o.byteLength; i++) {
        encoder.write(o[i])
      }
      return encoder.getFingerprint()
    })
  })
  t.compare(fingerprints1, fingerprints4)
}
