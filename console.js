/**
 * @module logging
 */

import * as globals from './globals.js'
import * as time from './time.js'

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
 * @param {ArrayBuffer} buffer
 * @return {string}
 */
export const arrayBufferToString = buffer => JSON.stringify(Array.from(globals.createUint8ArrayFromBuffer(buffer)))
