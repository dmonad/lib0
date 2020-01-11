
import * as map from './map.js'
import * as string from './string.js'
import * as conditions from './conditions.js'

/* istanbul ignore next */
// @ts-ignore
export const isNode = typeof process !== 'undefined' && process.release && /node|io\.js/.test(process.release.name)
/* istanbul ignore next */
export const isBrowser = typeof window !== 'undefined' && !isNode
export const isMac = typeof navigator !== 'undefined' ? /Mac/.test(navigator.platform) : false

/**
 * @type {Map<string,string>}
 */
let params
const args = []

/* istanbul ignore next */
const computeParams = () => {
  if (params === undefined) {
    if (isNode) {
      params = map.create()
      const pargs = process.argv
      let currParamName = null
      /* istanbul ignore next */
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
    } else {
      params = map.create()
      // eslint-disable-next-line no-undef
      ;(location.search || '?').slice(1).split('&').forEach(kv => {
        if (kv.length !== 0) {
          const [key, value] = kv.split('=')
          params.set(`--${string.fromCamelCase(key, '-')}`, value)
          params.set(`-${string.fromCamelCase(key, '-')}`, value)
        }
      })
    }
  }
  return params
}

/**
 * @param {string} name
 * @return {boolean}
 */
export const hasParam = name => computeParams().has(name)

/* istanbul ignore next */
/**
 * @param {string} name
 * @param {string} defaultVal
 * @return {string}
 */
export const getParam = (name, defaultVal) => computeParams().get(name) || defaultVal
// export const getArgs = name => computeParams() && args

/**
 * @param {string} name
 * @return {string|null}
 */
export const getVariable = name => isNode ? conditions.undefinedToNull(process.env[name.toUpperCase()]) : conditions.undefinedToNull(window.localStorage.getItem(name))

/**
 * @param {string} name
 * @return {string|null}
 */
export const getConf = name => computeParams().get(name) || getVariable(name)

export const production = hasParam('production') || getVariable('production') !== null
