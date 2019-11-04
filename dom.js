/* istanbul ignore file */
import * as pair from './pair.js'
import * as map from './map.js'

export const doc = document
const createElement = doc.createElement.bind(doc)
const createDocumentFragment = doc.createDocumentFragment.bind(doc)
const createTextNode = doc.createTextNode.bind(doc)

/**
 * @param {Element} el
 * @param {Array<pair.Pair<string,string|boolean>>} attrs Array of key-value pairs
 * @return {Element}
 */
export const setAttributes = (el, attrs) => {
  pair.forEach(attrs, (key, value) => {
    if (value === false) {
      el.removeAttribute(key)
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
export const setAttributesMap = (el, attrs) => {
  map.map(attrs, (value, key) => el.setAttribute(key, value))
  return el
}

/**
 * @param {Array<Node>} children
 * @return {DocumentFragment}
 */
export const fragment = children => {
  const fragment = createDocumentFragment()
  children.forEach(fragment.appendChild.bind(fragment))
  return fragment
}

/**
 * @param {Element} parent
 * @param {Array<Node>} nodes
 * @return {Element}
 */
export const append = (parent, nodes) => {
  parent.appendChild(fragment(nodes))
  return parent
}

/**
 * @param {EventTarget} el
 * @param {string} name
 * @param {EventListener} f
 */
export const addEventListener = (el, name, f) => el.addEventListener(name, f)

/**
 * @param {EventTarget} el
 * @param {string} name
 * @param {EventListener} f
 */
export const removeEventListener = (el, name, f) => el.removeEventListener(name, f)

/**
 * @param {Node} node
 * @param {Array<pair.Pair<string,EventListener>>} listeners
 * @return {Node}
 */
export const addEventListeners = (node, listeners) => {
  pair.forEach(listeners, (name, f) => addEventListener(node, name, f))
  return node
}

/**
 * @param {Node} node
 * @param {Array<pair.Pair<string,EventListener>>} listeners
 * @return {Node}
 */
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
export const element = (name, attrs = [], children = []) =>
  append(setAttributes(createElement(name), attrs), children)

/**
 * @param {number} width
 * @param {number} height
 */
export const canvas = (width, height) => {
  const c = createElement('canvas')
  c.height = height
  c.width = width
  return c
}

/**
 * @param {string} t
 * @return {Text}
 */
export const text = createTextNode

/**
 * @param {pair.Pair<string,string>} pair
 */
export const pairToStyleString = pair => `${pair.left}:${pair.right};`

/**
 * @param {Array<pair.Pair<string,string>>} pairs
 * @return {string}
 */
export const pairsToStyleString = pairs => pairs.map(pairToStyleString).join('')

/**
 * @param {Map<string,string>} m
 * @return {string}
 */
export const mapToStyleString = m => map.map(m, (value, key) => `${key}:${value};`).join('')

/**
 * @todo should always query on a dom element
 *
 * @param {Element} el
 * @param {string} query
 * @return {Element | null}
 */
export const querySelector = (el, query) => el.querySelector(query)

/**
 * @param {Element} el
 * @param {string} query
 * @return {NodeListOf<Element>}
 */
export const querySelectorAll = (el, query) => el.querySelectorAll(query)

/**
 * @param {string} id
 * @return {Element}
 */
export const getElementById = doc.getElementById.bind(doc)
