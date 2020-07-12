/* eslint-env browser */

/**
 * Utility module to work with the DOM.
 *
 * @module dom
 */

import * as pair from './pair.js'
import * as map from './map.js'

/* istanbul ignore next */
/**
 * @type {Document}
 */
export const doc = /** @type {Document} */ (typeof document !== 'undefined' ? document : {})

/**
 * @param {string} name
 * @return {HTMLElement}
 */
/* istanbul ignore next */
export const createElement = name => doc.createElement(name)

/**
 * @return {DocumentFragment}
 */
/* istanbul ignore next */
export const createDocumentFragment = () => doc.createDocumentFragment()

/**
 * @param {string} text
 * @return {Text}
 */
/* istanbul ignore next */
export const createTextNode = text => doc.createTextNode(text)

/* istanbul ignore next */
export const domParser = /** @type {DOMParser} */ (typeof DOMParser !== 'undefined' ? new DOMParser() : null)

/**
 * @param {HTMLElement} el
 * @param {string} name
 * @param {Object} opts
 */
/* istanbul ignore next */
export const emitCustomEvent = (el, name, opts) => el.dispatchEvent(new CustomEvent(name, opts))

/**
 * @param {Element} el
 * @param {Array<pair.Pair<string,string|boolean>>} attrs Array of key-value pairs
 * @return {Element}
 */
/* istanbul ignore next */
export const setAttributes = (el, attrs) => {
  pair.forEach(attrs, (key, value) => {
    if (value === false) {
      el.removeAttribute(key)
    } else if (value === true) {
      el.setAttribute(key, '')
    } else {
      // @ts-ignore
      el.setAttribute(key, value)
    }
  })
  return el
}

/**
 * @param {Element} el
 * @param {Map<string, string>} attrs Array of key-value pairs
 * @return {Element}
 */
/* istanbul ignore next */
export const setAttributesMap = (el, attrs) => {
  attrs.forEach((value, key) => { el.setAttribute(key, value) })
  return el
}

/**
 * @param {Array<Node>|HTMLCollection} children
 * @return {DocumentFragment}
 */
/* istanbul ignore next */
export const fragment = children => {
  const fragment = createDocumentFragment()
  for (let i = 0; i < children.length; i++) {
    appendChild(fragment, children[i])
  }
  return fragment
}

/**
 * @param {Element} parent
 * @param {Array<Node>} nodes
 * @return {Element}
 */
/* istanbul ignore next */
export const append = (parent, nodes) => {
  appendChild(parent, fragment(nodes))
  return parent
}

/**
 * @param {HTMLElement} el
 */
/* istanbul ignore next */
export const remove = el => el.remove()

/**
 * @param {EventTarget} el
 * @param {string} name
 * @param {EventListener} f
 */
/* istanbul ignore next */
export const addEventListener = (el, name, f) => el.addEventListener(name, f)

/**
 * @param {EventTarget} el
 * @param {string} name
 * @param {EventListener} f
 */
/* istanbul ignore next */
export const removeEventListener = (el, name, f) => el.removeEventListener(name, f)

/**
 * @param {Node} node
 * @param {Array<pair.Pair<string,EventListener>>} listeners
 * @return {Node}
 */
/* istanbul ignore next */
export const addEventListeners = (node, listeners) => {
  pair.forEach(listeners, (name, f) => addEventListener(node, name, f))
  return node
}

/**
 * @param {Node} node
 * @param {Array<pair.Pair<string,EventListener>>} listeners
 * @return {Node}
 */
/* istanbul ignore next */
export const removeEventListeners = (node, listeners) => {
  pair.forEach(listeners, (name, f) => removeEventListener(node, name, f))
  return node
}

/**
 * @param {string} name
 * @param {Array<pair.Pair<string,string>|pair.Pair<string,boolean>>} attrs Array of key-value pairs
 * @param {Array<Node>} children
 * @return {Element}
 */
