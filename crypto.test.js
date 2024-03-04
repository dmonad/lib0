import * as time from './time.js'
import * as jose from 'lib0/crypto/jwt'
import * as aes from 'lib0/crypto/aes-gcm'
import * as rsa from 'lib0/crypto/rsa-oaep'
import * as ecdsa from 'lib0/crypto/ecdsa'
import * as t from './testing.js'
import * as prng from './prng.js'
import * as json from './json.js'

/**
 * @param {t.TestCase} _tc
 */
export const testJwt = async _tc => {
  const publicJwk = json.parse('{"key_ops":["verify"],"ext":true,"kty":"EC","x":"X7xPIgxWOHmKPv2PtrxGvaQUJ3LiUXQTVLExwPGBvanD3kAc9sEY9FwKxp8NVJ3j","y":"SIBaHLE1fvW_O-xOdzmbkU5M_M7cGHULZHrXOo_exCKBIbV2pJm3MH87gAXkZvoD","crv":"P-384"}')
  const privateJwk = json.parse('{"key_ops":["sign"],"ext":true,"kty":"EC","x":"X7xPIgxWOHmKPv2PtrxGvaQUJ3LiUXQTVLExwPGBvanD3kAc9sEY9FwKxp8NVJ3j","y":"SIBaHLE1fvW_O-xOdzmbkU5M_M7cGHULZHrXOo_exCKBIbV2pJm3MH87gAXkZvoD","crv":"P-384","d":"3BdPp9LSWOl36bJuwEIun14Y17dgV7AK8RKqOuTJAbG080kemtr7qmZgTiCE_K_o"}')
  const privateKey = await ecdsa.importKeyJwk(privateJwk)
  const publicKey = await ecdsa.importKeyJwk(publicJwk)
  const payload = {
    sub: '1234567890',
    name: 'John Doe',
    iat: 1516239022
  }
  const jwt = await jose.encodeJwt(privateKey, payload)
  console.log('jwt: ', jwt)
  const verified = await jose.verifyJwt(publicKey, jwt)
  t.compare(verified.payload, payload)
  const unverified = jose.unsafeDecode(jwt)
  t.compare(verified, unverified)
  t.info('expired jwt should not parse')
  const payloadExpired = {
    sub: '1234567890',
    name: 'John Doe',
    iat: 1516239022,
    exp: time.getUnixTime() - 10
  }
  const jwtExpired = await jose.encodeJwt(privateKey, payloadExpired)
  jose.unsafeDecode(jwtExpired)
  t.failsAsync(async () => {
    await jose.verifyJwt(publicKey, jwtExpired)
  })
}

/**
 * @param {t.TestCase} tc
 */
export const testEncryption = async tc => {
  const secret = prng.word(tc.prng, 1, 30)
  const salt = tc.testName
  const data = prng.uint8Array(tc.prng, 400)
  await t.groupAsync('symmetric', async () => {
    const key = await aes.deriveKey(secret, salt)
    const enc = await aes.encrypt(key, data)
    const dec = await aes.decrypt(key, enc)
    t.compare(data, dec)
  })
  await t.groupAsync('RSA', async () => {
    const keypair = await rsa.generateKeyPair()
    const enc = await rsa.encrypt(keypair.publicKey, data)
    const dec = await rsa.decrypt(keypair.privateKey, enc)
    t.compare(data, dec)
  })
  await t.groupAsync('symmetric can fail', async () => {
    await t.failsAsync(async () => {
      const key = await aes.deriveKey(secret, salt)
      const key2 = await aes.deriveKey(secret + '2', salt)
      const enc = await aes.encrypt(key, data)
      const dec = await aes.decrypt(key2, enc)
      t.compare(data, dec)
    })
  })
  await t.groupAsync('asymmetric can fail', async () => {
    await t.failsAsync(async () => {
      const keypair = await rsa.generateKeyPair()
      const keypair2 = await rsa.generateKeyPair()
      const enc = await rsa.encrypt(keypair.privateKey, data)
      const dec = await rsa.decrypt(keypair2.publicKey, enc)
      t.compare(data, dec)
    })
  })
}

/**
 * @param {t.TestCase} tc
 */
