import * as t from '../testing.js'
import * as Λ from './transformer.js'
import * as Δ from './index.js'
import * as $ from '../schema.js'
import * as binding from './binding.js'
import * as env from '../environment.js'
import * as dom from '../dom.js'

export const testBinding = () => {
  if (!env.isBrowser) t.skip()
  const el = dom.element('div')
  const domRDT = binding.domRDT(el)
  const deltaRDT = binding.deltaRDT(Δ.$nodeAny)
  const template = Λ.node('div', { height: '42' }, [])
  const b = binding.bind(deltaRDT, domRDT, template)
  deltaRDT.update(Δ.node('test').done())
  deltaRDT.update(Δ.node('test', Δ.map().set('x', true)).done())
  console.log(b)
  console.log('dom html content:', domRDT.observedNode.outerHTML)
  console.log('delta rdt content:', deltaRDT.state?.toJSON())
}
