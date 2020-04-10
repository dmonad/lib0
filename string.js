/**
 * Utility module to work with strings.
 *
 * @module string
 */

export const fromCharCode = String.fromCharCode
export const fromCodePoint = String.fromCodePoint

/**
 * @param {string} s
 * @return {string}
 */
const toLowerCase = s => s.toLowerCase()

const trimLeftRegex = /^\s*/g

/**
 * @param {string} s
 * @return {string}
 */
export const trimLeft = s => s.replace(trimLeftRegex, '')

const fromCamelCaseRegex = /([A-Z])/g

/**
 * @param {string} s
 * @param {string} separator
 * @return {string}
 */
export const fromCamelCase = (s, separator) => trimLeft(s.replace(fromCamelCaseRegex, match => `${separator}${toLowerCase(match)}`))

/**
 * Compute the utf8ByteLength
 * @param {string} str
 * @return {number}
 */
export const utf8ByteLength = str => unescape(encodeURIComponent(str)).length

/**
 * @param {string} str
 * @return {Uint8Array}
 */
export const _encodeUtf8Polyfill = str => {
  const encodedString = unescape(encodeURIComponent(str))
  const len = encodedString.length
  const buf = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    buf[i] = /** @type {number} */ (encodedString.codePointAt(i))
  }
  return buf
}

/* istanbul ignore next */
export const utf8TextEncoder = /** @type {TextEncoder} */ (typeof TextEncoder !== 'undefined' ? new TextEncoder() : null)

/**
 * @param {string} str
 * @return {Uint8Array}
 */
export const _encodeUtf8Native = str => utf8TextEncoder.encode(str)

/**
 * @param {string} str
 * @return {Uint8Array}
 */
/* istanbul ignore next */
export const encodeUtf8 = utf8TextEncoder ? _encodeUtf8Native : _encodeUtf8Polyfill

/**
 * @param {Uint8Array} buf
 * @return {string}
 */
export const _decodeUtf8Polyfill = buf => {
  let remainingLen = buf.length
  let encodedString = ''
  let bufPos = 0
  while (remainingLen > 0) {
    const nextLen = remainingLen < 10000 ? remainingLen : 10000
    const bytes = new Array(nextLen)
    for (let i = 0; i < nextLen; i++) {
      bytes[i] = buf[bufPos++]
    }
    encodedString += String.fromCodePoint.apply(null, bytes)
    remainingLen -= nextLen
  }
  return decodeURIComponent(escape(encodedString))
}

/* istanbul ignore next */
export const utf8TextDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/**
 * @param {Uint8Array} buf
 * @return {string}
 */
export const _decodeUtf8Native = buf => /** @type {TextDecoder} */ (utf8TextDecoder).decode(buf)

/**
 * @param {Uint8Array} buf
 * @return {string}
 */
/* istanbul ignore next */
export const decodeUtf8 = utf8TextDecoder ? _decodeUtf8Native : _decodeUtf8Polyfill
