/**
 * @module encoding
 * Encodes numbers in little-endian order (least to most significant byte order)
 * This should be compatible with Golang's binary encoding (https://golang.org/pkg/encoding/binary/)
 * which is also used in Protocol Buffers.
 */
import * as buffer from './buffer.js'

const bits7 = 0b1111111
const bits8 = 0b11111111

/**
 * A BinaryEncoder handles the encoding to an Uint8Array.
 */
export class Encoder {
  constructor () {
    this.cpos = 0
    this.cbuf = new Uint8Array(100)
    /**
     * @type {Array<Uint8Array>}
     */
    this.bufs = []
  }
}

/**
 * @function
 * @return {Encoder}
 */
export const createEncoder = () => new Encoder()

/**
 * The current length of the encoded data.
 *
 * @function
 * @param {Encoder} encoder
 * @return {number}
 */
export const length = encoder => {
  let len = encoder.cpos
  for (let i = 0; i < encoder.bufs.length; i++) {
    len += encoder.bufs[i].length
  }
  return len
}

/**
 * Transform to Uint8Array.
 *
 * @function
 * @param {Encoder} encoder
 * @return {Uint8Array} The created ArrayBuffer.
 */
export const toUint8Array = encoder => {
  const uint8arr = new Uint8Array(length(encoder))
  let curPos = 0
  for (let i = 0; i < encoder.bufs.length; i++) {
    let d = encoder.bufs[i]
    uint8arr.set(d, curPos)
    curPos += d.length
  }
  uint8arr.set(buffer.createUint8ArrayViewFromArrayBuffer(encoder.cbuf.buffer, 0, encoder.cpos), curPos)
  return uint8arr
}

/**
 * Write one byte to the encoder.
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} num The byte that is to be encoded.
 */
export const write = (encoder, num) => {
  if (encoder.cpos === encoder.cbuf.length) {
    encoder.bufs.push(encoder.cbuf)
    encoder.cbuf = new Uint8Array(encoder.cbuf.length * 2)
    encoder.cpos = 0
  }
  encoder.cbuf[encoder.cpos++] = num
}

/**
 * Write one byte at a specific position.
 * Position must already be written (i.e. encoder.length > pos)
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} pos Position to which to write data
 * @param {number} num Unsigned 8-bit integer
 */
export const set = (encoder, pos, num) => {
  let buffer = null
  // iterate all buffers and adjust position
  for (let i = 0; i < encoder.bufs.length && buffer === null; i++) {
    const b = encoder.bufs[i]
    if (pos < b.length) {
      buffer = b // found buffer
    } else {
      pos -= b.length
    }
  }
  if (buffer === null) {
    // use current buffer
    buffer = encoder.cbuf
  }
  buffer[pos] = num
}

/**
 * Write one byte as an unsigned integer.
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} num The number that is to be encoded.
 */
export const writeUint8 = (encoder, num) => write(encoder, num & bits8)

/**
 * Write one byte as an unsigned Integer at a specific location.
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} pos The location where the data will be written.
 * @param {number} num The number that is to be encoded.
 */
export const setUint8 = (encoder, pos, num) => set(encoder, pos, num & bits8)

/**
 * Write two bytes as an unsigned integer.
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} num The number that is to be encoded.
 */
export const writeUint16 = (encoder, num) => {
  write(encoder, num & bits8)
  write(encoder, (num >>> 8) & bits8)
}
/**
 * Write two bytes as an unsigned integer at a specific location.
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} pos The location where the data will be written.
 * @param {number} num The number that is to be encoded.
 */
export const setUint16 = (encoder, pos, num) => {
  set(encoder, pos, num & bits8)
  set(encoder, pos + 1, (num >>> 8) & bits8)
}

/**
 * Write two bytes as an unsigned integer
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} num The number that is to be encoded.
 */
export const writeUint32 = (encoder, num) => {
  for (let i = 0; i < 4; i++) {
    write(encoder, num & bits8)
    num >>>= 8
  }
}

/**
 * Write two bytes as an unsigned integer at a specific location.
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} pos The location where the data will be written.
 * @param {number} num The number that is to be encoded.
 */
export const setUint32 = (encoder, pos, num) => {
  for (let i = 0; i < 4; i++) {
    set(encoder, pos + i, num & bits8)
    num >>>= 8
  }
}

/**
 * Write a variable length unsigned integer.
 *
 * Encodes integers in the range from [0, 4294967295] / [0, 0xffffffff]. (max 32 bit unsigned integer)
 *
 * @function
 * @param {Encoder} encoder
 * @param {number} num The number that is to be encoded.
 */
export const writeVarUint = (encoder, num) => {
  while (num >= 0b10000000) {
    write(encoder, 0b10000000 | (bits7 & num))
    num >>>= 7
  }
  write(encoder, bits7 & num)
}

/**
 * Write a variable length string.
 *
 * @function
 * @param {Encoder} encoder
 * @param {String} str The string that is to be encoded.
 */
export const writeVarString = (encoder, str) => {
  const encodedString = unescape(encodeURIComponent(str))
  const len = encodedString.length
  writeVarUint(encoder, len)
  for (let i = 0; i < len; i++) {
    // @ts-ignore
    write(encoder, encodedString.codePointAt(i))
  }
}

/**
 * Write the content of another Encoder.
 *
 * TODO: can be improved!
 *
 * @function
 * @param {Encoder} encoder The enUint8Arr
 * @param {Encoder} append The BinaryEncoder to be written.
 */
export const writeBinaryEncoder = (encoder, append) => writeUint8Array(encoder, toUint8Array(append))

/**
 * Append fixed-length Uint8Array to the encoder.
 *
 * @function
 * @param {Encoder} encoder
 * @param {Uint8Array} uint8Array
 */
export const writeUint8Array = (encoder, uint8Array) => {
  const prevBufferLen = encoder.cbuf.length
  // TODO: Append to cbuf if possible
  encoder.bufs.push(buffer.createUint8ArrayViewFromArrayBuffer(encoder.cbuf.buffer, 0, encoder.cpos))
  encoder.bufs.push(uint8Array)
  encoder.cbuf = buffer.createUint8ArrayFromLen(prevBufferLen)
  encoder.cpos = 0
}

/**
 * Append an Uint8Array to Encoder.
 *
 * @function
 * @param {Encoder} encoder
 * @param {Uint8Array} uint8Array
 */
export const writeVarUint8Array = (encoder, uint8Array) => {
  writeVarUint(encoder, uint8Array.byteLength)
  writeUint8Array(encoder, uint8Array)
}
