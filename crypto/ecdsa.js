/**
 * ECDSA is an asymmetric key for signing
 */

import * as webcrypto from 'lib0/webcrypto'
export { exportKey } from './common.js'

/**
 * @typedef {Array<'sign'|'verify'>} Usages
 */

/**
 * @type {Usages}
 */
const defaultUsages = ['sign', 'verify']

/**
 * @experimental The API is not final!
 *
 * Sign a message
 *
 * @param {CryptoKey} key
 * @param {Uint8Array} data
 * @return {PromiseLike<Uint8Array>} signature
 */
export const sign = (key, data) => {
  return webcrypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-384' }
    },
    key,
    data
  ).then(signature => new Uint8Array(signature))
}

/**
 * @experimental The API is not final!
 *
 * Sign a message
 *
 * @param {CryptoKey} key
 * @param {Uint8Array} signature
 * @param {Uint8Array} data
 * @return {PromiseLike<boolean>} signature
 */
export const verify = (key, signature, data) => {
  return webcrypto.subtle.verify(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-384' }
    },
    key,
    signature,
    data
  )
}

/* c8 ignore next */
/**
 * @param {Object} opts
 * @param {boolean} [opts.extractable]
 * @param {Usages} [opts.usages]
 */
export const generateKeyPair = ({ extractable = false, usages = defaultUsages } = {}) =>
  webcrypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-384'
    },
    extractable,
    usages
  )

/**
 * @param {any} jwk
 * @param {Object} opts
 * @param {boolean} [opts.extractable]
 * @param {Usages} [opts.usages]
 */
export const importKey = (jwk, { extractable = false, usages } = {}) => {
  if (usages == null) {
    /* c8 ignore next */
    usages = jwk.key_ops || defaultUsages
  }
  return webcrypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-384' }, extractable, /** @type {Usages} */ (usages))
}
