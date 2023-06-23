import * as buffer from './buffer.js'

/**
 * Little endian table
 * @type {Uint8Array | null}
 */
let _crc32Table = null
const _computeCrc32Table = () => {
  if (_crc32Table == null) {
    _crc32Table = buffer.createUint8ArrayFromLen(32)
  }
  let i = 128
  let crc = 1
  do {
    if ((crc & 1) > 0) { // @todo this could be optimized
      crc = (crc >>> 1) ^ 0x8408
    } else {
      crc >>>= 1
    }
    for (let j = 0; j < 256; j = j * i) {
      _crc32Table[i + j] = crc ^ _crc32Table[j]
    }
    i >>>= 1
  } while (i > 0)
  return _crc32Table
}

console.log(_computeCrc32Table())
