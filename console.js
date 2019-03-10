/**
 * @module logging
 */

import * as time from './time.js'
import * as buffer from './buffer.js'

let date = time.getUnixTime()

const writeDate = () => {
  const oldDate = date
  date = time.getUnixTime()
  return date - oldDate
}

export const print = console.log
export const log = m => print(`%cydb-client: %c${m} %c+${writeDate()}ms`, 'color: blue;', '', 'color: blue')

export const group = console.group
export const groupCollapsed = console.groupCollapsed
export const groupEnd = console.groupEnd

/**
 * @param {ArrayBuffer} buf
 * @return {string}
 */
export const arrayBufferToString = buf => JSON.stringify(Array.from(buffer.createUint8ArrayFromArrayBuffer(buf)))
