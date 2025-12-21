import * as array from './array.js'

/**
 * Utility module to work with strings.
 *
 * @module string
 */

/**
 * @param {number} code
 * @return {string}
 */
/*@__NO_SIDE_EFFECTS__*/
export const fromCharCode = code => String.fromCharCode(code)
/**
 * @param {number} codePoint
 * @return {string}
 */
/*@__NO_SIDE_EFFECTS__*/
export const fromCodePoint = codePoint => String.fromCodePoint(codePoint)

/**
 * The largest utf16 character.
 * Corresponds to Uint8Array([255, 255]) or charcodeof(2x2^8)
 */
export const MAX_UTF16_CHARACTER = fromCharCode(65535)

/**
 * @param {string} s
 * @return {string}
 */
/*@__NO_SIDE_EFFECTS__*/
const toLowerCase = s => s.toLowerCase()

/**
 * @param {string} s
 * @return {string}
 */
/*@__NO_SIDE_EFFECTS__*/
export const trimLeft = s => s.replace(/^\s*/g, '')

/**
 * @param {string} s
 * @param {string} separator
 * @return {string}
 */
/*@__NO_SIDE_EFFECTS__*/
export const fromCamelCase = (s, separator) => trimLeft(s.replace(/([A-Z])/g, match => `${separator}${toLowerCase(match)}`))

/**
 * Compute the utf8ByteLength
 * @param {string} str
 * @return {number}
 */
/*@__NO_SIDE_EFFECTS__*/
export const utf8ByteLength = str => unescape(encodeURIComponent(str)).length

/**
 * @param {string} str
 * @return {Uint8Array<ArrayBuffer>}
 */
/*@__NO_SIDE_EFFECTS__*/
export const _encodeUtf8Polyfill = str => {
  const encodedString = unescape(encodeURIComponent(str))
  const len = encodedString.length
  const buf = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    buf[i] = /** @type {number} */ (encodedString.codePointAt(i))
  }
  return buf
}

/* c8 ignore next */
export const utf8TextEncoder = /** @type {TextEncoder} */ (/*@__PURE__*/(()=>typeof TextEncoder !== 'undefined' ? new TextEncoder() : null)())

/**
 * @param {string} str
 * @return {Uint8Array<ArrayBuffer>}
 */
/*@__NO_SIDE_EFFECTS__*/
export const _encodeUtf8Native = str => utf8TextEncoder.encode(str)

/**
 * @param {string} str
 * @return {Uint8Array}
 */
/* c8 ignore next 2 */
/*@__NO_SIDE_EFFECTS__*/
export const encodeUtf8 = /*@__PURE__*/(()=>utf8TextEncoder ? _encodeUtf8Native : _encodeUtf8Polyfill)()

/**
 * @param {Uint8Array} buf
 * @return {string}
 */
/*@__NO_SIDE_EFFECTS__*/
export const _decodeUtf8Polyfill = buf => {
  let remainingLen = buf.length
  let encodedString = ''
  let bufPos = 0
  while (remainingLen > 0) {
    const nextLen = remainingLen < 10000 ? remainingLen : 10000
    const bytes = buf.subarray(bufPos, bufPos + nextLen)
    bufPos += nextLen
    // Starting with ES5.1 we can supply a generic array-like object as arguments
    encodedString += String.fromCodePoint.apply(null, /** @type {any} */ (bytes))
    remainingLen -= nextLen
  }
  return decodeURIComponent(escape(encodedString))
}

export let utf8TextDecoder = /*@__PURE__*/(()=>{
  /* c8 ignore start */
  const te = typeof TextDecoder === 'undefined' ? null : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  if (te && te.decode(new Uint8Array()).length === 1) {
    // Safari doesn't handle BOM correctly.
    // This fixes a bug in Safari 13.0.5 where it produces a BOM the first time it is called.
    // utf8TextDecoder.decode(new Uint8Array()).length === 1 on the first call and
    // utf8TextDecoder.decode(new Uint8Array()).length === 1 on the second call
    // Another issue is that from then on no BOM chars are recognized anymore
    /* c8 ignore next */
    return null
  }
  /* c8 ignore stop */
  return te
})()


/**
 * @param {Uint8Array} buf
 * @return {string}
 */
/*@__NO_SIDE_EFFECTS__*/
export const _decodeUtf8Native = buf => /** @type {TextDecoder} */ (utf8TextDecoder).decode(buf)

/**
 * @param {Uint8Array} buf
 * @return {string}
 */
/* c8 ignore next 2 */
/*@__NO_SIDE_EFFECTS__*/
export const decodeUtf8 = utf8TextDecoder ? _decodeUtf8Native : _decodeUtf8Polyfill

/**
 * @param {string} str The initial string
 * @param {number} index Starting position
 * @param {number} remove Number of characters to remove
 * @param {string} insert New content to insert
 */
/*@__NO_SIDE_EFFECTS__*/
export const splice = (str, index, remove, insert = '') => str.slice(0, index) + insert + str.slice(index + remove)

/**
 * @param {string} source
 * @param {number} n
 */
/*@__NO_SIDE_EFFECTS__*/
export const repeat = (source, n) => array.unfold(n, () => source).join('')

/**
 * Escape HTML characters &,<,>,'," to their respective HTML entities &amp;,&lt;,&gt;,&#39;,&quot;
 *
 * @param {string} str
 */
/*@__NO_SIDE_EFFECTS__*/
export const escapeHTML = str =>
  str.replace(/[&<>'"]/g, r => /** @type {string} */ ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[r]))

/**
 * Reverse of `escapeHTML`
 *
 * @param {string} str
 */
/*@__NO_SIDE_EFFECTS__*/
export const unescapeHTML = str =>
  str.replace(/&amp;|&lt;|&gt;|&#39;|&quot;/g, r => /** @type {string} */ ({
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&#39;': "'",
    '&quot;': '"'
  }[r]))
