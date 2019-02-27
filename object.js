
export const create = Object.create(null)

export const keys = Object.keys

/**
 * @template V
 * @param {Object<string,V>} obj
 * @param {function(V,string):any} f
 */
export const forEach = (obj, f) => {
  for (let key in obj) {
    f(obj[key], key)
  }
}

export const map = (obj, f) => {
  const results = []
  for (let key in obj) {
    results.push(f(obj[key], key))
  }
  return results
}

export const length = obj => Object.keys(obj).length

export const every = (obj, f) => {
  for (let key in obj) {
    if (!f(obj[key], key)) {
      return false
    }
  }
  return true
}

export const some = (obj, f) => every(obj, () => !f())

export const equalFlat = (a, b) => a === b || (length(a) === length(b) && every(a, (val, key) => b[key] === val))
