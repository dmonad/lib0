import * as t from './testing.js'
import * as idb from './indexeddbV2.js'
import * as pledge from './pledge.js'
import { isBrowser } from './environment.js'

/* c8 ignore next */
/**
 * @param {IDBDatabase} db
 */
const initTestDB = db => idb.createStores(db, [['test', { autoIncrement: true }]])
const testDBName = 'idb-test'

/* c8 ignore next */
/**
 * @param {pledge.Pledge<IDBDatabase>} db
 */
const createTransaction = db => pledge.createWithDependencies((p, db) => p.resolve(db.transaction(['test'], 'readwrite')), db)

/* c8 ignore next */
/**
 * @param {pledge.Pledge<IDBTransaction>} t
 * @return {pledge.PledgeInstance<IDBObjectStore>}
 */
const getStore = t => pledge.createWithDependencies((p, t) => p.resolve(idb.getStore(t, 'test')), t)

/* c8 ignore next */
export const testRetrieveElements = async () => {
  t.skip(!isBrowser)
  t.describe('create, then iterate some keys')
  await idb.deleteDB(testDBName).promise()
  const db = idb.openDB(testDBName, initTestDB)
  const transaction = createTransaction(db)
  const store = getStore(transaction)
  await idb.put(store, 0, ['t', 1]).promise()
  await idb.put(store, 1, ['t', 2]).promise()
  const expectedKeys = [['t', 1], ['t', 2]]
  const expectedVals = [0, 1]
  const expectedKeysVals = [{ v: 0, k: ['t', 1] }, { v: 1, k: ['t', 2] }]
  t.describe('idb.getAll')
  const valsGetAll = await idb.getAll(store).promise()
  t.compare(valsGetAll, expectedVals)
  t.describe('idb.getAllKeys')
  const valsGetAllKeys = await idb.getAllKeys(store).promise()
  t.compare(valsGetAllKeys, expectedKeys)
  t.describe('idb.getAllKeysVals')
  const valsGetAllKeysVals = await idb.getAllKeysValues(store).promise()
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
    }).promise()
    t.compare(valsIterate, expectedKeysVals)
    t.describe(`idb.iterateKeys (${desc})`)
    /**
     * @type {Array<any>}
     */
    const keysIterate = []
    await idb.iterateKeys(store, keyrange, key => {
      keysIterate.push(key)
    }).promise()
    t.compare(keysIterate, expectedKeys)
  }
  await iterateTests('range=null', null)
  const range = idb.createIDBKeyRangeBound(['t', 1], ['t', 2], false, false)
  // adding more items that should not be touched by iteration with above range
  await idb.put(store, 2, ['t', 3]).promise()
  await idb.put(store, 2, ['t', 0]).promise()
  await iterateTests('range!=null', range)

  t.describe('idb.get')
  const getV = await idb.get(store, ['t', 1]).promise()
  t.assert(getV === 0)
  t.describe('idb.del')
  await idb.del(store, ['t', 0]).promise()
  const getVDel = await idb.get(store, ['t', 0]).promise()
  t.assert(getVDel === undefined)
  t.describe('idb.add')
  await idb.add(store, 99, 42).promise()
  const idbVAdd = await idb.get(store, 42).promise()
  t.assert(idbVAdd === 99)
  t.describe('idb.addAutoKey')
  const key = await idb.addAutoKey(store, 1234).promise()
  const retrieved = await idb.get(store, key).promise()
  t.assert(retrieved === 1234)
}

/* c8 ignore next */
export const testBlocked = async () => {
  t.skip(!isBrowser)
  t.describe('ignore blocked event')
  await idb.deleteDB(testDBName).map(() => {
    const db = idb.openDB(testDBName, initTestDB)
    const transaction = createTransaction(db)
    const store = getStore(transaction)
    return pledge.all({
      _req1: idb.put(store, 0, ['t', 1]),
      _req2: idb.put(store, 1, ['t', 2]),
      db
    })
  }).map(({ db }) => {
    db.close()
    return idb.deleteDB(testDBName)
  }).promise()
}
