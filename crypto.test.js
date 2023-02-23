import * as cryptutils from 'lib0/crypto'
import * as t from './testing.js'
import * as prng from './prng.js'
import * as webcrypto from 'lib0/webcrypto'

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
 * @param {t.TestCase} tc
 */
export const testEncryptionPerformance = async tc => {
  const secret = prng.word(tc.prng)
  const salt = prng.word(tc.prng)
  /**
   * @type {any}
   */
  let key
  await t.measureTimeAsync('Key generation', async () => {
    key = await cryptutils.deriveSymmetricKey(secret, salt)
  })
  /**
   * @type {Array<Uint8Array>}
   */
  const data = []
  for (let i = 0; i < 1000; i++) {
    data.push(webcrypto.getRandomValues(new Uint8Array(1000)))
  }
  /**
   * @type {Array<Uint8Array>}
   */
  const encryptedData = []
  await t.measureTimeAsync('Encrypt 1k blocks of size 1kb', async () => {
    for (let i = 0; i < data.length; i++) {
      encryptedData.push(await cryptutils.encrypt(data[i], key))
    }
  })
  /**
   * @type {Array<Uint8Array>}
   */
  const decryptedData = []
  await t.measureTimeAsync('Decrypt 1k blocks of size 1kb', async () => {
    for (let i = 0; i < encryptedData.length; i++) {
      decryptedData.push(await cryptutils.decrypt(encryptedData[i], key))
    }
  })
  t.compare(data, decryptedData)
}

/**
 * @param {t.TestCase} _tc
 */
export const testConsistentKeyGeneration = async _tc => {
  await t.groupAsync('Symmetric key generation', async () => {
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
    const jwk = await cryptutils.exportKey(key)
    t.compare(jwk, expectedJwk)
  })
  await t.groupAsync('Asymmetric key generation', async () => {
    const jwkPublic = {
      key_ops: ['verify'],
      ext: true,
      kty: 'EC',
      x: 'zfklq8SI_XEZlBawiRmkuv1vwPqGXd456SAHvv_aH4_4v17qcnmFkChaRqCGgXKo',
      y: 'YAt3r7fiB6j_RVKpcnokpEXE6r7XTcOzUxb3VmvkYcC5WfqDi6S7E3HzifOjeYjI',
      crv: 'P-384'
    }
    const jwkPrivate = {
      key_ops: ['sign'],
      ext: true,
      kty: 'EC',
      x: 'zfklq8SI_XEZlBawiRmkuv1vwPqGXd456SAHvv_aH4_4v17qcnmFkChaRqCGgXKo',
      y: 'YAt3r7fiB6j_RVKpcnokpEXE6r7XTcOzUxb3VmvkYcC5WfqDi6S7E3HzifOjeYjI',
      crv: 'P-384',
      d: 'z1bahlvHj7dWLYGr_oGGSNT_o01JdmnOoG79vLEm2LCG5Arl-4UZPFKpIWhmnZZU'
    }
    const privateKey = await cryptutils.importAsymmetricKey(jwkPrivate, { extractable: true, usages: ['sign'] })
    const publicKey = await cryptutils.importAsymmetricKey(jwkPublic, { extractable: true, usages: ['verify'] })
    const exportedPublic = await cryptutils.exportKey(publicKey)
    const exportedPrivate = await cryptutils.exportKey(privateKey)
    delete exportedPublic.alg // for firefox compat
    delete exportedPrivate.alg // for firefox compat
    t.compare(jwkPublic, /** @type {any} */ (exportedPublic))
    t.compare(jwkPrivate, /** @type {any} */ (exportedPrivate))
  })
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
