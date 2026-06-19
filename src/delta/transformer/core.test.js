import * as t from '../../testing.js'
import * as delta from '../delta.js'
import { $template, $transformer } from './core.js'
import { attr } from './attr.js'
import { pipe } from './pipe.js'
import { id } from './id.js'

export const testTemplateSchema = () => {
  // templates are recognized by their `isTemplate` symbol
  t.assert($template.check(attr('name')))
  t.assert($template.check(pipe(attr('a'), attr('b'))))
  // non-templates are rejected (no false-positive on arbitrary objects with an `init`, unlike the
  // old duck-typed check)
  t.assert(!$template.check({ init: () => {} }))
  t.assert(!$template.check(delta.create()))
  t.assert(!$template.check(null))
  t.assert(!$template.check(undefined))
}

export const testTransformerSchema = () => {
  // a transformer instance is recognized by its `isTransformer` symbol
  t.assert($transformer.check(attr('name').init(delta.$deltaAny)))
  // a template is not itself a transformer, and vice versa - the two roles are independent
  t.assert(!$transformer.check(attr('name')))
  t.assert(!$template.check(attr('name').init(delta.$deltaAny)))
  t.assert(!$transformer.check(null))
}

export const testEitherTemplateOrTransformer = () => {
  // every value is either a template or a transformer, never both. `id` is a `RenameAttrs` template;
  // its `init` yields a separate, pure transformer (`RenameAttrs` stores it and returns it)
  t.assert($template.check(id) && !$transformer.check(id))
  const it = id.init(delta.$deltaAny)
  t.assert($transformer.check(it) && !$template.check(it))
}