export const testReapeatEncryption = async tc => {
  const secret = prng.word(tc.prng, 1, 30)
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
   * @type {CryptoKey}
   */
  let key
  await t.measureTimeAsync('Key generation', async () => {
    key = await aes.deriveKey(secret, salt)
  })
  await t.measureTimeAsync('Encryption', async () => {
    encrypted = await aes.encrypt(key, data)
  })
  t.info(`Byte length: ${data.byteLength}b`)
  t.info(`Encrypted length: ${encrypted.length}b`)
  await t.measureTimeAsync('Decryption', async () => {
    decrypted = await aes.decrypt(key, encrypted)
  })
  t.compare(data, decrypted)
}

/**
 * @param {t.TestCase} tc
 */
export const testImportExport = async tc => {
  const secret = prng.word(tc.prng, 1, 30)
  const salt = prng.word(tc.prng)
  await t.groupAsync('aes-gcm (jwk))', async () => {
    const key = await aes.deriveKey(secret, salt, { extractable: true })
    const jwk = await aes.exportKeyJwk(key)
    const ekey = await aes.importKeyJwk(jwk, { extractable: true })
    const ejwk = await aes.exportKeyJwk(ekey)
    t.compare(jwk, ejwk)
  })
  await t.groupAsync('aes-gcm (raw))', async () => {
    const key = await aes.deriveKey(secret, salt, { extractable: true })
    const raw = await aes.exportKeyRaw(key)
    const ekey = await aes.importKeyRaw(raw, { extractable: true })
    const eraw = await aes.exportKeyRaw(ekey)
    t.compare(raw, eraw)
  })
  await t.groupAsync('ecdsa (jwk))', async () => {
    const keypair = await ecdsa.generateKeyPair({ extractable: true })
    const jwkPrivate = await ecdsa.exportKeyJwk(keypair.privateKey)
    const jwkPublic = await ecdsa.exportKeyJwk(keypair.publicKey)
    const ekeyPrivate = await ecdsa.importKeyJwk(jwkPrivate, { extractable: true })
    const ekeyPublic = await ecdsa.importKeyJwk(jwkPublic, { extractable: true })
    const ejwkPrivate = await ecdsa.exportKeyJwk(ekeyPrivate)
    const ejwkPublic = await ecdsa.exportKeyJwk(ekeyPublic)
    t.compare(jwkPrivate, ejwkPrivate)
    t.compare(jwkPublic, ejwkPublic)
  })
  await t.groupAsync('ecdsa (raw))', async () => {
    const keypair = await ecdsa.generateKeyPair({ extractable: true, usages: ['sign', 'verify'] })
    const rawPublic = await ecdsa.exportKeyRaw(keypair.publicKey)
    const ekeyPublic = await ecdsa.importKeyRaw(rawPublic, { extractable: true, usages: ['verify'] })
    const erawPublic = await ecdsa.exportKeyRaw(ekeyPublic)
    t.compare(rawPublic, erawPublic)
  })
  await t.groupAsync('rsa-oaep (jwk))', async () => {
    const keypair = await rsa.generateKeyPair({ extractable: true })
    const jwkPrivate = await rsa.exportKeyJwk(keypair.privateKey)
    const jwkPublic = await rsa.exportKeyJwk(keypair.publicKey)
    const ekeyPrivate = await rsa.importKeyJwk(jwkPrivate, { extractable: true })
    const ekeyPublic = await rsa.importKeyJwk(jwkPublic, { extractable: true })
    const ejwkPrivate = await rsa.exportKeyJwk(ekeyPrivate)
    const ejwkPublic = await rsa.exportKeyJwk(ekeyPublic)
    t.compare(jwkPrivate, ejwkPrivate)
    t.compare(jwkPublic, ejwkPublic)
  })
}

/**
 * @param {t.TestCase} tc
 */
export const testEncryptionPerformance = async tc => {
  const N = 1000
  const BLen = 1000
  const secret = prng.word(tc.prng, 1, 30)
  const salt = prng.word(tc.prng)
  /**
   * @type {CryptoKey}
   */
  let key
  await t.measureTimeAsync('Key generation', async () => {
    key = await aes.deriveKey(secret, salt)
  })
  /**
   * @type {Array<Uint8Array>}
   */
  const data = []
  for (let i = 0; i < N; i++) {
    data.push(prng.uint8Array(tc.prng, BLen))
  }
  /**
   * @type {Array<Uint8Array>}
   */
  const encryptedData = []
  await t.measureTimeAsync(`Encrypt ${N / 1000}k blocks of size ${BLen}byte`, async () => {
    for (let i = 0; i < data.length; i++) {
      encryptedData.push(await aes.encrypt(key, data[i]))
    }
  })
  /**
   * @type {Array<Uint8Array>}
   */
  const decryptedData = []
  await t.measureTimeAsync(`Decrypt ${N / 1000}k blocks of size ${BLen}byte`, async () => {
    for (let i = 0; i < encryptedData.length; i++) {
      decryptedData.push(await aes.decrypt(key, encryptedData[i]))
    }
  })
  t.compare(data, decryptedData)
}

