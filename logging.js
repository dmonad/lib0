/**
 * Isomorphic logging module with support for colors!
 *
 * @module logging
 */

import * as env from './environment.js'
import * as symbol from './symbol.js'
import * as pair from './pair.js'
import * as dom from './dom.js'
import * as json from './json.js'
import * as map from './map.js'
import * as eventloop from './eventloop.js'
import * as math from './math.js'
import * as time from './time.js'
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

/**
 * @type {Object<Symbol,pair.Pair<string,string>>}
 */
const _browserStyleMap = {
  [BOLD]: pair.create('font-weight', 'bold'),
  [UNBOLD]: pair.create('font-weight', 'normal'),
  [BLUE]: pair.create('color', 'blue'),
  [GREEN]: pair.create('color', 'green'),
  [GREY]: pair.create('color', 'grey'),
  [RED]: pair.create('color', 'red'),
  [PURPLE]: pair.create('color', 'purple'),
  [ORANGE]: pair.create('color', 'orange'), // not well supported in chrome when debugging node with inspector - TODO: deprecate
  [UNCOLOR]: pair.create('color', 'black')
}

const _nodeStyleMap = {
  [BOLD]: '\u001b[1m',
  [UNBOLD]: '\u001b[2m',
  [BLUE]: '\x1b[34m',
  [GREEN]: '\x1b[32m',
  [GREY]: '\u001b[37m',
  [RED]: '\x1b[31m',
  [PURPLE]: '\x1b[35m',
  [ORANGE]: '\x1b[38;5;208m',
  [UNCOLOR]: '\x1b[0m'
}

/* istanbul ignore next */
/**
 * @param {Array<string|Symbol|Object|number>} args
 * @return {Array<string|object|number>}
 */
const computeBrowserLoggingArgs = args => {
  const strBuilder = []
  const styles = []
  const currentStyle = map.create()
  /**
   * @type {Array<string|Object|number>}
   */
  let logArgs = []
  // try with formatting until we find something unsupported
  let i = 0

  for (; i < args.length; i++) {
    const arg = args[i]
    // @ts-ignore
    const style = _browserStyleMap[arg]
    if (style !== undefined) {
      currentStyle.set(style.left, style.right)
    } else {
      if (arg.constructor === String || arg.constructor === Number) {
        const style = dom.mapToStyleString(currentStyle)
        if (i > 0 || style.length > 0) {
          strBuilder.push('%c' + arg)
          styles.push(style)
        } else {
          strBuilder.push(arg)
        }
      } else {
        break
      }
    }
  }

  if (i > 0) {
    // create logArgs with what we have so far
    logArgs = styles
    logArgs.unshift(strBuilder.join(''))
  }
  // append the rest
  for (; i < args.length; i++) {
    const arg = args[i]
    if (!(arg instanceof Symbol)) {
      logArgs.push(arg)
    }
  }
  return logArgs
}

/**
 * @param {Array<string|Symbol|Object|number>} args
 * @return {Array<string|object|number>}
 */
const computeNodeLoggingArgs = args => {
  const strBuilder = []
  const logArgs = []

  // try with formatting until we find something unsupported
  let i = 0

  for (; i < args.length; i++) {
    const arg = args[i]
    // @ts-ignore
    const style = _nodeStyleMap[arg]
    if (style !== undefined) {
      strBuilder.push(style)
    } else {
      if (arg.constructor === String || arg.constructor === Number) {
        strBuilder.push(arg)
      } else {
        break
      }
    }
  }
  if (i > 0) {
    // create logArgs with what we have so far
    strBuilder.push('\x1b[0m')
    logArgs.push(strBuilder.join(''))
  }
  // append the rest
  for (; i < args.length; i++) {
    const arg = args[i]
    /* istanbul ignore else */
    if (!(arg instanceof Symbol)) {
      logArgs.push(arg)
    }
  }
  return logArgs
}

