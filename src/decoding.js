/**
 * Efficient schema-less binary decoding with support for variable length encoding.
 *
 * Use [lib0/decoding] with [lib0/encoding]. Every encoding function has a corresponding decoding function.
 *
 * Encodes numbers in little-endian order (least to most significant byte order)
 * and is compatible with Golang's binary encoding (https://golang.org/pkg/encoding/binary/)
 * which is also used in Protocol Buffers.
 *
 * ```js
 * // encoding step
 * const encoder = encoding.createEncoder()
 * encoding.writeVarUint(encoder, 256)
 * encoding.writeVarString(encoder, 'Hello world!')
 * const buf = encoding.toUint8Array(encoder)
 * ```
 *
 * ```js
 * // decoding step
 * const decoder = decoding.createDecoder(buf)
 * decoding.readVarUint(decoder) // => 256
 * decoding.readVarString(decoder) // => 'Hello world!'
 * decoding.hasContent(decoder) // => false - all data is read
 * ```
 *
 * @module decoding
 */

import * as binary from './binary.js'
import * as math from './math.js'
import * as number from './number.js'
import * as string from './string.js'
import * as error from './error.js'
import * as encoding from './encoding.js'

const errorUnexpectedEndOfArray = error.create('Unexpected end of array')
const errorIntegerOutOfRange = error.create('Integer out of Range')

/**
 * @typedef {object} AbstractDecoder
 * @property {boolean} isEmpty
 * @property {()=>number} read
 * @property {<T>(len:number,h:(buf:ArrayBuffer,start:number,len:number)=>T)=>T} readFrom
 */

/**
 * A Decoder handles the decoding of an Uint8Array.
 * @implements AbstractDecoder
 */
export class Decoder {
  /**
   * @param {Uint8Array<ArrayBuffer>} uint8Array Binary data to decode
   */
  constructor (uint8Array) {
    /**
     * Decoding target.
     *
     * @type {Uint8Array<ArrayBuffer>}
     */
    this.arr = uint8Array
    /**
     * Current decoding position.
     *
     * @type {number}
     */
    this.pos = 0
  }

  get isEmpty () {
    return this.pos === this.arr.length
  }

  /**
   * Read a single byte
   * @return {number}
   */
  read () {
    return this.arr[this.pos++]
  }

  /**
   * Read a slice of data directly from a buffer.
   *
   * @template T
   * @param {number} len
   * @param {(buf:ArrayBuffer,start:number,len:number)=>T} h
   * @return {T}
   */
  readFrom (len, h) {
    const res = h(this.arr.buffer, this.pos + this.arr.byteOffset, len)
    this.pos += len
    return res
  }

  /**
   * Clone decoder instance.
   * Optionally set a new position parameter.
   *
   * @param {number} [newPos] Defaults to current position
   * @return {Decoder} A clone of `decoder`
   */
  clone (newPos = this.pos) {
    const decoder = createDecoder(this.arr)
    decoder.pos = newPos
    return decoder
  }
}

/**
 * @function
 * @param {Uint8Array<ArrayBuffer>} uint8Array
 * @return {Decoder}
 */
export const createDecoder = uint8Array => new Decoder(uint8Array)

/**
 * Create an Uint8Array view of the next `len` bytes and advance the position by `len`.
 *
 * Important: The Uint8Array still points to the underlying ArrayBuffer. Make sure to discard the result as soon as possible to prevent any memory leaks.
 *
 * @function
 * @param {AbstractDecoder} decoder The decoder instance
 * @param {number} len The length of bytes to read
 * @return {Uint8Array<ArrayBuffer>}
 */
export const readUint8Array = (decoder, len) => {
  let view = new Uint8Array(0)
  decoder.readFrom(len, (buf, start, len) => { view = new Uint8Array(buf, start, len) })
  return view
}

/**
 * Read variable length Uint8Array.
 *
 * Important: The Uint8Array still points to the underlying ArrayBuffer. Make sure to discard the result as soon as possible to prevent any memory leaks.
 *            Use `buffer.copyUint8Array` to copy the result into a new Uint8Array.
 *
 * @function
 * @param {AbstractDecoder} decoder
 * @return {Uint8Array<ArrayBuffer>}
 */
