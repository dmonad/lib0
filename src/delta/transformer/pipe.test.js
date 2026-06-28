import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { transformerWith, $tresult } from '../transformer.js'
import { renameAttrs } from './rename-attrs.js'
import { conform } from './conform.js'
import { pipe } from './pipe.js'

export const testPipeBasics = () => {
  const $d3 = delta.$delta({ children: 42, attrs: { a: s.$string } })
  // pipe(conform, renameAttrs): conform keeps attr `a`, renameAttrs maps `a` -> `b`. Each stage is a
  // factory receiving the previous stage's output schema; the end-to-end output type is inferred.
  const i31 = pipe($d3,
    $d => conform($d, delta.$delta({ attrs: { a: [s.$number, s.$string] } })),
    $d => renameAttrs($d, { a: 'b' })
  ).init()
  t.assert(transformerWith($d3, delta.$delta({ attrs: { b: [s.$number, s.$string] } })).validate(i31))
  // a rename round-trip pipe drives PipeTransformer.apply back and forth (a->b->a->b->a->b => a->b)
  const $da = delta.$delta({ attrs: { a: s.$string } })
  const $db = delta.$delta({ attrs: { b: s.$string } })
  const p12init = pipe($da,
    $d => renameAttrs($d, { a: 'b' }),
    $d => renameAttrs($d, { b: 'a' }),
    $d => renameAttrs($d, { a: 'b' }),
    $d => renameAttrs($d, { b: 'a' }),
    $d => renameAttrs($d, { a: 'b' })
  ).init()
  t.assert(transformerWith($da, $db).validate(p12init))
  const dtrn = p12init.applyA(delta.create().setAttr('a', 'dturiane'))
  t.assert($tresult($da, $db).validate(dtrn))
  // config-only (template) form: `pipe($d, ...)` returns a reusable Pipe template
  const ptpl = pipe($da,
    $d => renameAttrs($d, { a: 'b' }),
    $d => renameAttrs($d, { b: 'c' })
  ).init()
  t.compare(ptpl.applyA(delta.create().setAttr('a', 'x')).b, delta.create().setAttr('c', 'x'))
}