/* istanbul ignore next */
const computeLoggingArgs = env.isNode ? computeNodeLoggingArgs : computeBrowserLoggingArgs

/**
 * @param {Array<string|Symbol|Object|number>} args
 */
export const print = (...args) => {
  console.log(...computeLoggingArgs(args))
  /* istanbul ignore next */
  vconsoles.forEach(vc => vc.print(args))
}

/* istanbul ignore next */
/**
 * @param {Array<string|Symbol|Object|number>} args
 */
export const warn = (...args) => {
  console.warn(...computeLoggingArgs(args))
  args.unshift(ORANGE)
  vconsoles.forEach(vc => vc.print(args))
}

/* istanbul ignore next */
/**
 * @param {Error} err
 */
export const printError = err => {
  console.error(err)
  vconsoles.forEach(vc => vc.printError(err))
}

/* istanbul ignore next */
/**
 * @param {string} url image location
 * @param {number} height height of the image in pixel
 */
export const printImg = (url, height) => {
  if (env.isBrowser) {
    console.log('%c                      ', `font-size: ${height}px; background-size: contain; background-repeat: no-repeat; background-image: url(${url})`)
    // console.log('%c                ', `font-size: ${height}x; background: url(${url}) no-repeat;`)
  }
  vconsoles.forEach(vc => vc.printImg(url, height))
}

/* istanbul ignore next */
/**
 * @param {string} base64
 * @param {number} height
 */
export const printImgBase64 = (base64, height) => printImg(`data:image/gif;base64,${base64}`, height)

/**
 * @param {Array<string|Symbol|Object|number>} args
 */
export const group = (...args) => {
  console.group(...computeLoggingArgs(args))
  /* istanbul ignore next */
  vconsoles.forEach(vc => vc.group(args))
}

/**
 * @param {Array<string|Symbol|Object|number>} args
 */
export const groupCollapsed = (...args) => {
  console.groupCollapsed(...computeLoggingArgs(args))
  /* istanbul ignore next */
  vconsoles.forEach(vc => vc.groupCollapsed(args))
}

export const groupEnd = () => {
  console.groupEnd()
  /* istanbul ignore next */
  vconsoles.forEach(vc => vc.groupEnd())
}

/* istanbul ignore next */
/**
 * @param {function():Node} createNode
 */
export const printDom = createNode =>
  vconsoles.forEach(vc => vc.printDom(createNode()))

/* istanbul ignore next */
/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} height
 */
export const printCanvas = (canvas, height) => printImg(canvas.toDataURL(), height)

export const vconsoles = new Set()

/* istanbul ignore next */
/**
 * @param {Array<string|Symbol|Object|number>} args
 * @return {Array<Element>}
 */
const _computeLineSpans = args => {
  const spans = []
  const currentStyle = new Map()
  // try with formatting until we find something unsupported
  let i = 0
  for (; i < args.length; i++) {
    const arg = args[i]
    // @ts-ignore
    const style = _browserStyleMap[arg]
    if (style !== undefined) {
      currentStyle.set(style.left, style.right)
    } else {
      if (arg.constructor === String || arg.constructor === Number) {
        // @ts-ignore
        const span = dom.element('span', [pair.create('style', dom.mapToStyleString(currentStyle))], [dom.text(arg)])
        if (span.innerHTML === '') {
          span.innerHTML = '&nbsp;'
        }
        spans.push(span)
      } else {
        break
      }
    }
  }
  // append the rest
  for (; i < args.length; i++) {
    let content = args[i]
    if (!(content instanceof Symbol)) {
      if (content.constructor !== String && content.constructor !== Number) {
        content = ' ' + json.stringify(content) + ' '
      }
      spans.push(dom.element('span', [], [dom.text(/** @type {string} */ (content))]))
    }
  }
  return spans
}

const lineStyle = 'font-family:monospace;border-bottom:1px solid #e2e2e2;padding:2px;'