export const readVarUint8Array = decoder => readUint8Array(decoder, readVarUint(decoder))

/**
 * Read the rest of the content as an ArrayBuffer
 * @function
 * @param {Decoder} decoder
 * @return {Uint8Array}
 */
export const readTailAsUint8Array = decoder => readUint8Array(decoder, decoder.arr.length - decoder.pos)

/**
 * Read one byte as unsigned integer.
 * @function
 * @param {AbstractDecoder} decoder The decoder instance
 * @return {number} Unsigned 8-bit integer
 */
export const readUint8 = decoder => decoder.read()

/**
 * Read 2 bytes as unsigned integer.
 *
 * @function
 * @param {AbstractDecoder} decoder
 * @return {number} An unsigned integer.
 */
export const readUint16 = decoder =>
  decoder.read() + (decoder.read() << 8)

/**
 * Read 4 bytes as unsigned integer.
 *
 * @function
 * @param {AbstractDecoder} decoder
 * @return {number} An unsigned integer.
 */
export const readUint32 = decoder =>
  (decoder.read() +
  (decoder.read() << 8) +
  (decoder.read() << 16) +
  (decoder.read() << 24)) >>> 0

/**
 * Read 4 bytes as unsigned integer in big endian order.
 * (most significant byte first)
 *
 * @function
 * @param {AbstractDecoder} decoder
 * @return {number} An unsigned integer.
 */
export const readUint32BigEndian = decoder =>
  ((decoder.read() << 24) +
  (decoder.read() << 16) +
  (decoder.read() << 8) +
  decoder.read()) >>> 0

/**
 * Read unsigned integer (32bit) with variable length.
 * 1/8th of the storage is used as encoding overhead.
 *  * numbers < 2^7 is stored in one bytlength
 *  * numbers < 2^14 is stored in two bylength
 *
 * @function
 * @param {AbstractDecoder} decoder
 * @return {number} An unsigned integer.length
 */
export const readVarUint = decoder => {
  let num = 0
  let mult = 1
  while (!decoder.isEmpty) {
    const r = decoder.read()
    // num = num | ((r & binary.BITS7) << len)
    num = num + (r & binary.BITS7) * mult // shift $r << (7*#iterations) and add it to num
    mult *= 128 // next iteration, shift 7 "more" to the left
    if (r < binary.BIT8) {
      return num
    }
    /* c8 ignore start */
    if (num > number.MAX_SAFE_INTEGER) {
      throw errorIntegerOutOfRange
    }
    /* c8 ignore stop */
  }
  throw errorUnexpectedEndOfArray
}

/**
 * Read signed integer (32bit) with variable length.
 * 1/8th of the storage is used as encoding overhead.
 *  * numbers < 2^7 is stored in one bytlength
 *  * numbers < 2^14 is stored in two bylength
 * @todo This should probably create the inverse ~num if number is negative - but this would be a breaking change.
 *
 * @function
 * @param {AbstractDecoder} decoder
 * @return {number} An unsigned integer.length
 */
export const readVarInt = decoder => {
  let r = decoder.read()
  let num = r & binary.BITS6
  let mult = 64
  const sign = (r & binary.BIT7) > 0 ? -1 : 1
  if ((r & binary.BIT8) === 0) {
    // don't continue reading
    return sign * num
  }
  while (!decoder.isEmpty) {
    r = decoder.read()
    // num = num | ((r & binary.BITS7) << len)
    num = num + (r & binary.BITS7) * mult
    mult *= 128
    if (r < binary.BIT8) {
      return sign * num
    }
    /* c8 ignore start */
    if (num > number.MAX_SAFE_INTEGER) {
      throw errorIntegerOutOfRange
    }
    /* c8 ignore stop */
  }
  throw errorUnexpectedEndOfArray
}

/**
 * We don't test this function anymore as we use native decoding/encoding by default now.
 * Better not modify this anymore..
 *
 * Transforming utf8 to a string is pretty expensive. The code performs 10x better
 * when String.fromCodePoint is fed with all characters as arguments.
 * But most environments have a maximum number of arguments per functions.
 * For effiency reasons we apply a maximum of 10000 characters at once.
 *
 * @function
 * @param {AbstractDecoder} decoder
 * @return {String} The read String.
 */
