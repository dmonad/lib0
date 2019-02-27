
export const create = f => new Promise(f)
/**
 * `Promise.all` wait for all promises in the array to resolve and return the result
 * @param {Array<Promise<any>>} arrp
 * @return {any}
 */
export const all = arrp => Promise.all(arrp)
export const reject = reason => Promise.reject(reason)
export const resolve = res => Promise.resolve(res)

export const until = (timeout, check) => create((resolve, reject) => {
  const hasTimeout = timeout > 0
  const untilInterval = () => {
    if (check()) {
      clearInterval(intervalHandle)
      resolve()
    } else if (hasTimeout) {
      timeout -= 10
      if (timeout < 0) {
        clearInterval(intervalHandle)
        reject(new Error('Timeout'))
      }
    }
  }
  const intervalHandle = setInterval(untilInterval, 10)
})

export const wait = timeout => create((resolve, reject) => setTimeout(resolve, timeout))
