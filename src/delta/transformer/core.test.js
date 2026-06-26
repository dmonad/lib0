import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { $template, $transformer, transform } from './core.js'
import { attr } from './attr.js'
import { renameAttrs } from './rename-attrs.js'
import { pipe } from './pipe.js'
import { id } from './id.js'

export const testTemplateSchema = () => {
  // templates are recognized by their `isTemplate` symbol
  t.assert($template.check(attr(delta.$delta({ attrs: { name: s.$string } }), 'name')))
  t.assert($template.check(pipe(delta.$delta({ attrs: { a: s.$string, b: s.$string } }), $d1 => attr($d1, 'a'), $d2 => attr($d2, 'b'))))
  // non-templates are rejected (no false-positive on arbitrary objects with an `init`, unlike the
  // old duck-typed check)
  t.assert(!$template.check({ init: () => {} }))
  t.assert(!$template.check(delta.create()))
  t.assert(!$template.check(null))
  t.assert(!$template.check(undefined))
}

export const testTransformerSchema = () => {
  // a transformer instance is recognized by its `isTransformer` symbol
  t.assert($transformer.check(attr(delta.$delta({ attrs: { name: s.$string } }), 'name').init()))
  // a template is not itself a transformer, and vice versa - the two roles are independent
  t.assert(!$transformer.check(attr(delta.$delta({ attrs: { name: s.$string } }), 'name')))
  t.assert(!$template.check(attr(delta.$delta({ attrs: { name: s.$string } }), 'name').init()))
  t.assert(!$transformer.check(null))
}

export const testTransformHelper = () => {
  const $d = delta.$delta({ attrs: { a: s.$string } })
  // `transform` just binds `$d` into the `$d => Template` lambda - the result is the lambda's template
  const tmpl = transform($d, $d => renameAttrs($d, { a: 'b' }))
  t.assert($template.check(tmpl))
  // it is equivalent to calling the factory directly: same end-to-end transform behaviour
  t.compare(
    tmpl.init().applyA(delta.create().setAttr('a', 'x')).b,
    renameAttrs($d, { a: 'b' }).init().applyA(delta.create().setAttr('a', 'x')).b
  )
}

export const testEitherTemplateOrTransformer = () => {
  // every value is either a template or a transformer, never both. `id($d)` is a `RenameAttrs`
  // template; its `init` yields a separate, pure transformer (`RenameAttrs` stores it and returns it)
  const idTemplate = id(delta.$delta({}))
  t.assert($template.check(idTemplate) && !$transformer.check(idTemplate))
  const it = idTemplate.init()
  t.assert($transformer.check(it) && !$template.check(it))
}
