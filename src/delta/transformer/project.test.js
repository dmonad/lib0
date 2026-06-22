import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as position from '../position.js'
import { project } from './project.js'
import { attr } from './attr.js'

// compare deltas: the transform result is `DeltaBuilder<any>`, so compare against a precisely-typed
// expected delta through an `any` boundary to avoid spurious conf-variance type errors.
const cmp = (/** @type {any} */ a, /** @type {any} */ b) => t.compare(a, b)

export const testProjectStatic = () => {
  const it = project(delta.create('h1').setAttr('class', 'title').insert('Hello')).init(delta.$deltaAny)
  const res = it.applyA(delta.create())
  t.assert(res.a === null)
  cmp(res.b, delta.create('h1').setAttr('class', 'title').insert('Hello'))
}

export const testProjectAttrHole = () => {
  const it = project(delta.create('h1').setAttr('class', attr('cls'))).init(delta.$deltaAny)
  // attr hole is unwrapped here (attrs are keyed): output attr is the scalar value
  const res = it.applyA(delta.create().setAttr('cls', 'big'))
  cmp(res.b, delta.create('h1').setAttr('class', 'big'))
}

export const testProjectChildHole = () => {
  const it = project(delta.create('p').insert([attr('text')])).init(delta.$deltaAny)
  // a child value hole is lifted to its bare scalar (1->1), no carrier node survives
  const res = it.applyA(delta.create().setAttr('text', 'hi'))
  cmp(res.b, delta.create('p').insert(['hi']))
}

export const testProjectUpdate = () => {
  const it = project(delta.create('p').insert([attr('text')])).init(delta.$deltaAny)
  it.applyA(delta.create().setAttr('text', 'hi')) // initial render
  // a value change replaces the scalar embed in place (a scalar has no modify channel)
  const res = it.applyA(delta.create().setAttr('text', 'bye'))
  cmp(res.b, delta.create().delete(1).insert(['bye']))
}

export const testProjectValueSlotHeal = () => {
  const it = project(delta.create('p').insert([attr('text')])).init(delta.$deltaAny)
  it.applyA(delta.create().setAttr('text', 'hi'))
  // a view edit of a value slot does not round-trip to data: the last scalar is self-healed back
  const res = it.applyB(delta.create().delete(1))
  t.assert(res.a === null)
  cmp(res.b, delta.create().insert(['hi']))
}

export const testProjectE2ERender = () => {
  // project self-resolves: a static text prefix and a bound child value, no downstream resolver
  const it = project(delta.create('p').insert('Name: ').insert([attr('name')])).init(delta.$deltaAny)
  const res = it.applyA(delta.create().setAttr('name', 'Erika'))
  cmp(res.b, delta.create('p').insert('Name: ').insert(['Erika']))
}

export const testProjectE2EUpdate = () => {
  const it = project(delta.create('p').insert('Name: ').insert([attr('name')])).init(delta.$deltaAny)
  it.applyA(delta.create().setAttr('name', 'Erika')) // initial render
  const res = it.applyA(delta.create().setAttr('name', 'Max')) // data update
  cmp(res.b, delta.create().retain(6).delete(1).insert(['Max']))
}

export const testProjectE2ESelfHeal = () => {
  const it = project(delta.create('p').insert('Name: ').insert([attr('name')])).init(delta.$deltaAny)
  it.applyA(delta.create().setAttr('name', 'Erika'))
  // view deletes the static prefix -> heals back to the view, no data change
  const res = it.applyB(/** @type {any} */ (delta.create().delete(6)))
  t.assert(res.a === null)
  cmp(res.b, delta.create().insert('Name: '))
}

export const testProjectSelfHeal = () => {
  const it = project(delta.create('p').insert('Hello')).init(delta.$deltaAny)
  it.applyA(delta.create()) // render <p>Hello</p>
  // a view edit deletes static content -> self-heal restores it, no data change
  const res = it.applyB(delta.create().delete(5))
  t.assert(res.a === null)
  cmp(res.b, delta.create().insert('Hello'))
}

export const testProjectSelfHealInsert = () => {
  const it = project(delta.create('p').insert('Hi')).init(delta.$deltaAny)
  it.applyA(delta.create())
  // a view inserts text into static content -> drift is reverted (deleted)
  const res = it.applyB(delta.create().retain(2).insert('X'))
  t.assert(res.a === null)
  cmp(res.b, delta.create().retain(2).delete(1))
}

export const testProjectSelfHealStaticNode = () => {
  const it = project(delta.create('div').insert([delta.create('span')])).init(delta.$deltaAny)
  it.applyA(delta.create()) // <div>[<span>]
  // a view modifies a static node -> the original node is restored
  const res = it.applyB(delta.create().modify(delta.create().insert('x')))
  t.assert(res.a === null)
  cmp(res.b, delta.create().delete(1).insert([delta.create('span')]))
}

