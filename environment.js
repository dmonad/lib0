/**
 * Isomorphic module to work access the environment (query params, env variables).
 *
 * @module map
 */

import * as map from './map.js'
import * as string from './string.js'
import * as conditions from './conditions.js'
import * as storage from './storage.js'
import * as f from './function.js'

/* c8 ignore next */
// @ts-ignore
export const isNode = typeof process !== 'undefined' && process.release &&
  /node|io\.js/.test(process.release.name)
/* c8 ignore next */
export const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined' && !isNode
/* c8 ignore next 3 */
export const isMac = typeof navigator !== 'undefined'
  ? /Mac/.test(navigator.platform)
  : false

/**
 * @type {Map<string,string>}
 */
let params
const args = []

/* c8 ignore start */
const computeParams = () => {
  if (params === undefined) {
    if (isNode) {
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
      if (currParamName !== null) {
        params.set(currParamName, '')
      }
      // in ReactNative for example this would not be true (unless connected to the Remote Debugger)
    } else if (typeof location === 'object') {
      params = map.create(); // eslint-disable-next-line no-undef
      (location.search || '?').slice(1).split('&').forEach((kv) => {
        if (kv.length !== 0) {
          const [key, value] = kv.split('=')
          params.set(`--${string.fromCamelCase(key, '-')}`, value)
          params.set(`-${string.fromCamelCase(key, '-')}`, value)
        }
      })
    } else {
      params = map.create()
    }
  }
  return params
}
/* c8 ignore stop */

/**
 * @param {string} name
 * @return {boolean}
 */
/* c8 ignore next */
export const hasParam = (name) => computeParams().has(name)

/**
 * @param {string} name
 * @param {string} defaultVal
 * @return {string}
 */
/* c8 ignore next 2 */
export const getParam = (name, defaultVal) =>
  computeParams().get(name) || defaultVal

/**
 * @param {string} name
 * @return {string|null}
 */
/* c8 ignore next 4 */
export const getVariable = (name) =>
  isNode
    ? conditions.undefinedToNull(process.env[name.toUpperCase()])
    : conditions.undefinedToNull(storage.varStorage.getItem(name))

/**
 * @param {string} name
 * @return {string|null}
 */
/* c8 ignore next 2 */
export const getConf = (name) =>
  computeParams().get('--' + name) || getVariable(name)

/**
 * @param {string} name
 * @return {boolean}
 */
/* c8 ignore next 2 */
export const hasConf = (name) =>
  hasParam('--' + name) || getVariable(name) !== null

/* c8 ignore next */
export const production = hasConf('production')

/* c8 ignore next 2 */
const forceColor = isNode &&
  f.isOneOf(process.env.FORCE_COLOR, ['true', '1', '2'])

/* c8 ignore start */
export const supportsColor = !hasParam('no-colors') &&
  (!isNode || process.stdout.isTTY || forceColor) && (
  !isNode || hasParam('color') || forceColor ||
    getVariable('COLORTERM') !== null ||
    (getVariable('TERM') || '').includes('color')
)
/* c8 ignore stop */
