import * as time from './time.js'

/**
 * @template T
 * @param {function(function(T|PromiseLike<T>):void,function(Error):void):void} f
 * @return {Promise<T>}
 */
export const create = f => new Promise(f)

/**
 * @param {function(function():void,function(Error):void):void} f
 * @return {Promise<void>}
 */
export const createEmpty = f => new Promise(f)

/**
 * `Promise.all` wait for all promises in the array to resolve and return the result
 * @template T
 * @param {Array<Promise<T>>} arrp
 * @return {Promise<Array<T>>}
 */
export const all = arrp => Promise.all(arrp)

/**
 * @param {Error} [reason]
 * @return {Promise<never>}
 */
export const reject = reason => Promise.reject(reason)

/**
 * @template T
 * @param {T|void} res
 * @return {Promise<T|void>}
 */
export const resolve = res => Promise.resolve(res)

/**
 * @param {number} timeout
 * @param {function():boolean} check
 * @return {Promise<void>}
 */
export const until = (timeout, check) => create((resolve, reject) => {
  const startTime = time.getUnixTime()
  const hasTimeout = timeout > 0
  const untilInterval = () => {
    if (check()) {
      clearInterval(intervalHandle)
      resolve()
    } else if (hasTimeout) {
      if (time.getUnixTime() - startTime > timeout) {
        clearInterval(intervalHandle)
        reject(new Error('Timeout'))
      }
    }
  }
  const intervalHandle = setInterval(untilInterval, 10)
})

/**
 * @param {number} timeout
 * @return {Promise<void>}
 */
export const wait = timeout => create((resolve, reject) => setTimeout(resolve, timeout))
