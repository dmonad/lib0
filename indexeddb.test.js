import * as t from './testing.js'
import * as idb from './indexeddb.js'
import { isBrowser } from './environment.js'

/* istanbul ignore next */
/**
 * @param {IDBDatabase} db
 */
const initTestDB = db => idb.createStores(db, [['test', { autoIncrement: true }]])
const testDBName = 'idb-test'

/* istanbul ignore next */
/**
 * @param {IDBDatabase} db
 */
const createTransaction = db => db.transaction(['test'], 'readwrite')

/* istanbul ignore next */
/**
 * @param {IDBTransaction} t
 * @return {IDBObjectStore}
 */
const getStore = t => idb.getStore(t, 'test')

/* istanbul ignore next */
export const testRetrieveElements = async () => {
  t.skip(!isBrowser)
  t.describe('create, then iterate some keys')
  await idb.deleteDB(testDBName)
  const db = await idb.openDB(testDBName, initTestDB)
  const transaction = createTransaction(db)
  const store = getStore(transaction)
  await idb.put(store, 0, ['t', 1])
  await idb.put(store, 1, ['t', 2])
  const expectedKeys = [['t', 1], ['t', 2]]
  const expectedVals = [0, 1]
  const expectedKeysVals = [{ v: 0, k: ['t', 1] }, { v: 1, k: ['t', 2] }]
  t.describe('idb.getAll')
  const valsGetAll = await idb.getAll(store)
  t.compare(valsGetAll, expectedVals)
  t.describe('idb.getAllKeys')
  const valsGetAllKeys = await idb.getAllKeys(store)
  t.compare(valsGetAllKeys, expectedKeys)
  t.describe('idb.getAllKeysVals')
  const valsGetAllKeysVals = await idb.getAllKeysValues(store)
  t.compare(valsGetAllKeysVals, expectedKeysVals)

  /**
   * @param {string} desc
   * @param {IDBKeyRange?} keyrange
   */
  const iterateTests = async (desc, keyrange) => {
    t.describe(`idb.iterate (${desc})`)
    /**
     * @type {Array<{v:any,k:any}>}
     */
    const valsIterate = []
    await idb.iterate(store, keyrange, (v, k) => {
      valsIterate.push({ v, k })
    })
    t.compare(valsIterate, expectedKeysVals)
    t.describe(`idb.iterateKeys (${desc})`)
    /**
     * @type {Array<any>}
     */
    const keysIterate = []
    await idb.iterateKeys(store, keyrange, key => {
      keysIterate.push(key)
    })
    t.compare(keysIterate, expectedKeys)
  }
  await iterateTests('range=null', null)
  const range = idb.createIDBKeyRangeBound(['t', 1], ['t', 2], false, false)
  // adding more items that should not be touched by iteration with above range
  await idb.put(store, 2, ['t', 3])
  await idb.put(store, 2, ['t', 0])
  await iterateTests('range!=null', range)

  t.describe('idb.get')
  const getV = await idb.get(store, ['t', 1])
  t.assert(getV === 0)
  t.describe('idb.del')
  await idb.del(store, ['t', 0])
  const getVDel = await idb.get(store, ['t', 0])
  t.assert(getVDel === undefined)
  t.describe('idb.add')
  await idb.add(store, 99, 42)
  const idbVAdd = await idb.get(store, 42)
  t.assert(idbVAdd === 99)
  t.describe('idb.addAutoKey')
  const key = await idb.addAutoKey(store, 1234)
  const retrieved = await idb.get(store, key)
  t.assert(retrieved === 1234)
}
