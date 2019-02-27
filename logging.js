
import { isNode, isBrowser } from './environment.js'
import * as symbol from './symbol.js'
import * as pair from './pair.js'
import * as dom from './dom.js'
import * as json from './json.js'
import * as map from './map.js'
import * as eventloop from './eventloop.js'
import * as math from './math.js'

export const BOLD = symbol.create()
export const UNBOLD = symbol.create()
export const BLUE = symbol.create()
export const GREY = symbol.create()
export const GREEN = symbol.create()
export const RED = symbol.create()
export const PURPLE = symbol.create()
export const ORANGE = symbol.create()
export const UNCOLOR = symbol.create()

class Style {
  constructor (text, attrs) {
    this.text = text
    this.attrs = attrs
  }
}

export const style = (text, attrs) => new Style(text, attrs)

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
  [ORANGE]: pair.create('color', 'orange'),
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

const computeBrowserLoggingArgs = args => {
  const strBuilder = []
  const styles = []
  const currentStyle = map.create()
  let logArgs = []

  // try with formatting until we find something unsupported
  let i = 0

  for (; i < args.length; i++) {
    const arg = args[i]
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
    logArgs.push(args[i])
  }
  return logArgs
}

const computeNodeLoggingArgs = args => {
  const strBuilder = []
  const logArgs = []

  // try with formatting until we find something unsupported
  let i = 0

  for (; i < args.length; i++) {
    const arg = args[i]
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
    logArgs.push(args[i])
  }
  return logArgs
}

const computeLoggingArgs = isNode ? computeNodeLoggingArgs : computeBrowserLoggingArgs

export const print = (...args) => {
  console.log(...computeLoggingArgs(args))
  vconsoles.forEach(vc => vc.print(args))
}

export const warn = (...args) => {
  console.warn(...computeLoggingArgs(args))
  args.unshift(ORANGE)
  vconsoles.forEach(vc => vc.print(args))
}

export const printError = err => {
  console.error(err)
  vconsoles.forEach(vc => vc.printError(err))
}

/**
 * @param {string} url image location
 * @param {number} height height of the image in pixel
 */
export const printImg = (url, height) => {
  if (isBrowser) {
    console.log('%c                      ', `font-size: ${height}px; background-size: contain; background-repeat: no-repeat; background-image: url(${url})`)
    // console.log('%c                ', `font-size: ${height}x; background: url(${url}) no-repeat;`)
  }
  vconsoles.forEach(vc => vc.printImg(url, height))
}

export const printImgBase64 = (base64, height) => printImg(`data:image/gif;base64,${base64}`, height)

export const group = (...args) => {
  console.group(...computeLoggingArgs(args))
  vconsoles.forEach(vc => vc.group(args))
}
export const groupCollapsed = (...args) => {
  console.groupCollapsed(...computeLoggingArgs(args))
  vconsoles.forEach(vc => vc.groupCollapsed(args))
}
export const groupEnd = () => {
  console.groupEnd()
  vconsoles.forEach(vc => vc.groupEnd())
}

/**
 * @param {function():Node} createNode
 */
export const printDom = createNode =>
  vconsoles.forEach(vc => vc.printDom(createNode()))

export const printCanvas = (canvas, height) => printImg(canvas.toDataURL(), height)

export const vconsoles = new Set()

const _computeLineSpans = args => {
  const spans = []
  const currentStyle = new Map()
  // try with formatting until we find something unsupported
  let i = 0
  for (; i < args.length; i++) {
    const arg = args[i]
    const style = _browserStyleMap[arg]
    if (style !== undefined) {
      currentStyle.set(style.left, style.right)
    } else {
      if (arg.constructor === String || arg.constructor === Number) {
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
    if (content.constructor !== String && content.constructor !== Number) {
      content = ' ' + json.stringify(content) + ' '
    }
    spans.push(dom.element('span', [], [dom.text(content)]))
  }
  return spans
}

const lineStyle = 'font-family:monospace;border-bottom:1px solid #e2e2e2;padding:2px;'

export class VConsole {
  constructor (dom) {
    this.dom = dom
    this.ccontainer = this.dom
    this.depth = 0
    vconsoles.add(this)
  }
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
  groupCollapsed (args) {
    this.group(args, true)
  }
  groupEnd () {
    eventloop.enqueue(() => {
      if (this.depth > 0) {
        this.depth--
        this.ccontainer = this.ccontainer.parentElement.parentElement
      }
    })
  }
  print (args) {
    eventloop.enqueue(() => {
      dom.append(this.ccontainer, [dom.element('div', [pair.create('style', `${lineStyle};padding-left:${this.depth * 10}px`)], _computeLineSpans(args))])
    })
  }
  printError (err) {
    this.print([RED, BOLD, err.toString()])
  }
  printImg (url, height) {
    eventloop.enqueue(() => {
      dom.append(this.ccontainer, [dom.element('img', [pair.create('src', url), pair.create('height', `${math.round(height * 1.5)}px`)])])
    })
  }
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

export const createVConsole = dom => new VConsole(dom)
