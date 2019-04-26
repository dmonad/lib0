/* eslint-env browser */

import * as map from './map.js'
import * as buffer from './buffer.js'

/**
 * @typedef {Object} Channel
 * @property {Set<Function>} Channel.subs
 * @property {any} Channel.bc
 */

/**
 * @type {Map<string, Channel>}
 */
const channels = new Map()

class LocalStoragePolyfill {
  /**
   * @param {string} room
   */
  constructor (room) {
    this.room = room
    /**
     * @type {null|function({data:ArrayBuffer}):void}
     */
    this.onmessage = null
    addEventListener('storage', e => e.key === room && this.onmessage !== null && this.onmessage({ data: buffer.fromBase64(e.newValue || '') }))
  }
  /**
   * @param {ArrayBuffer} buf
   */
  postMessage (buf) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.room, buffer.toBase64(buffer.createUint8ArrayFromArrayBuffer(buf)))
    }
  }
}

// Use BroadcastChannel or Polyfill
const BC = typeof BroadcastChannel === 'undefined' ? LocalStoragePolyfill : BroadcastChannel

/**
 * @param {string} room
 * @return {Channel}
 */
const getChannel = room =>
  map.setIfUndefined(channels, room, () => {
    const subs = new Set()
    const bc = new BC(room)
    /**
     * @param {{data:ArrayBuffer}} e
     */
    bc.onmessage = e => subs.forEach(sub => sub(e.data))
    return {
      bc, subs
    }
  })

/**
 * @function
 * @param {string} room
 * @param {Function} f
 */
export const subscribe = (room, f) => getChannel(room).subs.add(f)

/**
 * @function
 * @param {string} room
 * @param {Function} f
 */
export const unsubscribe = (room, f) => getChannel(room).subs.delete(f)

/**
 * Publish data to all subscribers (including subscribers on this tab)
 *
 * @function
 * @param {string} room
 * @param {ArrayBuffer} data
 */
export const publish = (room, data) => {
  const c = getChannel(room)
  c.bc.postMessage(data)
  c.subs.forEach(sub => sub(data))
}
