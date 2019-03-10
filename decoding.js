/**
 * @module decoding
 */
import * as buffer from './buffer.js'

/**
 * A Decoder handles the decoding of an ArrayBuffer.
 */
export class Decoder {
  /**
   * @param {ArrayBuffer} buffer Binary data to decode
   */
  constructor (buffer) {
    this.arr = new Uint8Array(buffer)
    this.pos = 0
  }
}

/**
 * @function
 * @param {ArrayBuffer} buffer
 * @return {Decoder}
 */
export const createDecoder = buffer => new Decoder(buffer)

/**
 * @function
 * @param {Decoder} decoder
 * @return {boolean}
 */
export const hasContent = decoder => decoder.pos !== decoder.arr.length

/**
 * Clone a decoder instance.
 * Optionally set a new position parameter.
 *
 * @function
 * @param {Decoder} decoder The decoder instance
 * @param {number} [newPos] Defaults to current position
 * @return {Decoder} A clone of `decoder`
 */
export const clone = (decoder, newPos = decoder.pos) => {
  const _decoder = createDecoder(decoder.arr.buffer)
  _decoder.pos = newPos
  return _decoder
}

/**
 * Read `len` bytes as an ArrayBuffer.
 * @function
 * @param {Decoder} decoder The decoder instance
 * @param {number} len The length of bytes to read
 * @return {ArrayBuffer}
 */
export const readArrayBuffer = (decoder, len) => {
  const arrayBuffer = buffer.createUint8ArrayFromLen(len)
  const view = buffer.createUint8ArrayViewFromArrayBuffer(decoder.arr.buffer, decoder.pos, len)
  arrayBuffer.set(view)
  decoder.pos += len
  return arrayBuffer.buffer
}

/**
 * Read variable length payload as ArrayBuffer
 * @function
 * @param {Decoder} decoder
 * @return {ArrayBuffer}
 */
export const readPayload = decoder => readArrayBuffer(decoder, readVarUint(decoder))

/**
 * Read the rest of the content as an ArrayBuffer
 * @function
 * @param {Decoder} decoder
 * @return {ArrayBuffer}
 */
export const readTail = decoder => readArrayBuffer(decoder, decoder.arr.length - decoder.pos)

/**
 * Skip one byte, jump to the next position.
 * @function
 * @param {Decoder} decoder The decoder instance
 * @return {number} The next position
 */
export const skip8 = decoder => decoder.pos++

/**
 * Read one byte as unsigned integer.
 * @function
 * @param {Decoder} decoder The decoder instance
 * @return {number} Unsigned 8-bit integer
 */
export const readUint8 = decoder => decoder.arr[decoder.pos++]

/**
 * Read 2 bytes as unsigned integer.
 *
 * @function
 * @param {Decoder} decoder
 * @return {number} An unsigned integer.
 */
export const readUint16 = decoder => {
  const uint =
    decoder.arr[decoder.pos] +
    (decoder.arr[decoder.pos + 1] << 8)
  decoder.pos += 2
  return uint
}

/**
 * Read 4 bytes as unsigned integer.
 *
 * @function
 * @param {Decoder} decoder
 * @return {number} An unsigned integer.
 */
export const readUint32 = decoder => {
  const uint =
    (decoder.arr[decoder.pos] +
    (decoder.arr[decoder.pos + 1] << 8) +
    (decoder.arr[decoder.pos + 2] << 16) +
    (decoder.arr[decoder.pos + 3] << 24)) >>> 0
  decoder.pos += 4
  return uint
}

/**
 * Look ahead without incrementing position.
 * to the next byte and read it as unsigned integer.
 *
 * @function
 * @param {Decoder} decoder
 * @return {number} An unsigned integer.
 */
export const peekUint8 = decoder => decoder.arr[decoder.pos]

/**
 * Look ahead without incrementing position.
 * to the next byte and read it as unsigned integer.
 *
 * @function
 * @param {Decoder} decoder
 * @return {number} An unsigned integer.
 */
export const peekUint16 = decoder =>
  decoder.arr[decoder.pos] +
  (decoder.arr[decoder.pos + 1] << 8)

/**
 * Look ahead without incrementing position.
 * to the next byte and read it as unsigned integer.
 *
 * @function
 * @param {Decoder} decoder
 * @return {number} An unsigned integer.
 */
export const peekUint32 = decoder => (
  decoder.arr[decoder.pos] +
  (decoder.arr[decoder.pos + 1] << 8) +
  (decoder.arr[decoder.pos + 2] << 16) +
  (decoder.arr[decoder.pos + 3] << 24)
) >>> 0

/**
 * Read unsigned integer (32bit) with variable length.
 * 1/8th of the storage is used as encoding overhead.
 *  * numbers < 2^7 is stored in one bytlength
 *  * numbers < 2^14 is stored in two bylength
 *
 * @function
 * @param {Decoder} decoder
 * @return {number} An unsigned integer.length
 */
export const readVarUint = decoder => {
  let num = 0
  let len = 0
  while (true) {
    let r = decoder.arr[decoder.pos++]
    num = num | ((r & 0b1111111) << len)
    len += 7
    if (r < 1 << 7) {
      return num >>> 0 // return unsigned number!
    }
    /* istanbul ignore if */
    if (len > 35) {
      throw new Error('Integer out of range!')
    }
  }
}

/**
 * Look ahead and read varUint without incrementing position
 *
 * @function
 * @param {Decoder} decoder
 * @return {number}
 */
export const peekVarUint = decoder => {
  const pos = decoder.pos
  const s = readVarUint(decoder)
  decoder.pos = pos
  return s
}

/**
 * Read string of variable length
 * * varUint is used to store the length of the string
 *
 * Transforming utf8 to a string is pretty expensive. The code performs 10x better
 * when String.fromCodePoint is fed with all characters as arguments.
 * But most environments have a maximum number of arguments per functions.
 * For effiency reasons we apply a maximum of 10000 characters at once.
 *
 * @function
 * @param {Decoder} decoder
 * @return {String} The read String.
 */
export const readVarString = decoder => {
  let remainingLen = readVarUint(decoder)
  let encodedString = ''
  while (remainingLen > 0) {
    const nextLen = remainingLen < 10000 ? remainingLen : 10000
    const bytes = new Array(nextLen)
    for (let i = 0; i < nextLen; i++) {
      bytes[i] = decoder.arr[decoder.pos++]
    }
    encodedString += String.fromCodePoint.apply(null, bytes)
    remainingLen -= nextLen
  }
  return decodeURIComponent(escape(encodedString))
}

/**
 * Look ahead and read varString without incrementing position
 *
 * @function
 * @param {Decoder} decoder
 * @return {string}
 */
export const peekVarString = decoder => {
  const pos = decoder.pos
  const s = readVarString(decoder)
  decoder.pos = pos
  return s
}
