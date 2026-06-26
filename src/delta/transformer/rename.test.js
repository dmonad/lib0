import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as s from '../../schema.js'
import { rename } from './rename.js'
import { project } from './project.js'
import { attr } from './attr.js'
import { children } from './children.js'
import { pipe } from './pipe.js'

// reason: the pipe-composition tests below compare a result whose conf is the pipe's inferred
// end-to-end type, which t.compare's single type parameter can't unify with an independently
// hand-built expected delta - widen both sides to any. (testRenameNode needs no bridge: rename's
// output conf is precise, so it compares directly.)
const cmp = (/** @type {any} */ a, /** @type {any} */ b) => t.compare(a, b)

export const testRenameNode = () => {
  const it = rename(delta.$delta('list', { children: s.$string }), 'ul').init()
  const res = it.applyA(delta.create('list').insert(['a']))
  t.compare(res.b, delta.create('ul').insert(['a']))
  // reverse restores the source name
  const back = it.applyB(delta.create('ul').insert(['b']))
  t.compare(back.a, delta.create('list').insert(['b']))
}

export const testRenderList = () => {
  // render a collection of users as <ul><li>name</li>...</ul>; each row-project lifts its own value,
  // so no downstream resolver is needed
  const it = pipe(
    delta.$delta('users', { children: delta.$delta('user', { attrs: { name: s.$string } }) }),
    $d => children($d, (_c, $c) => project($c, delta.create('li').insert([attr($c, 'name')]))),
    $d => rename($d, 'ul')
  ).init()
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
  const it = pipe(
    delta.$delta('users', { children: delta.$delta('user', { attrs: { name: s.$string } }) }),
    $d => children($d, (_c, $c) => project($c, delta.create('li').setAttr('label', attr($c, 'name')))),
    $d => rename($d, 'ul')
  ).init()
  it.applyA(delta.create('users').insert([
    delta.create('user').setAttr('name', 'Erika'),
    delta.create('user').setAttr('name', 'Max')
  ]))
  // reason: applyB expects the pipe's output document type, but this is a view-side modify *change*
  // (and intentionally exercises drift routing back through the pipe); cast the change to any.
  const res = it.applyB(/** @type {any} */ (delta.create().modify(delta.create().setAttr('label', 'Eve'))))
  cmp(res.a, delta.create('users').modify(delta.create().setAttr('name', 'Eve')))
}