export const testProjectReverseAttr = () => {
  const it = project(delta.create('input').setAttr('value', attr('text'))).init(delta.$deltaAny)
  it.applyA(delta.create().setAttr('text', 'hi')) // <input value='hi'>
  // a view edit of the projected attribute routes back to the bound data attribute
  const res = it.applyB(delta.create().setAttr('value', 'typed'))
  cmp(res.a, delta.create().setAttr('text', 'typed'))
}

export const testProjectStaticAttrHeal = () => {
  const it = project(delta.create('h1').setAttr('class', 'title')).init(delta.$deltaAny)
  it.applyA(delta.create()) // <h1 class='title'>
  // a view edit of a static attribute is self-healed back to the template value
  const res = it.applyB(delta.create().setAttr('class', 'hacked'))
  t.assert(res.a === null)
  cmp(res.b, delta.create().setAttr('class', 'title'))
}

export const testProjectReverseNodeInsert = () => {
  const it = project(delta.create('ul').insert([attr('x')])).init(delta.$deltaAny)
  it.applyA(delta.create().setAttr('x', 'v'))
  // a view inserts a node into the fixed structure -> drift is reverted
  const res = it.applyB(delta.create().retain(1).insert([delta.create('li')]))
  t.assert(res.a === null)
  cmp(res.b, delta.create().retain(1).delete(1))
}

export const testProjectIncrementalConsistency = () => {
  // an accumulated sequence of incremental updates must equal a fresh render of the final data
  const make = () => project(delta.create('p').insert('Name: ').insert([attr('name')])).init(delta.$deltaAny)
  const names = ['Erika', 'Max', 'A', 'Wolfgang', '', 'Zoé']
  const inc = make()
  const view = inc.applyA(delta.create().setAttr('name', names[0])).b
  for (let i = 1; i < names.length; i++) {
    const dv = inc.applyA(delta.create().setAttr('name', names[i])).b
    if (dv != null) view?.apply(dv)
    cmp(view, make().applyA(delta.create().setAttr('name', names[i])).b)
  }
}

export const testProjectAttrDelete = () => {
  const it = project(delta.create('h1').setAttr('class', attr('cls'))).init(delta.$deltaAny)
  it.applyA(delta.create().setAttr('cls', 'big')) // render with class='big'
  // the data attribute is deleted -> the projected attribute is deleted too
  const res = it.applyA(delta.create().deleteAttr('cls'))
  cmp(res.b, delta.create().deleteAttr('class'))
}

export const testProjectNestedAutoWrap = () => {
  // a nested child delta containing a hole is auto-wrapped into a nested project (a node hole)
  const it = project(delta.create('div').insert([delta.create('p').insert([attr('text')])])).init(delta.$deltaAny)
  const res = it.applyA(delta.create().setAttr('text', 'hi'))
  cmp(res.b, delta.create('div').insert([delta.create('p').insert(['hi'])]))
  // an update routes through the nested project as a modify of the nested node
  const upd = it.applyA(delta.create().setAttr('text', 'bye'))
  cmp(upd.b, delta.create().modify(delta.create().delete(1).insert(['bye'])))
}

export const testProjectNestedAttrHole = () => {
  // the recursive contains-template scan must also detect a hole that is a nested node's attribute
  const it = project(delta.create('div').insert([delta.create('span').setAttr('class', attr('cls'))])).init(delta.$deltaAny)
  const res = it.applyA(delta.create().setAttr('cls', 'big'))
  cmp(res.b, delta.create('div').insert([delta.create('span').setAttr('class', 'big')]))
}

export const testProjectNestedDeep = () => {
  // recursion is built once at init, bounded by spec depth (>= 2 levels here)
  const it = project(delta.create('a').insert([delta.create('b').insert([delta.create('c').insert([attr('x')])])])).init(delta.$deltaAny)
  const res = it.applyA(delta.create().setAttr('x', 'v'))
  cmp(res.b, delta.create('a').insert([delta.create('b').insert([delta.create('c').insert(['v'])])]))
}

export const testProjectStaticSubtree = () => {
  // a nested subtree with NO hole stays a verbatim static embed (contains-template is false)
  const it = project(delta.create('div').insert([delta.create('span').insert('hi')])).init(delta.$deltaAny)
  const res = it.applyA(delta.create())
  cmp(res.b, delta.create('div').insert([delta.create('span').insert('hi')]))
  // a view modify of the static subtree self-heals (it was not wrapped into a routing nested project)
  const heal = it.applyB(delta.create().modify(delta.create().insert('x')))
  t.assert(heal.a === null)
  cmp(heal.b, delta.create().delete(1).insert([delta.create('span').insert('hi')]))
}

export const testProjectValueUndefined = () => {
  // an absent bound child value renders as a `null` placeholder (never insert([undefined]))
  const it = project(delta.create('p').insert([attr('name')])).init(delta.$deltaAny)
  const res = it.applyA(delta.create())
  cmp(res.b, delta.create('p').insert([null]))
  // updating to a value replaces the placeholder
  const upd = it.applyA(delta.create().setAttr('name', 'x'))
  cmp(upd.b, delta.create().delete(1).insert(['x']))
}