/* istanbul ignore next */
export class VConsole {
  /**
   * @param {Element} dom
   */
  constructor (dom) {
    this.dom = dom
    /**
     * @type {Element}
     */
    this.ccontainer = this.dom
    this.depth = 0
    vconsoles.add(this)
  }

  /**
   * @param {Array<string|Symbol|Object|number>} args
   * @param {boolean} collapsed
   */
  group (args, collapsed = false) {
    eventloop.enqueue(() => {
      const triangleDown = dom.element('span', [pair.create('hidden', collapsed), pair.create('style', 'color:grey;font-size:120%;')], [dom.text('▼')])
      const triangleRight = dom.element('span', [pair.create('hidden', !collapsed), pair.create('style', 'color:grey;font-size:125%;')], [dom.text('▶')])
      const content = dom.element('div', [pair.create('style', `${lineStyle};padding-left:${this.depth * 10}px`)], [triangleDown, triangleRight, dom.text(' ')].concat(_computeLineSpans(args)))
      const nextContainer = dom.element('div', [pair.create('hidden', collapsed)])
      const nextLine = dom.element('div', [], [content, nextContainer])
      dom.append(this.ccontainer, [nextLine])
      this.ccontainer = nextContainer
      this.depth++
      // when header is clicked, collapse/uncollapse container
      dom.addEventListener(content, 'click', event => {
        nextContainer.toggleAttribute('hidden')
        triangleDown.toggleAttribute('hidden')
        triangleRight.toggleAttribute('hidden')
      })
    })
  }

  /**
   * @param {Array<string|Symbol|Object|number>} args
   */
  groupCollapsed (args) {
    this.group(args, true)
  }

  groupEnd () {
    eventloop.enqueue(() => {
      if (this.depth > 0) {
        this.depth--
        // @ts-ignore
        this.ccontainer = this.ccontainer.parentElement.parentElement
      }
    })
  }

  /**
   * @param {Array<string|Symbol|Object|number>} args
   */
  print (args) {
    eventloop.enqueue(() => {
      dom.append(this.ccontainer, [dom.element('div', [pair.create('style', `${lineStyle};padding-left:${this.depth * 10}px`)], _computeLineSpans(args))])
    })
  }

  /**
   * @param {Error} err
   */
  printError (err) {
    this.print([RED, BOLD, err.toString()])
  }

  /**
   * @param {string} url
   * @param {number} height
   */
  printImg (url, height) {
    eventloop.enqueue(() => {
      dom.append(this.ccontainer, [dom.element('img', [pair.create('src', url), pair.create('height', `${math.round(height * 1.5)}px`)])])
    })
  }

  /**
   * @param {Node} node
   */
  printDom (node) {
    eventloop.enqueue(() => {
      dom.append(this.ccontainer, [node])
    })
  }

  destroy () {
    eventloop.enqueue(() => {
      vconsoles.delete(this)
    })
  }
}

/* istanbul ignore next */
/**
 * @param {Element} dom
 */
export const createVConsole = dom => new VConsole(dom)

const loggingColors = [GREEN, PURPLE, ORANGE, BLUE]
let nextColor = 0
let lastLoggingTime = time.getUnixTime()

/**
 * @param {string} moduleName
 * @return {function(...any):void}
 */
export const createModuleLogger = moduleName => {
  const color = loggingColors[nextColor]
  const debugRegexVar = env.getVariable('log')
  const doLogging = debugRegexVar !== null && (debugRegexVar === '*' || debugRegexVar === 'true' || new RegExp(debugRegexVar, 'gi').test(moduleName))
  nextColor = (nextColor + 1) % loggingColors.length
  moduleName += ': '

  return !doLogging ? func.nop : (...args) => {
    const timeNow = time.getUnixTime()
    const timeDiff = timeNow - lastLoggingTime
    lastLoggingTime = timeNow
    print(color, moduleName, UNCOLOR, ...args.map(arg => (typeof arg === 'string' || typeof arg === 'symbol') ? arg : JSON.stringify(arg)), color, ' +' + timeDiff + 'ms')
  }
}
