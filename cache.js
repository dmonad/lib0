
/* eslint-env browser */

/**
 * An implementation of a map which has keys that expire.
 *
 * @module cached-map
 */

import * as list from './list.js'
import * as map from './map.js'
import * as time from './time.js'

/**
 * @template K, V
 *
 * @implements {list.ListNode}
 */
class Entry {
  /**
   * @param {K} key
   * @param {V | Promise<V>} val
   */
  constructor (key, val) {
    /**
     * @type {this | null}
     */
    this.prev = null
    /**
     * @type {this | null}
     */
    this.next = null
    this.created = time.getUnixTime()
    this.val = val
    this.key = key
  }
}

/**
 * @template K, V
 */
export class Cache {
  /**
   * @param {number} timeout
   */
  constructor (timeout) {
    this.timeout = timeout
    /**
     * @type list.List<Entry<K, V>>
     */
    this._q = list.create()
    /**
     * @type {Map<K, Entry<K, V>>}
     */
    this._map = map.create()
  }
}

/**
 * @template K, V
 *
 * @param {Cache<K, V>} cache
 * @return {number} Returns the current timestamp
 */
export const removeStale = cache => {
  const now = time.getUnixTime()
  const q = cache._q
  while (q.start && now - q.start.created > cache.timeout) {
    cache._map.delete(q.start.key)
    list.popFront(q)
  }
  return now
}

/**
 * @template K, V
 *
 * @param {Cache<K, V>} cache
 * @param {K} key
 * @param {V} value
 */
export const set = (cache, key, value) => {
  const now = removeStale(cache)
  const q = cache._q
  const n = cache._map.get(key)
  if (n) {
    list.removeNode(q, n)
    list.pushEnd(q, n)
    n.created = now
    n.val = value
  } else {
    const node = new Entry(key, value)
    list.pushEnd(q, node)
    cache._map.set(key, node)
  }
}

/**
 * @template K, V
 *
 * @param {Cache<K, V>} cache
 * @param {K} key
 * @return {Entry<K, V> | undefined}
 */
const getNode = (cache, key) => {
  const now = removeStale(cache)
  const q = cache._q
  const n = cache._map.get(key)
  if (n) {
    list.removeNode(q, n)
    list.pushEnd(q, n)
    n.created = now
    return n
  }
}

/**
 * @template K, V
 *
 * @param {Cache<K, V>} cache
 * @param {K} key
 * @return {V | undefined}
 */
export const get = (cache, key) => {
  const n = getNode(cache, key)
  return n && !(n.val instanceof Promise) ? n.val : undefined
}

/**
 * Works well in conjunktion with setIfUndefined which has an async init function.
 * Using getAsync & setIfUndefined ensures that the init function is only called once.
 *
 * @template K, V
 *
 * @param {Cache<K, V>} cache
 * @param {K} key
 * @return {V | Promise<V> | undefined}
 */
export const getAsync = (cache, key) => {
  const n = getNode(cache, key)
  return n ? n.val : undefined
}

/**
 * @template K, V
 *
 * @param {Cache<K, V>} cache
 * @param {K} key
 * @param {function():Promise<V>} init
 * @return {Promise<V> | V}
 */
export const setIfUndefined = (cache, key, init) => {
  const now = removeStale(cache)
  const q = cache._q
  const n = cache._map.get(key)
  if (n) {
    list.removeNode(q, n)
    list.pushEnd(q, n)
    n.created = now
    return n.val
  } else {
    const p = init()
    const node = new Entry(key, p)
    list.pushEnd(q, node)
    cache._map.set(key, node)
    p.then(v => {
      if (p === node.val) {
        node.val = v
      }
    })
    return p
  }
}

/**
 * @param {number} timeout
 */
export const create = timeout => new Cache(timeout)
