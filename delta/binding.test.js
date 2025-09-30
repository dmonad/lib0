import * as t from '../testing.js'
import * as Λ from './transformer.js'
import * as Δ from './index.js'
import * as binding from './binding.js'
import * as env from '../environment.js'
import * as dom from '../dom.js'
import * as $ from '../schema.js'

export const testBinding = () => {
  if (!env.isBrowser) t.skip()
  const el = dom.element('div')
  const domRDT = binding.domRDT(el)
  const $deltaRDT = Δ.$node($.$literal('test'), $.$object({ x: $.$boolean }), $.$any)
  const deltaRDT = binding.deltaRDT($deltaRDT)
  const template = Λ.node('div', { height: Λ.query('x')($deltaRDT) }, [])
  const b = binding.bind(deltaRDT, domRDT, template)
  deltaRDT.update(Δ.node('test'))
  deltaRDT.update(Δ.node('test', { x: true }, 'hi there'))
  console.log(b)
  console.log('dom html content:', domRDT.observedNode.outerHTML)
  console.log('delta rdt content:', deltaRDT.state?.toJSON())
  console.log('delta rdt content:', deltaRDT.state)
}

export const testDomBindingBasics = () => {
  if (!env.isBrowser) t.skip()
  const el = dom.element('div')
  const domRDT = binding.domRDT(el)
  const $deltaRDT = Δ.$node($.$literal('test'), $.$object({ x: $.$boolean }), $.$any)
  const deltaRDT = binding.deltaRDT($deltaRDT)
  const template = Λ.node('div', { height: Λ.query('x')($deltaRDT) }, [])
  const b = binding.bind(deltaRDT, domRDT, template)
  deltaRDT.update(Δ.node('test'))
  deltaRDT.update(Δ.node('test', { x: true }, 'hi there'))
  console.log(b)
  console.log('dom html content:', domRDT.observedNode.outerHTML)
  console.log('delta rdt content:', deltaRDT.state?.toJSON())
  console.log('delta rdt content:', deltaRDT.state)
}
