import * as cryptutils from 'lib0/crypto'
import * as t from './testing.js'
import * as prng from './prng.js'

/**
 * @param {t.TestCase} tc
 */
export const testReapeatEncryption = async tc => {
  const secret = prng.word(tc.prng)
  const salt = prng.word(tc.prng)
  const data = prng.uint8Array(tc.prng, 1000000)

  /**
   * @type {any}
   */
  let encrypted
  /**
   * @type {any}
   */
  let decrypted
  /**
   * @type {any}
   */
  let key
  await t.measureTimeAsync('Key generation', async () => {
    key = await cryptutils.deriveSymmetricKey(secret, salt)
  })
  await t.measureTimeAsync('Encryption', async () => {
    encrypted = await cryptutils.encrypt(data, key)
  })
  t.info(`Byte length: ${data.byteLength}b`)
  t.info(`Encrypted length: ${encrypted.length}b`)
  await t.measureTimeAsync('Decryption', async () => {
    decrypted = await cryptutils.decrypt(encrypted, key)
  })
  t.compare(data, decrypted)
}

/**
 * @param {t.TestCase} _tc
 */
export const testConsistentKeyGeneration = async _tc => {
  const secret = 'qfycncpxhjktawlqkhc'
  const salt = 'my nonce'
  const expectedJwk = {
    key_ops: ['encrypt', 'decrypt'],
    ext: true,
    kty: 'oct',
    k: 'psAqoMh9apefdr8y1tdbNMVTLxb-tFekEFipYIOX5n8',
    alg: 'A256GCM'
  }
  const key = await cryptutils.deriveSymmetricKey(secret, salt, { extractable: true })
  const jwk = await cryptutils.exportKey('jwk', key)
  t.compare(jwk, expectedJwk)
}

/**
 * @param {t.TestCase} tc
 */
export const testSigning = async tc => {
  await t.measureTimeAsync('time to sign & verify 2 messages', async () => {
    const keypair = await cryptutils.generateAsymmetricKey({ extractable: true })
    const keypair2 = await cryptutils.generateAsymmetricKey({ extractable: true })
    const data = prng.uint8Array(tc.prng, 100)
    const signature = await cryptutils.sign(data, keypair.privateKey)
    const result = await cryptutils.verify(signature, data, keypair.publicKey)
    const result2 = await cryptutils.verify(signature, data, keypair2.publicKey)
    t.assert(result, 'verification works using the correct key')
    t.assert(!result2, 'verification fails using the incorrect key')
  })
}
