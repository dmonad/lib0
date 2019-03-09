import * as t from './testing.js'
import * as idb from './indexeddb.js'
import * as environment from './environment.js'
import * as promise from './promise.js'

if (environment.isNode) {
  // @ts-ignore
  global.indexedDB = require('fake-indexeddb')
  // @ts-ignore
  global.IDBKeyRange = require('fake-indexeddb/lib/FDBKeyRange')
}

const initTestDB = db => idb.createStores(db, [['test']])
const testDBName = 'idb-test'

const createTransaction = db => db.transaction(['test'], 'readwrite')
/**
 * @param {IDBTransaction} t
 * @return {IDBObjectStore}
 */
const getStore = t => idb.getStore(t, 'test')

export const testIdbIteration = async () => {
  t.describe('create, then iterate some keys')
  await idb.deleteDB(testDBName)
  const db = await idb.openDB(testDBName, initTestDB)
  const transaction = createTransaction(db)
  await idb.put(getStore(transaction), 0, ['t', 0])
  await idb.put(getStore(transaction), 1, ['t', 1])
  const valsGetAll = await idb.getAll(getStore(transaction))
  if (valsGetAll.length !== 2) {
    t.fail('getAll does not return two values')
  }
  const valsIterate = []
  const keyrange = idb.createIDBKeyRangeBound(['t', 0], ['t', 1], false, false)
  await idb.put(getStore(transaction), 2, ['t', 2])
  await idb.iterate(getStore(transaction), keyrange, (val, key) => {
    valsIterate.push(val)
  })
  if (valsIterate.length !== 2) {
    t.fail('iterate does not return two values')
  }
}

export const testIdbIterationNoAwait = () => {
  t.describe('create, then iterate some keys')
  return idb.deleteDB(testDBName)
    .then(() => idb.openDB(testDBName, initTestDB))
    .then(db => {
      const transaction = createTransaction(db)
      return promise.all([idb.put(getStore(transaction), 0, ['t', 0]), idb.put(getStore(transaction), 1, ['t', 1])])
        .then(() => idb.getAll(getStore(transaction)))
        .then(valsGetAll => {
          if (valsGetAll.length !== 2) {
            return promise.reject('getAll does not return two values')
          }
          return idb.put(getStore(transaction), 2, ['t', 2])
        })
        .then(() => {
          const valsIterate = []
          const keyrange = idb.createIDBKeyRangeBound(['t', 0], ['t', 1], false, false)
          return idb.iterate(getStore(transaction), keyrange, (val, key) => {
            valsIterate.push(val)
          }).then(() => {
            if (valsIterate.length !== 2) {
              return promise.reject('iterate does not return two values')
            } else {
              return promise.resolve()
            }
          })
        })
    })
}