/* c8 ignore start */
export const _readVarStringPolyfill = decoder => {
  let remainingLen = readVarUint(decoder)
  if (remainingLen === 0) {
    return ''
  } else {
    let encodedString = String.fromCodePoint(readUint8(decoder)) // remember to decrease remainingLen
    if (--remainingLen < 100) { // do not create a Uint8Array for small strings
      while (remainingLen--) {
        encodedString += String.fromCodePoint(readUint8(decoder))
      }
    } else {
      while (remainingLen > 0) {
        const nextLen = remainingLen < 10000 ? remainingLen : 10000
        // this is dangerous, we create a fresh array view from the existing buffer
        const bytes = readUint8Array(decoder, nextLen)
        // Starting with ES5.1 we can supply a generic array-like object as arguments
        encodedString += String.fromCodePoint.apply(null, /** @type {any} */ (bytes))
        remainingLen -= nextLen
      }
    }
    return decodeURIComponent(escape(encodedString))
  }
}
/* c8 ignore stop */

/**
 * @function
 * @param {AbstractDecoder} decoder
 * @return {String} The read String
 */
export const _readVarStringNative = decoder =>
  /** @type any */ (string.utf8TextDecoder).decode(readVarUint8Array(decoder))

/**
 * Read string of variable length
 * * varUint is used to store the length of the string
 *
 * @function
 * @param {Decoder} decoder
 * @return {String} The read String
 *
 */
/* c8 ignore next */
export const readVarString = /* @__PURE__ */(() => string.utf8TextDecoder ? _readVarStringNative : _readVarStringPolyfill)()

/**
 * @param {AbstractDecoder} decoder
 * @return {Uint8Array}
 */
export const readTerminatedUint8Array = decoder => {
  const encoder = encoding.createEncoder()
  let b
  while (true) {
    b = readUint8(decoder)
    if (b === 0) {
      return encoder.toUint8Array()
    }
    if (b === 1) {
      b = readUint8(decoder)
    }
    encoder.write(b)
  }
}

/**
 * @param {AbstractDecoder} decoder
 * @return {string}
 */
export const readTerminatedString = decoder => string.decodeUtf8(readTerminatedUint8Array(decoder))

/**
 * Read the next `len` bytes as a DataView and hand it to `reader`. Mirror of
 * `encoding.writeOnDataView`.
 *
 * Important: The DataView is only valid for the duration of the `reader` call
 * and aliases the underlying buffer. Do not retain it.
 *
 * @template T
 * @param {AbstractDecoder} decoder
 * @param {number} len
 * @param {(dview:DataView<ArrayBuffer>,len:number)=>T} reader
 * @return {T}
 */
export const readFromDataView = (decoder, len, reader) =>
  decoder.readFrom(len, (buf, start, len) =>
    reader(new DataView(buf, start, len), len)
  )

/**
 * @param {AbstractDecoder} decoder
 */
export const readFloat32 = decoder => readFromDataView(decoder, 4, dv => dv.getFloat32(0, false))

/**
 * @param {AbstractDecoder} decoder
 */
export const readFloat64 = decoder => readFromDataView(decoder, 8, dv => dv.getFloat64(0, false))

/**
 * @param {AbstractDecoder} decoder
 */
export const readBigInt64 = decoder => readFromDataView(decoder, 8, dv => dv.getBigInt64(0, false))

/**
 * @param {AbstractDecoder} decoder
 */
export const readBigUint64 = decoder => readFromDataView(decoder, 8, dv => dv.getBigUint64(0, false))

/**
 * Read "any-encoded" content.
 *
 * Note: this implementation is non-recursive and optimized for performance. Bytecode size should
 * not exceed 500, so readAny stays inlineable, which will make it work well with different
 * decoders.
 * @param {AbstractDecoder} decoder
 * @return {any}
 */
