import * as symbol from './symbol.js'
import * as time from './time.js'
import * as env from './environment.js'
import * as func from './function.js'

export const BOLD = symbol.create()
export const UNBOLD = symbol.create()
export const BLUE = symbol.create()
export const GREY = symbol.create()
export const GREEN = symbol.create()
export const RED = symbol.create()
export const PURPLE = symbol.create()
export const ORANGE = symbol.create()
export const UNCOLOR = symbol.create()

/* c8 ignore start */
/**
 * @param {Array<string|Symbol|Object|number>} args
 * @return {Array<string|object|number>}
 */
export const computeNoColorLoggingArgs = args => {
  const strBuilder = []
  const logArgs = []
  // try with formatting until we find something unsupported
  let i = 0
  for (; i < args.length; i++) {
    const arg = args[i]
    if (arg.constructor === String || arg.constructor === Number) {
      strBuilder.push(arg)
    } else if (arg.constructor === Object) {
      logArgs.push(JSON.stringify(arg))
    }
  }
  return logArgs
}
/* c8 ignore stop */

const loggingColors = [GREEN, PURPLE, ORANGE, BLUE]
let nextColor = 0
let lastLoggingTime = time.getUnixTime()

/* c8 ignore start */
/**
 * @param {function(...any):void} _print
 * @param {string} moduleName
 * @return {function(...any):void}
 */
export const createModuleLogger = (_print, moduleName) => {
  const color = loggingColors[nextColor]
  const debugRegexVar = env.getVariable('log')
  const doLogging = debugRegexVar !== null &&
    (debugRegexVar === '*' || debugRegexVar === 'true' ||
      new RegExp(debugRegexVar, 'gi').test(moduleName))
  nextColor = (nextColor + 1) % loggingColors.length
  moduleName += ': '
  return !doLogging
    ? func.nop
    : (...args) => {
      const timeNow = time.getUnixTime()
      const timeDiff = timeNow - lastLoggingTime
      lastLoggingTime = timeNow
      _print(
        color,
        moduleName,
        UNCOLOR,
        ...args.map((arg) =>
          (typeof arg === 'string' || typeof arg === 'symbol')
            ? arg
            : JSON.stringify(arg)
        ),
        color,
        ' +' + timeDiff + 'ms'
      )
    }
}
/* c8 ignore stop */
