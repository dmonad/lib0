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
  const $deltaRDT = Δ.$node($.$literal('test'), $.$object({ x: $.$string, y: $.$string }), $.$any, { withText: true })
  const deltaRDT = binding.deltaRDT($deltaRDT)
  const template = Λ.node('div', { height: Λ.query('x')($deltaRDT) }, [])
  const b = binding.bind(deltaRDT, domRDT, template)
  deltaRDT.update(Δ.node('test'))
  deltaRDT.update(Δ.node('test', { x: 'some val' }, 'hi there'))
  console.log(b)
  console.log('dom html content:', domRDT.observedNode.outerHTML)
  console.log('delta rdt content:', deltaRDT.state?.toJSON())
  console.log('delta rdt content:', deltaRDT.state)
}

export const testDomBindingBasics = () => {
  if (!env.isBrowser) t.skip()
  const el = dom.element('div')
  const domRDT = binding.domRDT(el)
  const $deltaRDT = Δ.$node($.$literal('test'), $.$object({ x: $.$string }), $.$any, { withText: true })
  const deltaRDT = binding.deltaRDT($deltaRDT)
  const template = Λ.node('div', { height: Λ.query('x')($deltaRDT) }, [])
  const b = binding.bind(deltaRDT, domRDT, template)
  deltaRDT.update(Δ.node('test'))
  deltaRDT.update(Δ.node('test', { x: 'xval' }, 'hi there'))
  console.log(b)
  console.log('dom html content:', domRDT.observedNode.outerHTML)
  console.log('delta rdt content:', deltaRDT.state?.toJSON())
  console.log('delta rdt content:', deltaRDT.state)
}

export const testDomBindingBackAndForth = () => {
  if (!env.isBrowser) t.skip()
  const $deltaRDT = binding.$domDelta
  const el1 = dom.element('div')
  const domRDT1 = binding.domRDT(el1)
  const el2 = dom.element('div')
  const domRDT2 = binding.domRDT(el2)
  const deltaRDT1 = binding.deltaRDT($deltaRDT)
  const deltaRDT2 = binding.deltaRDT($deltaRDT)
  binding.bind(deltaRDT1, domRDT1, Λ.id($deltaRDT))
  binding.bind(domRDT1, deltaRDT2, Λ.id($deltaRDT))
  binding.bind(deltaRDT2, domRDT2, Λ.id($deltaRDT))

  /**
   * @param {string} description
   * @param {() => void} f
   */
  const test = (description, f) =>
    t.group(description, () => {
      f()
      t.compare(el1.outerHTML, el2.outerHTML, 'dom nodes match')
      t.compare(deltaRDT1.state, deltaRDT2.state, 'generated deltas match')
    })
  test('insert paragraph', () => {
    deltaRDT1.update(Δ.node('div', { id: '43' }, [Δ.node('p', {}, 'text')]))
  })
  test('modify paragraph attr & paragraph content', () => {
    deltaRDT1.update(Δ.node('div', { id: '42' }, Δ.array(binding.$domDelta).modify(Δ.node('p', {}, 'new text & old '))))
  })
  console.log('el1', el1.outerHTML)
  console.log('el2', el2.outerHTML)
  console.log('d1', deltaRDT1.state?.toJSON())
  console.log('d2', deltaRDT2.state?.toJSON())
}

export const testDataToDom = () => {
  if (!env.isBrowser) t.skip()
  const $data = Δ.$node($.$literal('data'), $.$object({ version: $.$number, description: $.$string }), $.$any, { withText: true })
  const Λdata = Λ.transform($data, $d => Λ.node('h1', Λ.map({ bold: 'true', content: Λ.query('description')($d) }), []))
  const dataRDT = binding.deltaRDT($data)
  const domRDT = binding.domRDT(dom.element('div'))
  binding.bind(dataRDT, domRDT, Λdata($data))
  dataRDT.update(Δ.node('data', { version: 42, description: 'good description' }))
  console.log('el1', domRDT.observedNode.outerHTML)
  console.log('d1', dataRDT.state?.toJSON())
  domRDT.update(Δ.node('h1', { content: 'new description' }))
  console.log('el1', domRDT.observedNode.outerHTML)
  console.log('d1', dataRDT.state?.toJSON())
  t.compare(
    dataRDT.state,
    Δ.node('data', { version: 42, description: 'new description' })
  )
}