export const readAny = decoder => {
  /**
   * @type {Array<{ v: any, len: number, isObj: boolean }>?}
   */
  let stack = null
  let root = null
  let stackHead = /** @type {{ v:any, len: number, isObj: boolean }|null} */ (null)
  do {
    let v
    let isObj = false
    let len = 0
    const nextKey = stackHead?.isObj ? readVarString(decoder) : null
    if (decoder.isEmpty) error.unexpectedCase()
    switch (decoder.read()) {
      // CASE 127: undefined
      case 127:
        v = undefined
        break
      // CASE 126: null
      case 126:
        v = null
        break
      // CASE 125: integer
      case 125:
        v = readVarInt(decoder)
        break
      // CASE 124: float32
      case 124:
        v = readFloat32(decoder)
        break
      // CASE 123: float64
      case 123:
        v = readFloat64(decoder)
        break
      // CASE 122: bigint
      case 122:
        v = readBigInt64(decoder)
        break
      // CASE 121: boolean (false)
      case 121:
        v = false
        break
      // CASE 120: boolean (true)
      case 120:
        v = true
        break
      // CASE 119: string
      case 119:
        v = readVarString(decoder)
        break
      // CASE 118: object<string,any>
      case 118: {
        len = readVarUint(decoder)
        isObj = true
        v = /** @type {Object<string,any>} */ ({})
        break
      }
      // CASE 117: array<any>
      case 117: {
        len = readVarUint(decoder)
        v = /** @type {any} */ ([])
        break
      }
      // CASE 116: Uint8Array
      case 116:
        v = readVarUint8Array(decoder)
        break
      // c8 ignore next
      default: error.unexpectedCase()
    }
    if (root === null) {
      root = v
    }
    if (stackHead) {
      if (nextKey != null) {
        stackHead.v[nextKey] = v
      } else {
        stackHead.v.push(v)
      }
      if (--stackHead.len === 0) {
        // @ts-ignore
        stack.pop()
        // @ts-ignore
        stackHead = stack.length > 0 ? stack[stack.length - 1] : null
      }
    }
    // add new stack item if object or array was added
    if (len > 0) {
      if (stack == null) stack = []
      stack.push(stackHead = { v, len, isObj })
    }
  } while (stack?.length)
  return root
}

/**
 * T must not be null.
 *
 * @template T
 */
export class RleDecoder extends Decoder {
  /**
   * @param {Uint8Array<ArrayBuffer>} uint8Array
   * @param {function(Decoder):T} reader
   */
  constructor (uint8Array, reader) {
    super(uint8Array)
    /**
     * The reader
     */
    this.reader = reader
    /**
     * Current state
     * @type {T|null}
     */
    this.s = null
    this.count = 0
  }

  readValue () {
    if (this.count === 0) {
      this.s = this.reader(this)
      if (this.isEmpty) {
        this.count = -1 // read the current value forever
      } else {
        this.count = readVarUint(this) + 1 // see encoder implementation for the reason why this is incremented
      }
    }
    this.count--
    return /** @type {T} */ (this.s)
  }
}

/**
 * @function
 * @template T
 * @param {Uint8Array<ArrayBuffer>} uint8Array
 * @param {function(Decoder):T} reader
 * @return {RleDecoder<T>}
 */
export const createRleDecoder = (uint8Array, reader) => new RleDecoder(uint8Array, reader)

export class IntDiffDecoder extends Decoder {
  /**
   * @param {Uint8Array<ArrayBuffer>} uint8Array
   * @param {number} start
   */
  constructor (uint8Array, start) {
    super(uint8Array)
    /**
     * Current state
     * @type {number}
     */
    this.s = start
  }

  /**
   * @return {number}
   */
  readInt () {
    this.s += readVarInt(this)
    return this.s
  }
}

/**
 * @function
 * @param {Uint8Array<ArrayBuffer>} uint8Array
 * @param {number} start
 * @return {IntDiffDecoder}
 */
export const createIntDiffDecoder = (uint8Array, start) => new IntDiffDecoder(uint8Array, start)

export class RleIntDiffDecoder extends Decoder {
  /**
   * @param {Uint8Array<ArrayBuffer>} uint8Array
   * @param {number} start
   */
  constructor (uint8Array, start) {
    super(uint8Array)
    /**
     * Current state
     * @type {number}
     */
    this.s = start
    this.count = 0
  }