/* istanbul ignore next */
export const element = (name, attrs = [], children = []) =>
  append(setAttributes(createElement(name), attrs), children)

/**
 * @param {number} width
 * @param {number} height
 */
/* istanbul ignore next */
export const canvas = (width, height) => {
  const c = /** @type {HTMLCanvasElement} */ (createElement('canvas'))
  c.height = height
  c.width = width
  return c
}

/**
 * @param {string} t
 * @return {Text}
 */
/* istanbul ignore next */
export const text = createTextNode

/**
 * @param {pair.Pair<string,string>} pair
 */
/* istanbul ignore next */
export const pairToStyleString = pair => `${pair.left}:${pair.right};`

/**
 * @param {Array<pair.Pair<string,string>>} pairs
 * @return {string}
 */
/* istanbul ignore next */
export const pairsToStyleString = pairs => pairs.map(pairToStyleString).join('')

/**
 * @param {Map<string,string>} m
 * @return {string}
 */
/* istanbul ignore next */
export const mapToStyleString = m => map.map(m, (value, key) => `${key}:${value};`).join('')

/**
 * @todo should always query on a dom element
 *
 * @param {HTMLElement|ShadowRoot} el
 * @param {string} query
 * @return {HTMLElement | null}
 */
/* istanbul ignore next */
export const querySelector = (el, query) => el.querySelector(query)

/**
 * @param {HTMLElement|ShadowRoot} el
 * @param {string} query
 * @return {NodeListOf<HTMLElement>}
 */
/* istanbul ignore next */
export const querySelectorAll = (el, query) => el.querySelectorAll(query)

/**
 * @param {string} id
 * @return {HTMLElement}
 */
/* istanbul ignore next */
export const getElementById = id => /** @type {HTMLElement} */ (doc.getElementById(id))

/**
 * @param {string} html
 * @return {HTMLElement}
 */
/* istanbul ignore next */
const _parse = html => domParser.parseFromString(`<html><body>${html}</body></html>`, 'text/html').body

/**
 * @param {string} html
 * @return {DocumentFragment}
 */
/* istanbul ignore next */
export const parseFragment = html => fragment(/** @type {any} */ (_parse(html).childNodes))

/**
 * @param {string} html
 * @return {HTMLElement}
 */
/* istanbul ignore next */
export const parseElement = html => /** @type HTMLElement */ (_parse(html).firstElementChild)

/**
 * @param {HTMLElement} oldEl
 * @param {HTMLElement|DocumentFragment} newEl
 */
/* istanbul ignore next */
export const replaceWith = (oldEl, newEl) => oldEl.replaceWith(newEl)

/**
 * @param {HTMLElement} parent
 * @param {HTMLElement} el
 * @param {Node|null} ref
 * @return {HTMLElement}
 */
/* istanbul ignore next */
export const insertBefore = (parent, el, ref) => parent.insertBefore(el, ref)

/**
 * @param {Node} parent
 * @param {Node} child
 * @return {Node}
 */
/* istanbul ignore next */
export const appendChild = (parent, child) => parent.appendChild(child)

export const ELEMENT_NODE = doc.ELEMENT_NODE
export const TEXT_NODE = doc.TEXT_NODE
export const CDATA_SECTION_NODE = doc.CDATA_SECTION_NODE
export const COMMENT_NODE = doc.COMMENT_NODE
export const DOCUMENT_NODE = doc.DOCUMENT_NODE
export const DOCUMENT_TYPE_NODE = doc.DOCUMENT_TYPE_NODE
export const DOCUMENT_FRAGMENT_NODE = doc.DOCUMENT_FRAGMENT_NODE

/**
 * @param {any} node
 * @param {number} type
 */
export const checkNodeType = (node, type) => node.nodeType === type

/**
 * @param {Node} parent
 * @param {HTMLElement} child
 */
export const isParentOf = (parent, child) => {
  let p = child.parentNode
  while (p && p !== parent) {
    p = p.parentNode
  }
  return p === parent
}
