import * as t from '../testing.js'
import * as sha256 from './sha256.js'
import * as buffer from '../buffer.js'
import * as string from '../string.js'
import * as prng from '../prng.js'
import * as webcrypto from 'lib0/webcrypto'
import * as promise from '../promise.js'

/**
 * @param {t.TestCase} _tc
 */
export const testSha256Basics = async _tc => {
  /**
   * @param {string | Uint8Array} data input data (buffer or hex encoded)
   * @param {string} result Expected result (hex encoded)
   */
  const test = async (data, result) => {
    data = typeof data === 'string' ? buffer.fromHexString(data) : data
    const res = sha256.hash(data)
    const resHex = buffer.toHexString(res)
    t.assert(resHex === result)
    const resWebcrypto = new Uint8Array(await webcrypto.subtle.digest('SHA-256', data))
    const resWebcryptoHex = buffer.toHexString(resWebcrypto)
    t.assert(resWebcryptoHex === result)
  }

  await test(string.encodeUtf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
  await test(string.encodeUtf8('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  await test('', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatSha256Hashing = async tc => {
  const LEN = prng.bool(tc.prng) ? prng.uint32(tc.prng, 0, 512) : prng.uint32(tc.prng, 0, 3003030)
  console.log(LEN)
  const data = prng.uint8Array(tc.prng, LEN)
  const hashedCustom = sha256.hash(data)
  const hashedWebcrypto = new Uint8Array(await webcrypto.subtle.digest('SHA-256', data))
  t.compare(hashedCustom, hashedWebcrypto)
}

/**
 * @param {t.TestCase} _tc
 */
export const testBenchmarkSha256 = async _tc => {
  const N = 10000 // 100k
  const BS = 530
  /**
   * @type {Array<Uint8Array>}
   */
  const datas = []
  for (let i = 0; i < N; i++) {
    const data = new Uint8Array(BS)
    webcrypto.getRandomValues(data)
    datas.push(data)
  }
  t.measureTime(`[webcrypto sequentially] Time to hash ${N} random values of size ${BS}`, async () => {
    for (let i = 0; i < N; i++) {
      await webcrypto.subtle.digest('SHA-256', datas[i])
    }
  })
  t.measureTime(`[webcrypto concurrent] Time to hash ${N} random values of size ${BS}`, async () => {
    /**
     * @type {Array<Promise<any>>}
     */
    const ps = []
    for (let i = 0; i < N; i++) {
      ps.push(webcrypto.subtle.digest('SHA-256', datas[i]))
    }
    await promise.all(ps)
  })
  t.measureTime(`[lib0] Time to hash ${N} random values of size ${BS}`, () => {
    for (let i = 0; i < N; i++) {
      sha256.hash(datas[i])
    }
  })
}