  /**
   * @return {number}
   */
  readInt () {
    if (this.count === 0) {
      this.s += readVarInt(this)
      if (this.isEmpty) {
        this.count = -1 // read the current value forever
      } else {
        this.count = readVarUint(this) + 1 // see encoder implementation for the reason why this is incremented
      }
    }
    this.count--
    return /** @type {number} */ (this.s)
  }
}

/**
 * @function
 * @param {Uint8Array<ArrayBuffer>} uint8Array
 * @param {number} start
 * @return {RleIntDiffDecoder}
 */
export const createRleIntDiffDecoder = (uint8Array, start) => new RleIntDiffDecoder(uint8Array, start)

export class UintOptRleDecoder extends Decoder {
  /**
   * @param {Uint8Array<ArrayBuffer>} uint8Array
   */
  constructor (uint8Array) {
    super(uint8Array)
    /**
     * @type {number}
     */
    this.s = 0
    this.count = 0
  }

  readUint () {
    if (this.count === 0) {
      this.s = readVarInt(this)
      // if the sign is negative, we read the count too, otherwise count is 1
      const isNegative = math.isNegativeZero(this.s)
      this.count = 1
      if (isNegative) {
        this.s = -this.s
        this.count = readVarUint(this) + 2
      }
    }
    this.count--
    return /** @type {number} */ (this.s)
  }
}

/**
 * @function
 * @param {Uint8Array<ArrayBuffer>} uint8Array
 * @return {UintOptRleDecoder}
 */
export const createUintOptRleDecoder = uint8Array => new UintOptRleDecoder(uint8Array)

export class IncUintOptRleDecoder extends Decoder {
  /**
   * @param {Uint8Array<ArrayBuffer>} uint8Array
   */
  constructor (uint8Array) {
    super(uint8Array)
    /**
     * @type {number}
     */
    this.s = 0
    this.count = 0
  }

  readUint () {
    if (this.count === 0) {
      this.s = readVarInt(this)
      // if the sign is negative, we read the count too, otherwise count is 1
      const isNegative = math.isNegativeZero(this.s)
      this.count = 1
      if (isNegative) {
        this.s = -this.s
        this.count = readVarUint(this) + 2
      }
    }
    this.count--
    return /** @type {number} */ (this.s++)
  }
}

/**
 * @function
 * @param {Uint8Array<ArrayBuffer>} uint8Array
 * @return {IncUintOptRleDecoder}
 */
export const createIncUintOptRleDecoder = uint8Array => new IncUintOptRleDecoder(uint8Array)

export class IntDiffOptRleDecoder extends Decoder {
  /**
   * @param {Uint8Array<ArrayBuffer>} uint8Array
   */
  constructor (uint8Array) {
    super(uint8Array)
    /**
     * @type {number}
     */
    this.s = 0
    this.count = 0
    this.diff = 0
  }

  /**
   * @return {number}
   */
  readInt () {
    if (this.count === 0) {
      const diff = readVarInt(this)
      // if the first bit is set, we read more data
      const hasCount = diff & 1
      this.diff = math.floor(diff / 2) // shift >> 1
      this.count = 1
      if (hasCount) {
        this.count = readVarUint(this) + 2
      }
    }
    this.s += this.diff
    this.count--
    return this.s
  }
}

/**
 * @function
 * @param {Uint8Array<ArrayBuffer>} uint8Array
 * @return {IntDiffOptRleDecoder}
 */
export const createIntDiffOptRleDecoder = uint8Array => new IntDiffOptRleDecoder(uint8Array)

export class StringDecoder {
  /**
   * @param {Uint8Array<ArrayBuffer>} uint8Array
   */
  constructor (uint8Array) {
    this.decoder = new UintOptRleDecoder(uint8Array)
    this.str = readVarString(this.decoder)
    /**
     * @type {number}
     */
    this.spos = 0
  }

  /**
   * @return {string}
   */
  readString () {
    const end = this.spos + this.decoder.readUint()
    const res = this.str.slice(this.spos, end)
    this.spos = end
    return res
  }
}

/**
 * @function
 * @param {Uint8Array<ArrayBuffer>} uint8Array
 * @return {StringDecoder}
 */
export const createStringDecoder = uint8Array => new StringDecoder(uint8Array)
