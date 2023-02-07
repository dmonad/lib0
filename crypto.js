/* eslint-env browser */

import * as encoding from './encoding.js'
import * as decoding from './decoding.js'
import * as string from './string.js'
import * as webcrypto from 'lib0/webcrypto'

/* istanbul ignore next */
/**
 * @param {string | Uint8Array} data
 * @return {Uint8Array}
 */
const toBinary = data => typeof data === 'string' ? string.encodeUtf8(data) : data

/**
 * @experimental The API is not final!
 *
 * Derive an symmetric key using the Password-Based-Key-Derivation-Function-2.
 *
 * @param {string | Uint8Array} secret
 * @param {string | Uint8Array} salt
 * @param {Object} opts
 * @param {boolean} [opts.extractable]
 * @param {Array<'sign'|'verify'|'encrypt'|'decrypt'>} [opts.usages]
 * @return {PromiseLike<CryptoKey>}
 */
export const deriveSymmetricKey = (secret, salt, { extractable = false, usages = ['encrypt', 'decrypt'] } = {}) => {
  const binSecret = toBinary(secret)
  const binSalt = toBinary(salt)
  return webcrypto.subtle.importKey(
    'raw',
    binSecret,
    'PBKDF2',
    false,
    ['deriveKey']
  ).then(keyMaterial =>
    webcrypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: binSalt, // NIST recommends at least 64 bits
        iterations: 600000, // OWASP recommends 600k iterations
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: 'AES-GCM',
        length: 256
      },
      extractable,
      usages
    )
  )
}

/* istanbul ignore next */
/**
 * @param {Object} opts
 * @param {boolean} [opts.extractable]
 * @param {Array<'sign'|'verify'|'encrypt'|'decrypt'>} [opts.usages]
 */
export const generateAsymmetricKey = ({ extractable = false, usages = ['sign', 'verify'] } = {}) =>
  webcrypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-384'
    },
    extractable,
    usages
  )

/* istanbul ignore next */
/**
 * @param {CryptoKey} key - Symmetric or Asymmetric key
 */
export const exportKey = key => webcrypto.subtle.exportKey('jwk', key)

/* istanbul ignore next */
/**
 * @param {any} jwk
 * @param {Object} opts
 * @param {boolean} [opts.extractable]
 * @param {Array<'sign'|'verify'|'encrypt'|'decrypt'>} [opts.usages]
 */
export const importSymmetricKey = (jwk, { extractable = false, usages = ['encrypt', 'decrypt'] } = {}) =>
  webcrypto.subtle.importKey('jwk', jwk, 'PBKDF2', extractable, usages)

/* istanbul ignore next */
/**
 * @param {any} jwk
 * @param {Object} opts
 * @param {boolean} [opts.extractable]
 * @param {Array<'sign'|'verify'|'encrypt'|'decrypt'>} [opts.usages]
 */
export const importAsymmetricKey = (jwk, { extractable = false, usages = ['encrypt', 'decrypt'] } = {}) =>
  webcrypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-384' }, extractable, usages)

/**
 * @experimental The API is not final!
 *
 * Encrypt some data using AES-GCM method.
 *
 * @param {Uint8Array} data data to be encrypted
 * @param {CryptoKey} key
 * @return {PromiseLike<Uint8Array>} encrypted, base64 encoded message
 */
export const encrypt = (data, key) => {
  const iv = webcrypto.getRandomValues(new Uint8Array(16)) // 92bit is enough. 128bit is recommended if space is not an issue.
  return webcrypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    data
  ).then(cipher => {
    const encryptedDataEncoder = encoding.createEncoder()
    // iv may be sent in the clear to the other peers
    encoding.writeUint8Array(encryptedDataEncoder, iv)
    encoding.writeVarUint8Array(encryptedDataEncoder, new Uint8Array(cipher))
    return encoding.toUint8Array(encryptedDataEncoder)
  })
}

/**
 * @experimental The API is not final!
 *
 * Decrypt some data using AES-GCM method.
 *
 * @param {Uint8Array} data
 * @param {CryptoKey} key
 * @return {PromiseLike<Uint8Array>} decrypted buffer
 */
export const decrypt = (data, key) => {
  const dataDecoder = decoding.createDecoder(data)
  const iv = decoding.readUint8Array(dataDecoder, 16)
  const cipher = decoding.readVarUint8Array(dataDecoder)
  return webcrypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    cipher
  ).then(data => new Uint8Array(data))
}

/**
 * @experimental The API is not final!
 *
 * Sign a message
 *
 * @param {Uint8Array} data
 * @param {CryptoKey} privateKey
 * @return {PromiseLike<Uint8Array>} signature
 */
export const sign = (data, privateKey) =>
  webcrypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-384' }
    },
    privateKey,
    data
  ).then(signature => new Uint8Array(signature))

/**
 * @experimental The API is not final!
 *
 * Sign a message
 *
 * @param {Uint8Array} signature
 * @param {Uint8Array} data
 * @param {CryptoKey} publicKey
 * @return {PromiseLike<boolean>} signature
 */
export const verify = (signature, data, publicKey) =>
  webcrypto.subtle.verify(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-384' }
    },
    publicKey,
    signature,
    data
  )
