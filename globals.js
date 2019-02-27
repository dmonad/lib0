/**
 * @module globals
 */

/* eslint-env browser */

/**
 * @param {Array<number>} arr
 * @return {ArrayBuffer}
 */
export const createArrayBufferFromArray = arr => new Uint8Array(arr).buffer

export const createUint8ArrayFromLen = len => new Uint8Array(len)

/**
 * Create Uint8Array with initial content from buffer
 */
export const createUint8ArrayFromBuffer = (buffer, byteOffset, length) => new Uint8Array(buffer, byteOffset, length)

/**
 * Create Uint8Array with initial content from buffer
 */
export const createUint8ArrayFromArrayBuffer = arraybuffer => new Uint8Array(arraybuffer)
export const createArrayFromArrayBuffer = arraybuffer => Array.from(createUint8ArrayFromArrayBuffer(arraybuffer))

export const createPromise = f => new Promise(f)

export const createMap = () => new Map()
export const createSet = () => new Set()

export const error = description => new Error(description)

/**
 * @param {number} t Time to wait
 * @return {Promise} Promise that is resolved after t ms
 */
export const wait = t => createPromise(r => setTimeout(r, t))
