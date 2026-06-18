import * as delta from 'lib0/delta'
import * as dt from 'lib0/delta/transformer'
import * as rdt from 'lib0/delta/rdt'
import * as rdtDelta from 'lib0/delta/rdt/delta'
import * as rdtDom from 'lib0/delta/rdt/dom'

console.log(delta.create().toJSON())
console.log(rdt.bind, rdtDelta.deltaRDT, rdtDom.domRDT, rdtDom.$domDelta, dt.Transformer, dt.pipe)
