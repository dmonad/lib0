/**
 * @module string
 */

export const fromCharCode = String.fromCharCode
export const fromCodePoint = String.fromCodePoint

const toLowerCase = s => s.toLowerCase()

const trimLeftRegex = /^\s*/g
export const trimLeft = s => s.replace(trimLeftRegex, '')

const fromCamelCaseRegex = /([A-Z])/g
export const fromCamelCase = (s, separator) => trimLeft(s.replace(fromCamelCaseRegex, match => `${separator}${toLowerCase(match)}`))

/**
 * Compute the utf8ByteLength
 * @param {string} str
 * @return {number}
 */
export const utf8ByteLength = str => unescape(encodeURIComponent(str)).length
