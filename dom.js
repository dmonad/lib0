/* istanbul ignore file */
import * as pair from './pair.js'
import * as map from './map.js'

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
  const fragment = document.createDocumentFragment()
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

export const addEventListener = (el, name, f) => el.addEventListener(name, f)
export const removeEventListener = (el, name, f) => el.removeEventListener(name, f)

/**
 * @param {Node} node
 * @param {Array<pair.Pair<string,function>>} listeners
 * @return {Node}
 */
export const addEventListeners = (node, listeners) => {
  pair.forEach(listeners, (name, f) => addEventListener(node, name, f))
  return node
}

/**
 * @param {Node} node
 * @param {Array<pair.Pair<string,function>>} listeners
 * @return {Node}
 */
export const removeEventListeners = (node, listeners) => {
  pair.forEach(listeners, (name, f) => removeEventListener(node, name, f))
  return node
}

/**
 * @param {string} name
 * @param {Array<pair.Pair<string,string>>} attrs Array of key-value pairs
 * @param {Array<Node>} children
 * @return {Element}
 */
export const element = (name, attrs = [], children = []) =>
  append(setAttributes(document.createElement(name), attrs), children)

/**
 * @param {number} width
 * @param {number} height
 */
export const canvas = (width, height) => {
  const c = document.createElement('canvas')
  c.height = height
  c.width = width
  return c
}

export const text = t => document.createTextNode(t)

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