/**
 * @param {t.TestCase} _tc
 */
export const testConsistentKeyGeneration = async _tc => {
  await t.groupAsync('Key generation (AES))', async () => {
    const secret = 'qfycncpxhjktawlqkhc'
    const salt = 'my nonce'
    const expectedJwk = {
      key_ops: ['decrypt', 'encrypt'],
      kty: 'oct',
      k: 'psAqoMh9apefdr8y1tdbNMVTLxb-tFekEFipYIOX5n8',
      alg: 'A256GCM'
    }
    const key = await aes.deriveKey(secret, salt, { extractable: true })
    const jwk = await aes.exportKeyJwk(key)
    delete jwk.ext
    jwk.key_ops?.sort()
    t.compare(jwk, expectedJwk)
  })
  await t.groupAsync('key generation (ECDSA))', async () => {
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
    const privateKey = await ecdsa.importKeyJwk(jwkPrivate, { extractable: true, usages: ['sign'] })
    const publicKey = await ecdsa.importKeyJwk(jwkPublic, { extractable: true, usages: ['verify'] })
    const exportedPublic = await ecdsa.exportKeyJwk(publicKey)
    const exportedPrivate = await ecdsa.exportKeyJwk(privateKey)
    delete exportedPublic.alg // for firefox compat
    delete exportedPrivate.alg // for firefox compat
    t.compare(jwkPublic, /** @type {any} */ (exportedPublic))
    t.compare(jwkPrivate, /** @type {any} */ (exportedPrivate))
  })
  await t.groupAsync('key generation (RSA))', async () => {
    const jwkPublic = {
      key_ops: ['encrypt'],
      ext: true,
      kty: 'RSA',
      n: '2M17DkhswailS2qGzpuoyGFxk193-18OSgNGVYAB_rPk8gN0CdLCyW8z0Ya8LpBgLNDht7vPdsXOZOAoIvgJZvt3mSGSJQj-gFy8l9DTQrt3rtiKKCX_tGmLeN0eN-TMemIG8Wkd8Ebqpkj-mQAgIPdsukO0capWyr0RM3C7ByESb3Fk0Z9v9p06kk8BuTz-5B5yyeDI_tfALRo_ZaWAN1rCXF8Sdjoipw1OUVJjzBLDDZ_znAPkZgTl9IZJMs_l97kv4OEl4xpq4lgobBYkwa8fWmqSljC9z99hws1hcgc3OQo43vbGT_80DW5GbeAWXAdoMJjqpG9Slc-ZfRVGen9DZpTXHkFmcmI9KrNhc_HFdWQPIUc7BUkX06nW5T_-t1OcgkMzFJhtxhlh8Ah7KcOJ7f2P7kziCr8uj7MPPz05-FbFJfUJgbQgX9wo4JbwtLKtqtTqfRaI8lCCbx_k8NC_RIi4YMqtF31O1WGEL7TX4pSJyPSLnkWzniJmG_v1_CAFhenoNZPgNY_kin-5DPtFVrpEkaJygySEs1JhII33ecJXc951yAEuEiaFdqcHNVryhesDJo6P4UfvuaGW6UQW2o6g0uNXC71emvK7dWt4K1r9QYH0SslHD-amJvgbFestBxAR4M_ldeTxQMRXMnYU-iCzgwKaPvSLSSNn8kk',
      e: 'AQAB',
      alg: 'RSA-OAEP-256'
    }
    const jwkPrivate = {
      key_ops: ['decrypt'],
      ext: true,
      kty: 'RSA',
      n: '2M17DkhswailS2qGzpuoyGFxk193-18OSgNGVYAB_rPk8gN0CdLCyW8z0Ya8LpBgLNDht7vPdsXOZOAoIvgJZvt3mSGSJQj-gFy8l9DTQrt3rtiKKCX_tGmLeN0eN-TMemIG8Wkd8Ebqpkj-mQAgIPdsukO0capWyr0RM3C7ByESb3Fk0Z9v9p06kk8BuTz-5B5yyeDI_tfALRo_ZaWAN1rCXF8Sdjoipw1OUVJjzBLDDZ_znAPkZgTl9IZJMs_l97kv4OEl4xpq4lgobBYkwa8fWmqSljC9z99hws1hcgc3OQo43vbGT_80DW5GbeAWXAdoMJjqpG9Slc-ZfRVGen9DZpTXHkFmcmI9KrNhc_HFdWQPIUc7BUkX06nW5T_-t1OcgkMzFJhtxhlh8Ah7KcOJ7f2P7kziCr8uj7MPPz05-FbFJfUJgbQgX9wo4JbwtLKtqtTqfRaI8lCCbx_k8NC_RIi4YMqtF31O1WGEL7TX4pSJyPSLnkWzniJmG_v1_CAFhenoNZPgNY_kin-5DPtFVrpEkaJygySEs1JhII33ecJXc951yAEuEiaFdqcHNVryhesDJo6P4UfvuaGW6UQW2o6g0uNXC71emvK7dWt4K1r9QYH0SslHD-amJvgbFestBxAR4M_ldeTxQMRXMnYU-iCzgwKaPvSLSSNn8kk',
      e: 'AQAB',
      d: 'IXXVKtHStzDSvLOm3_b2MwxBqH_GLMLxmaACbZUMDxtZ7QrLZe4Op2LE70Q0LEZBZv6grOgM5O_dItnVrU_1Y4d8Czjl2AFuBgb0tG7uVrudhRwLy-vRbdlm793F7tUebzpMiAWz29mWGC6RMgaVmYDrrvO0GGGJyPsqecie6kLDGEq6nKpWxWEOy8tAdi5hHc6f42MQolmkt1FNvN-wzNpHv6niAjfcEUbkciNHyRSRi2YcWv_eyEAJSEFRcB4rXUhKM2g282NTC7aUxoRvDSrR_p-5b_n7JudQV0MLabs4sqej5LAsJec6nrgI9qbsdyz4JPKfhDFfiu-Mvi6tFFdv5-e15QywqJIKgzHDxREcWXA2EF5CAfeD2rt0k1EsaoBUVII3k6VXH3Ufz5-94GialafmDdWLwr_kusT43nFnNpBVLlscyi1hnLwmbyHQo7Le0bt8umFMfFRqGiFCkkOdtUecH6xt1wfvC0vqT2aSppo8DQpYzQWxfDnzhW4-8yDAjmwOkeAcH3YDpMrxmUtLm6CXGeYrcyeoPwQz39ezE8m5BqqdLTdD8IHiypon_0bdyOkvENVCcm9fcMU3isx57w-4Higrn-yvS-v-17jouPFgYmWiu9uvKQNvvszhPnxmpTcil3PXXW25JLyXPb3NEQOa51o3lFFUH-03pWE',
      p: '71aSuZ1fH-Ly4NSAqSWSc_gMjXVR_QbapyBlB0tr7b1SiJRwS_Yqv1jNZfFSHbx63YNaJDDi5pJaENbYYoKSHvA8--fZJ6GbVIzYSOnntW__nDz22PwpIyoJVXqXqsRygc3DX0XiFM0pQ2QaLoZzvdxv2RgBMTdMWnhelk3SA6oVe3mMarSh316PCjE5TDApWlGCFHFEHji8FDXsYKEfgXRrjSIEJW9RbufIIAdeTH2guesezguVVPoQQ9Y0KtjQ3vsCxjrHdvAzK8IqWikOEJgJZZkBNXenPFwNkZwadjz9EpR-FVwRWKRiVECjTjy-xzD_LenISpgk_SN4evfTyw',
      q: '5-VI90pui_C0A5eBtL8vDVLYfahw5KJxqfxeqBjEbiL_GK2B59BN4f0GbfDeLm-T8J0hYtPdR0qwLv87sT318_Y-gT2T7qrr2lEyudbQt2SgNgfWe2VwakESIN3DU7voUV-ykSXoqPqjOwunSAq-cI1fGmg29tBArciHiuLq9n-QzK3geaz7NHSz5jQ5jA71HtZdFE85VncYUFb6MZetEJ9htbpjJPvfAVagzv9dedsTV3f8gC6XH1Ck5a40SYO2suAoQoOGdJc8Yfsd5ssjdqvYrQF7M9ttqe5VFH86Jnsz1dVwq65avjgRWBmBCWgk_nX_QDzuoEcduRk4w-sXuw',
      dp: '3Y96QqRBlCYnCyUNeghTHFIrZKSP4rl-nqppfChA4JObnN41Wsym4_4UHuQYTXjXEMrxHoG2-xXOlLofFIqlNEjXW6dUqtB7F_lOm6kVHCxzJzJ0nYhJmMjoXR4g2zAChNFzpHXwBaurIDzB1AIZkVBIpmMHb4UuhK3bei7OVSAVxPlPmNRg6YQCzL-muDX5gifkUIJOOd_xlJAao5VkshWRHtS3m-QCMbYV2DiZ_htqN9JF8R5d_o2DkxjvsB6ItXMPLWzqi9tus3qKdG5_G7NzN3891D5RLZpV4U7uXDi3WoTmd2WElVePw0kXJG0tev6Lq_g4t31C-Kfmd4eGow',
      dq: '1Mjns0JxPaeZBtK3CguEOU2TqXouXR1R_xC8KrLPS-CBAzvyv6u8S2nJxIgI18M6lMcaI30Uxp4aHIXHWFPqo_mIUT8XxyC_Woy3Zx9eVWnYOLvoa0IhbN5YrB_RY7xA6KpPSDDo1GVn8n42-Twik1Slt615AfEF6HDhLugZgiZ7z9Sc7gl0WCXeDZZOV95BvhIlRsWLb3PIs6-b1HXBMEePeRmWcBFOCARdepOISpBjpxdKcrRNp0ZwiPDYubxKoMhfKOlXLxS3K5EpVuV_nR0CrX12d5cZgZxYJX649SaH4ecAhAhw66q2_4gnh2Iwz-2mUmOW8ytOctJZ7CyEkQ',
      qi: 'ggdoo4EYrtNl-sSNwF8PjtmJxv8GA5df__iKMnN0A5yHlbcdfBH4zCGoDQW8K4QKAsBldI7zkuYx08VCYrSQL6xkowXctjXprxkROHsWxN8cDC2kg6lUOO88GeRT9s96wgzZoHcPNxTrZiJDsAGgPr4OdiGk1feu3BpWPitSZL2TnWfEqlmIdq99-0wTCgn_-kzXrRnZEAOsEyZk2FXwBA7d22fJ5fbyvVQ98pj7ih-ieKUZWyzR5E-EEYDfQjJ8A49F1ejcNSIr2zPb7vCiEpdtLlRak9dfuetmYNfrqaVhAKLqzE2ErtZ6ZLfvJcp9d4ZHsbppR8WckKEyA-L7_A',
      alg: 'RSA-OAEP-256'
    }
    const privateKey = await rsa.importKeyJwk(jwkPrivate, { extractable: true, usages: ['decrypt'] })
    const publicKey = await rsa.importKeyJwk(jwkPublic, { extractable: true, usages: ['encrypt'] })
    const exportedPublic = await rsa.exportKeyJwk(publicKey)
    const exportedPrivate = await rsa.exportKeyJwk(privateKey)
    t.compare(jwkPublic, /** @type {any} */ (exportedPublic))
    t.compare(jwkPrivate, /** @type {any} */ (exportedPrivate))
  })
}

/**
 * @param {t.TestCase} tc
 */
export const testSigning = async tc => {
  await t.measureTimeAsync('time to sign & verify 2 messages (ECDSA))', async () => {
    const keypair = await ecdsa.generateKeyPair({ extractable: true })
    const keypair2 = await ecdsa.generateKeyPair({ extractable: true })
    const data = prng.uint8Array(tc.prng, 100)
    const signature = await ecdsa.sign(keypair.privateKey, data)
    const result = await ecdsa.verify(keypair.publicKey, signature, data)
    const result2 = await ecdsa.verify(keypair2.publicKey, signature, data)
    t.assert(result, 'verification works using the correct key')
    t.assert(!result2, 'verification fails using the incorrect key')
  })
}
