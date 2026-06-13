import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { deltaRDT } from './delta.js'

// ---------------------------------------------------------------------------
// DeltaRDT
//
// NOTE: these tests are LLM-generated and need review. They aim for full
// coverage of ./delta.js (the in-memory delta RDT).
// ---------------------------------------------------------------------------

export const testDeltaRDTBasics = () => {
  const $d = delta.$delta({ name: 'test', attrs: { x: s.$string }, text: true })
  const rdt = deltaRDT($d)
  /** @type {Array<delta.DeltaAny>} */
  const changes = []
  rdt.on('delta', d => changes.push(d))
  // an empty update is a no-op (no state, no 'delta')
  rdt.applyDelta(delta.create('test'))
  t.assert(rdt.state === null)
  t.assert(changes.length === 0)
  // a non-empty update is accumulated into `state` and re-emitted as a delta
  rdt.applyDelta(delta.create('test', { x: 'v1' }, 'hi'))
  t.assert(changes.length === 1)
  t.compare(rdt.state, delta.create('test', { x: 'v1' }, 'hi'))
  // a second update is merged on top of the existing state
  rdt.applyDelta(delta.create('test', { x: 'v2' }))
  t.assert(changes.length === 2)
  t.compare(rdt.state, delta.create('test', { x: 'v2' }, 'hi'))
}

export const testDeltaRDTDestroy = () => {
  const $d = delta.$delta({ attrs: { x: s.$string } })
  const rdt = deltaRDT($d)
  let destroyed = null
  rdt.on('destroy', r => { destroyed = r })
  rdt.destroy()
  t.assert(destroyed === rdt, "'destroy' event fired with the RDT")
}