export const testProjectNestedReverse = () => {
  // a view edit of an attribute inside an auto-wrapped nested node routes back to the bound data
  const it = project(delta.create('form').insert([delta.create('input').setAttr('value', attr('text'))])).init(delta.$deltaAny)
  it.applyA(delta.create().setAttr('text', 'hi')) // <form>[<input value='hi'>]
  const res = it.applyB(delta.create().modify(delta.create().setAttr('value', 'typed')))
  cmp(res.a, delta.create().setAttr('text', 'typed'))
}

// ---------------------------------------------------------------------------
// Cursor marks through `project` (Slice 3, part 2)
//
// Each hole receives the whole data delta, so a data mark a hole's sub-transformer carries reaches its
// output. Node holes embed that output as a distinct subtree, so the same id can DUPLICATE across node
// holes. Value/attr holes lift a bare scalar (no mark channel), so the cursor is placed once as an
// output root mark at the slot - last-wins on a same-id collision (Marks is id-keyed per node). Marks
// are read from settled state via `marksToPositions`.
// ---------------------------------------------------------------------------

/**
 * @param {any} d
 * @return {Array<position.MarkPos>}
 */
const pmp = d => position.marksToPositions(d).sort((a, b) => a.path.join() < b.path.join() ? -1 : 1)

/**
 * @param {any} change
 */
const psettle = change => {
  const s = delta.create(change.name)
  s.apply(change, { final: true })
  return s
}

export const testProjectMarkValueAndAttrHole = () => {
  // a mark on data attr 'name' anchors at the output attr hole 'title'; a mark on data attr 'x' anchors
  // at the value child hole's position
  const spec = delta.create('view').setAttr('title', attr('name')).insert([attr('x')])
  const it = project(spec).init(delta.$deltaAny)
  const d = delta.create('data', { name: 'Bob', x: 5 })
  d.addMark(position.pos('name'), 'N')
  d.addMark(position.pos('x'), 'X')
  const s = psettle(it.applyA(d).b)
  t.compare(pmp(s), [{ id: 'X', path: [0], assoc: 1 }, { id: 'N', path: ['title'], assoc: 1 }])
}

export const testProjectMarkNodeHoleDuplicates = () => {
  // the same data mark feeds two nested-project node holes -> it DUPLICATES, once nested under each
  const spec = delta.create('view').insert([
    delta.create('row').setAttr('t', attr('name')),
    delta.create('row2').setAttr('t', attr('name'))
  ])
  const it = project(spec).init(delta.$deltaAny)
  const d = delta.create('data', { name: 'Bob' })
  d.addMark(position.pos('name'), 'D')
  const s = psettle(it.applyA(d).b)
  t.compare(pmp(s), [{ id: 'D', path: [0, 't'], assoc: 1 }, { id: 'D', path: [1, 't'], assoc: 1 }])
}

export const testProjectMarkValueHoleLastWins = () => {
  // two value child holes bound to the same data attr/mark: the id can exist once per output node, so
  // the last slot wins (true duplication is impossible for same-node positions)
  const spec = delta.create('view').insert([attr('x')]).insert('-').insert([attr('x')])
  const it = project(spec).init(delta.$deltaAny)
  const d = delta.create('data', { x: 7 })
  d.addMark(position.pos('x'), 'W')
  const s = psettle(it.applyA(d).b)
  t.compare(pmp(s), [{ id: 'W', path: [2], assoc: 1 }])
}

export const testProjectMarkOnlyUpdateKeepsScalar = () => {
  // an incremental mark-only data change must move the cursor WITHOUT wiping the projected scalar/attr
  const spec = delta.create('view').setAttr('title', attr('name')).insert([attr('x')])
  const it = project(spec).init(delta.$deltaAny)
  const base = psettle(it.applyA(delta.create('data', { name: 'Bob', x: 5 })).b)
  const mc = delta.create(); mc.addMark(position.pos('x'), 'C')
  base.apply(/** @type {any} */ (it.applyA(mc).b), { final: true })
  cmp(base, delta.create('view').setAttr('title', 'Bob').insert([5])) // content unchanged (marks excluded from equality)
  t.compare(pmp(base), [{ id: 'C', path: [0], assoc: 1 }])
  // a real value update still works after
  base.apply(/** @type {any} */ (it.applyA(delta.create().setAttr('x', 9)).b), { final: true })
  cmp(base, delta.create('view').setAttr('title', 'Bob').insert([9]))
}

export const testProjectMarkDeleteRides = () => {
  const spec = delta.create('view').setAttr('title', attr('name'))
  const it = project(spec).init(delta.$deltaAny)
  it.applyA(delta.create('data', { name: 'Bob' }))
  const dc = delta.create(); dc.deleteMarks = ['M']
  t.compare(/** @type {any} */ (it.applyA(dc).b).deleteMarks, ['M'])
}
