/**
 * @module lib/idb
 */

/* eslint-env browser */

import * as promise from './promise.js'

/*
 * IDB Request to Promise transformer
 */
export const rtop = request => promise.create((resolve, reject) => {
  /* istanbul ignore next */
  request.onerror = event => reject(new Error(event.target.error))
  /* istanbul ignore next */
  request.onblocked = () => location.reload()
  request.onsuccess = event => resolve(event.target.result)
})

/**
 * @param {string} name
 * @param {Function} initDB Called when the database is first created
 * @return {Promise<IDBDatabase>}
 */
export const openDB = (name, initDB) => promise.create((resolve, reject) => {
  let request = indexedDB.open(name)
  /**
   * @param {any} event
   */
  request.onupgradeneeded = event => initDB(event.target.result)
  /* istanbul ignore next */
  /**
   * @param {any} event
   */
  request.onerror = event => reject(new Error(event.target.error))
  /* istanbul ignore next */
  request.onblocked = () => location.reload()
  /**
   * @param {any} event
   */
  request.onsuccess = event => {
    const db = event.target.result
    /* istanbul ignore next */
    db.onversionchange = () => { db.close() }
    /* istanbul ignore if */
    if (typeof addEventListener !== 'undefined') {
      addEventListener('unload', () => db.close())
    }
    resolve(db)
  }
})

export const deleteDB = name => rtop(indexedDB.deleteDatabase(name))

export const createStores = (db, definitions) => definitions.forEach(d =>
  db.createObjectStore.apply(db, d)
)

/**
 * @param {IDBObjectStore} store
 * @param {String | number | ArrayBuffer | Date | Array } key
 * @return {Promise<String | number | ArrayBuffer | Date | Array>}
 */
export const get = (store, key) =>
  rtop(store.get(key))

/**
 * @param {IDBObjectStore} store
 * @param {String | number | ArrayBuffer | Date | IDBKeyRange | Array } key
 */
export const del = (store, key) =>
  rtop(store.delete(key))

/**
 * @param {IDBObjectStore} store
 * @param {String | number | ArrayBuffer | Date | boolean} item
 * @param {String | number | ArrayBuffer | Date | Array} [key]
 */
export const put = (store, item, key) =>
  rtop(store.put(item, key))

/**
 * @param {IDBObjectStore} store
 * @param {String | number | ArrayBuffer | Date | boolean}  item
 * @param {String | number | ArrayBuffer | Date | Array}  key
 * @return {Promise}
 */
export const add = (store, item, key) =>
  rtop(store.add(item, key))

/**
 * @param {IDBObjectStore} store
 * @param {String | number | ArrayBuffer | Date}  item
 * @return {Promise<number>} Returns the generated key
 */
export const addAutoKey = (store, item) =>
  rtop(store.add(item))

/**
 * @param {IDBObjectStore} store
 * @param {IDBKeyRange} [range]
 */
export const getAll = (store, range) =>
  rtop(store.getAll(range))

/**
 * @param {IDBObjectStore} store
 * @param {IDBKeyRange} [range]
 */
export const getAllKeys = (store, range) =>
  rtop(store.getAllKeys(range))

/**
 * @typedef KeyValuePair
 * @type {Object}
 * @property {any} k key
 * @property {any} v Value
 */

/**
 * @param {IDBObjectStore} store
 * @param {IDBKeyRange} [range]
 * @return {Promise<Array<KeyValuePair>>}
 */
export const getAllKeysValues = (store, range) =>
  promise.all([getAllKeys(store, range), getAll(store, range)]).then(([ks, vs]) => ks.map((k, i) => ({ k, v: vs[i] })))

/**
 * @param {any} request
 * @param {function(IDBCursorWithValue):void} f
 * @return {Promise}
 */
const iterateOnRequest = (request, f) => promise.create((resolve, reject) => {
  /* istanbul ignore next */
  request.onerror = reject
  /**
   * @param {any} event
   */
  request.onsuccess = event => {
    const cursor = event.target.result
    if (cursor === null) {
      return resolve()
    }
    f(cursor)
    cursor.continue()
  }
})

/**
 * Iterate on keys and values
 * @param {IDBObjectStore} store
 * @param {IDBKeyRange|null} keyrange
 * @param {function(any,any):void} f Callback that receives (value, key)
 */
export const iterate = (store, keyrange, f) =>
  iterateOnRequest(keyrange !== null ? store.openCursor(keyrange) : store.openCursor(), cursor => f(cursor.value, cursor.key))

/**
 * Iterate on the keys (no values)
 *
 * @param {IDBObjectStore} store
 * @param {IDBKeyRange|null} keyrange
 * @param {function(any):void} f callback that receives the key
 */
export const iterateKeys = (store, keyrange, f) =>
  iterateOnRequest(keyrange !== null ? store.openKeyCursor(keyrange) : store.openKeyCursor(), cursor => f(cursor.key))

/**
 * Open store from transaction
 * @param {IDBTransaction} t
 * @param {String} store
 * @returns {IDBObjectStore}
 */
export const getStore = (t, store) => t.objectStore(store)

export const createIDBKeyRangeBound = (lower, upper, lowerOpen, upperOpen) => IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen)
/* istanbul ignore next */
export const createIDBKeyRangeUpperBound = (upper, upperOpen) => IDBKeyRange.upperBound(upper, upperOpen)
/* istanbul ignore next */
export const createIDBKeyRangeLowerBound = (lower, lowerOpen) => IDBKeyRange.lowerBound(lower, lowerOpen)
