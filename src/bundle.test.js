import * as delta from 'lib0/delta'
import * as dt from 'lib0/delta/transformer'
import * as binding from 'lib0/delta/binding'
import * as rdtDelta from 'lib0/delta/rdt/delta'
import * as rdtDom from 'lib0/delta/rdt/dom'

console.log(delta.create().toJSON())
console.log(binding.bind, rdtDelta.deltaRDT, rdtDom.domRDT, rdtDom.$domDelta, dt.Transformer, dt.pipe)
