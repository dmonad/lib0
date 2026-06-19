import * as t from '../../testing.js'
import * as delta from '../delta.js'
import { as } from './node.js'
import { project } from './project.js'
import { attr } from './attr.js'
import { children } from './children.js'
import { pipe } from './pipe.js'

// compare deltas through an `any` boundary (the transform result is `DeltaBuilder<any>`)
const cmp = (/** @type {any} */ a, /** @type {any} */ b) => t.compare(a, b)

export const testAsRename = () => {
  const it = as('ul').init(delta.$deltaAny)
  const res = it.applyA(delta.create('list').insert(['a']))
  cmp(res.b, delta.create('ul').insert(['a']))
  // reverse restores the source name
  const back = it.applyB(delta.create('ul').insert(['b']))
  cmp(back.a, delta.create('list').insert(['b']))
}

export const testRenderList = () => {
  // render a collection of users as <ul><li>name</li>...</ul>; each row-project lifts its own value,
  // so no downstream resolver is needed
  const rowSpec = delta.create('li').insert([attr('name')])
  const list = pipe(children(() => project(rowSpec)), as('ul'))
  const it = list.init(delta.$deltaAny)
  const res = it.applyA(delta.create('users').insert([
    delta.create('user').setAttr('name', 'Erika'),
    delta.create('user').setAttr('name', 'Max')
  ]))
  cmp(res.b, delta.create('ul').insert([
    delta.create('li').insert(['Erika']),
    delta.create('li').insert(['Max'])
  ]))
}

export const testRenderListReverse = () => {
  // an editable binding uses an attribute hole (attrs round-trip); a view edit of a row's attribute
  // routes back through children -> the row's project -> the bound data attribute
  const rowSpec = delta.create('li').setAttr('label', attr('name'))
  const list = pipe(children(() => project(rowSpec)), as('ul'))
  const it = list.init(delta.$deltaAny)
  it.applyA(delta.create('users').insert([
    delta.create('user').setAttr('name', 'Erika'),
    delta.create('user').setAttr('name', 'Max')
  ]))
  const res = it.applyB(/** @type {any} */ (delta.create().modify(delta.create().setAttr('label', 'Eve'))))
  cmp(res.a, delta.create('users').modify(delta.create().setAttr('name', 'Eve')))
}
