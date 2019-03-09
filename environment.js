
import * as map from './map.js'
import * as string from './string.js'

// @ts-ignore
export const isNode = typeof process !== 'undefined' && /node|io\.js/.test(process.release.name)
export const isBrowser = typeof window !== undefined && !isNode

/**
 * @type {Map<string,string>}
 */
let params
const args = []

const computeParamsNode = () => {
  if (params === undefined) {
    params = map.create()
    const pargs = process.argv
    let currParamName = null
    for (let i = 0; i < pargs.length; i++) {
      const parg = pargs[i]
      if (parg[0] === '-') {
        if (currParamName !== null) {
          params.set(currParamName, '')
        }
        currParamName = parg
      } else {
        if (currParamName !== null) {
          params.set(currParamName, parg)
          currParamName = null
        } else {
          args.push(parg)
        }
      }
    }
  }
  return params
}

const computeParamsBrowser = () => {
  if (params === undefined) {
    params = map.create()
    ;(location.search || '?').slice(1).split('&').forEach(kv => {
      if (kv.length !== 0) {
        const [key, value] = kv.split('=')
        params.set(`--${string.fromCamelCase(key, '-')}`, value)
        params.set(`-${string.fromCamelCase(key, '-')}`, value)
      }
    })
  }
  return params
}

const computeParams = isNode ? computeParamsNode : computeParamsBrowser

export const hasParam = name => computeParams().has(name)
export const getParam = (name, defaultVal = null) => computeParams().get(name) || defaultVal
export const getArgs = name => computeParams() && args
