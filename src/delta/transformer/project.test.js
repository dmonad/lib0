import * as t from '../../testing.js'
import * as delta from '../delta.js'
import * as position from '../position.js'
import { project } from './project.js'
import { attr } from './attr.js'
import { transform } from './core.js'
import * as s from '../../schema.js'

// Compare two deltas across the conf-variance boundary: a transform result `res.b` is a precisely-typed
// `DeltaBuilder<OUT>` while the expected delta is built independently, so widen both to the established
// `delta.DeltaBuilderAny` alias instead of fighting `t.compare`'s single type parameter.
/**
 * @param {delta.DeltaBuilderAny?} a
 * @param {delta.DeltaBuilderAny?} b
 */
const cmp = (a, b) => t.compare(a, b)

export const testProjectStatic = () => {
  const it = transform(delta.$delta({}), $d =>
    project($d, delta.create('h1').setAttr('class', 'title').insert('Hello'))
  ).init()
  const res = it.applyA(delta.create())
  t.assert(res.a === null)
  cmp(res.b, delta.create('h1').setAttr('class', 'title').insert('Hello'))
}

export const testProjectAttrHole = () => {
  const it = transform(delta.$delta({ attrs: { cls: s.$string } }), $d =>
    project($d, delta.create('h1').setAttr('class', attr($d, 'cls')))
  ).init()
  // attr hole is unwrapped here (attrs are keyed): output attr is the scalar value
  const res = it.applyA(delta.create().setAttr('cls', 'big'))
  cmp(res.b, delta.create('h1').setAttr('class', 'big'))
}

export const testProjectChildHole = () => {
  const it = transform(delta.$delta({ attrs: { text: s.$string } }), $d =>
    project($d, delta.create('p').insert([attr($d, 'text')]))
  ).init()
  // a child value hole is lifted to its bare scalar (1->1), no carrier node survives
  const res = it.applyA(delta.create().setAttr('text', 'hi'))
  cmp(res.b, delta.create('p').insert(['hi']))
}

export const testProjectUpdate = () => {
  const it = transform(delta.$delta({ attrs: { text: s.$string, other: s.$number } }), $d =>
    project($d, delta.create('p').insert([attr($d, 'text')]))
  ).init()
  it.applyA(delta.create().setAttr('text', 'hi')) // initial render
  // a value change replaces the scalar embed in place (a scalar has no modify channel)
  const res = it.applyA(delta.create().setAttr('text', 'bye'))
  cmp(res.b, delta.create().delete(1).insert(['bye']))
}

export const testProjectValueSlotHeal = () => {
  const it = transform(delta.$delta({ attrs: { text: s.$string } }), $d =>
    project($d, delta.create('p').insert([attr($d, 'text')]))
  ).init()
  it.applyA(delta.create().setAttr('text', 'hi'))
  // a view edit of a value slot does not round-trip to data: the last scalar is self-healed back
  const res = it.applyB(delta.create().delete(1))
  t.assert(res.a === null)
  cmp(res.b, delta.create().insert(['hi']))
}

export const testProjectE2ERender = () => {
  // project self-resolves: a static text prefix and a bound child value, no downstream resolver
  const it = transform(delta.$delta({ attrs: { name: s.$string } }), $d =>
    project($d, delta.create('p').insert('Name: ').insert([attr($d, 'name')]))
  ).init()
  const res = it.applyA(delta.create().setAttr('name', 'Erika'))
  cmp(res.b, delta.create('p').insert('Name: ').insert(['Erika']))
}

export const testProjectE2EUpdate = () => {
  const it = transform(delta.$delta({ attrs: { name: s.$string } }), $d =>
    project($d, delta.create('p').insert('Name: ').insert([attr($d, 'name')]))
  ).init()
  it.applyA(delta.create().setAttr('name', 'Erika')) // initial render
  const res = it.applyA(delta.create().setAttr('name', 'Max')) // data update
  cmp(res.b, delta.create().retain(6).delete(1).insert(['Max']))
}

export const testProjectE2ESelfHeal = () => {
  const it = transform(delta.$delta({ attrs: { name: s.$string } }), $d =>
    project($d, delta.create('p').insert('Name: ').insert([attr($d, 'name')]))
  ).init()
  it.applyA(delta.create().setAttr('name', 'Erika'))
  // view deletes the static prefix -> heals back to the view, no data change
  const res = it.applyB(delta.create().delete(6))
  t.assert(res.a === null)
  cmp(res.b, delta.create().insert('Name: '))
}

export const testProjectSelfHeal = () => {
  const it = transform(delta.$delta({}), $d =>
    project($d, delta.create('p').insert('Hello'))
  ).init()
  it.applyA(delta.create()) // render <p>Hello</p>
  // a view edit deletes static content -> self-heal restores it, no data change
  const res = it.applyB(delta.create().delete(5))
  t.assert(res.a === null)
  cmp(res.b, delta.create().insert('Hello'))
}

export const testProjectSelfHealInsert = () => {
  const it = transform(delta.$delta({}), $d =>
    project($d, delta.create('p').insert('Hi'))
  ).init()
  it.applyA(delta.create())
  // a view inserts text into static content -> drift is reverted (deleted)
  const res = it.applyB(delta.create().retain(2).insert('X'))
  t.assert(res.a === null)
  cmp(res.b, delta.create().retain(2).delete(1))
}

export const testProjectSelfHealStaticNode = () => {
  const it = transform(delta.$delta({}), $d =>
    project($d, delta.create('div').insert([delta.create('span')]))
  ).init()
  it.applyA(delta.create()) // <div>[<span>]
  // a view modifies a static node -> the original node is restored. The modify is intentionally
  // invalid drift (a content-less <span> admits no valid modify), so the input is cast to test that
  // such invalid edits are reverted.
  const res = it.applyB(/** @type {any} */ (delta.create().modify(delta.create().insert('x'))))
  t.assert(res.a === null)
  cmp(res.b, delta.create().delete(1).insert([delta.create('span')]))
}

export const testProjectReverseAttr = () => {
  const it = transform(delta.$delta({ attrs: { text: s.$string } }), $d =>
    project($d, delta.create('input').setAttr('value', attr($d, 'text')))
  ).init()
  it.applyA(delta.create().setAttr('text', 'hi')) // <input value='hi'>
  // a view edit of the projected attribute routes back to the bound data attribute
  const res = it.applyB(delta.create().setAttr('value', 'typed'))
  cmp(res.a, delta.create().setAttr('text', 'typed'))
}

export const testProjectStaticAttrHeal = () => {
  const it = transform(delta.$delta({}), $d =>
    project($d, delta.create('h1').setAttr('class', 'title'))
  ).init()
  it.applyA(delta.create()) // <h1 class='title'>
  // a view edit of a static attribute is self-healed back to the template value
  const res = it.applyB(delta.create().setAttr('class', 'hacked'))
  t.assert(res.a === null)
  cmp(res.b, delta.create().setAttr('class', 'title'))
}

export const testProjectReverseNodeInsert = () => {
  const it = transform(delta.$delta({ attrs: { x: s.$string } }), $d =>
    project($d, delta.create('ul').insert([attr($d, 'x')]))
  ).init()
  it.applyA(delta.create().setAttr('x', 'v'))
  // a view inserts a node into the fixed structure -> drift is reverted
  const res = it.applyB(delta.create().retain(1).insert(['err']))
  t.assert(res.a === null)
  cmp(res.b, delta.create().retain(1).delete(1))
}

export const testProjectIncrementalConsistency = () => {
  // an accumulated sequence of incremental updates must equal a fresh render of the final data
  const make = () => transform(delta.$delta({ attrs: { name: s.$string } }), $d =>
    project($d, delta.create('p').insert('Name: ').insert([attr($d, 'name')]))
  ).init()
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
  const it = transform(delta.$delta({ attrs: { cls: s.$string } }), $d =>
    project($d, delta.create('h1').setAttr('class', attr($d, 'cls')))
  ).init()
  it.applyA(delta.create().setAttr('cls', 'big')) // render with class='big'
  // the data attribute is deleted -> the projected attribute is deleted too
  const res = it.applyA(delta.create().deleteAttr('cls'))
  cmp(res.b, delta.create().deleteAttr('class'))
}

export const testProjectNestedAutoWrap = () => {
  // a nested child delta containing a hole is auto-wrapped into a nested project (a node hole)
  const it = transform(delta.$delta({ attrs: { text: s.$string } }), $d =>
    project($d, delta.create('div').insert([delta.create('p').insert([attr($d, 'text')])]))
  ).init()
  const res = it.applyA(delta.create().setAttr('text', 'hi'))
  cmp(res.b, delta.create('div').insert([delta.create('p').insert(['hi'])]))
  // an update routes through the nested project as a modify of the nested node
  const upd = it.applyA(delta.create().setAttr('text', 'bye'))
  cmp(upd.b, delta.create().modify(delta.create().delete(1).insert(['bye'])))
}

export const testProjectNestedAttrHole = () => {
  // the recursive contains-template scan must also detect a hole that is a nested node's attribute
  const it = transform(delta.$delta({ attrs: { cls: s.$string } }), $d =>
    project($d, delta.create('div').insert([delta.create('span').setAttr('class', attr($d, 'cls'))]))
  ).init()
  const res = it.applyA(delta.create().setAttr('cls', 'big'))
  cmp(res.b, delta.create('div').insert([delta.create('span').setAttr('class', 'big')]))
}

export const testProjectNestedDeep = () => {
  // recursion is built once at init, bounded by spec depth (>= 2 levels here)
  const it = transform(delta.$delta({ attrs: { x: s.$string } }), $d =>
    project($d, delta.create('a').insert([delta.create('b').insert([delta.create('c').insert([attr($d, 'x')])])]))
  ).init()
  const res = it.applyA(delta.create().setAttr('x', 'v'))
  cmp(res.b, delta.create('a').insert([delta.create('b').insert([delta.create('c').insert(['v'])])]))
}

export const testProjectStaticSubtree = () => {
  // a nested subtree with NO hole stays a verbatim static embed (contains-template is false)
  const it = transform(delta.$delta({}), $d =>
    project($d, delta.create('div').insert([delta.create('span').insert('hi')]))
  ).init()
  const res = it.applyA(delta.create())
  cmp(res.b, delta.create('div').insert([delta.create('span').insert('hi')]))
  // a view modify of the static subtree self-heals (it was not wrapped into a routing nested project)
  const heal = it.applyB(delta.create().modify(delta.create().insert('x')))
  t.assert(heal.a === null)
  cmp(heal.b, delta.create().delete(1).insert([delta.create('span').insert('hi')]))
}

export const testProjectValueUndefined = () => {
  // an absent bound child value renders as a `null` placeholder (never insert([undefined]))
  const it = transform(delta.$delta({ attrs: { name: s.$string } }), $d =>
    project($d, delta.create('p').insert([attr($d, 'name')]))
  ).init()
  const res = it.applyA(delta.create())
  cmp(res.b, delta.create('p').insert([null]))
  // updating to a value replaces the placeholder
  const upd = it.applyA(delta.create().setAttr('name', 'x'))
  cmp(upd.b, delta.create().delete(1).insert(['x']))
}

export const testProjectValueSlotDelete = () => {
  // deleting the data attr bound to a CHILD value slot resets it to the `null` placeholder, matching a
  // fresh render (the slot is display-only - the deletion has no data channel, only a view update)
  const make = () => transform(delta.$delta({ attrs: { name: s.$string } }), $d =>
    project($d, delta.create('p').insert('Name: ').insert([attr($d, 'name')]))
  ).init()
  const it = make()
  const view = it.applyA(delta.create().setAttr('name', 'Erika')).b // accumulated render with the value
  const res = it.applyA(delta.create().deleteAttr('name'))
  t.assert(res.a === null)
  // 'Name: ' is 6 static chars, then the value slot at offset 6 is reset to null
  cmp(res.b, delta.create().retain(6).delete(1).insert([null]))
  // the accumulated incremental view must equal a fresh render of the final (attr-absent) data
  res.b != null && view?.apply(res.b)
  cmp(view, make().applyA(delta.create()).b)
}

export const testProjectNestedReverse = () => {
  // a view edit of an attribute inside an auto-wrapped nested node routes back to the bound data
  const it = transform(delta.$delta({ attrs: { text: s.$string } }), $d =>
    project($d, delta.create('form').insert([delta.create('input').setAttr('value', attr($d, 'text'))]))
  ).init()
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
 * @template {delta.DeltaConf} C
 * @param {delta.DeltaBuilder<C>?} d
 * @return {delta.DeltaBuilder<C>}
 */
const psettle = d => {
  /** @type {delta.DeltaBuilderAny} */
  const settled = delta.create(d?.name ?? null)
  settled.apply(d, { final: true })
  return settled
}

export const testProjectMarkValueAndAttrHole = () => {
  // a mark on data attr 'name' anchors at the output attr hole 'title'; a mark on data attr 'x' anchors
  // at the value child hole's position
  const it = transform(delta.$delta({ attrs: { name: s.$string, x: s.$number } }), $d =>
    project($d, delta.create('view').setAttr('title', attr($d, 'name')).insert([attr($d, 'x')]))
  ).init()
  const d = delta.create().setAttrs({ name: 'Bob', x: 5 })
    .addMark(position.create(['name']), 'N')
    .addMark(position.create(['x']), 'X')
  const settled = psettle(it.applyA(d).b)
  t.compare(position.marksToPositions(settled), [{ id: 'X', path: [0], assoc: 1 }, { id: 'N', path: ['title'], assoc: 1 }])
}

export const testProjectMarkNodeHoleDuplicates = () => {
  // the same data mark feeds two nested-project node holes -> it DUPLICATES, once nested under each
  const it = transform(delta.$delta({ attrs: { name: s.$string } }), $d =>
    project($d, delta.create('view').insert([
      delta.create('row').setAttr('t', attr($d, 'name')),
      delta.create('row2').setAttr('t', attr($d, 'name'))
    ]))
  ).init()
  const d = delta.create().setAttr('name', 'Bob').addMark(position.create(['name']), 'D')
  const settled = psettle(it.applyA(d).b)
  t.compare(position.marksToPositions(settled), [{ id: 'D', path: [0, 't'], assoc: 1 }, { id: 'D', path: [1, 't'], assoc: 1 }])
}

export const testProjectMarkValueHoleLastWins = () => {
  // two value child holes bound to the same data attr/mark: the id can exist once per output node, so
  // the last slot wins (true duplication is impossible for same-node positions)
  const it = transform(delta.$delta({ attrs: { x: s.$number } }), $d =>
    project($d, delta.create('view').insert([attr($d, 'x')]).insert('-').insert([attr($d, 'x')]))
  ).init()
  const d = delta.create().setAttr('x', 7).addMark(position.create(['x']), 'W')
  const settled = psettle(it.applyA(d).b)
  t.compare(position.marksToPositions(settled), [{ id: 'W', path: [2], assoc: 1 }])
}

export const testProjectMarkOnlyUpdateKeepsScalar = () => {
  // an incremental mark-only data change must move the cursor WITHOUT wiping the projected scalar/attr
  const it = transform(delta.$delta({ attrs: { name: s.$string, x: s.$number } }), $d =>
    project($d, delta.create('view').setAttr('title', attr($d, 'name')).insert([attr($d, 'x')]))
  ).init()
  const base = psettle(it.applyA(delta.create().setAttrs({ name: 'Bob', x: 5 })).b)
  const mc = delta.create().addMark(position.create(['x']), 'C')
  base.apply(it.applyA(mc).b, { final: true })
  cmp(base, delta.create('view').setAttr('title', 'Bob').insert([5])) // content unchanged (marks excluded from equality)
  t.compare(position.marksToPositions(base), [{ id: 'C', path: [0], assoc: 1 }])
  // a real value update still works after
  base.apply(it.applyA(delta.create().setAttr('x', 9)).b, { final: true })
  cmp(base, delta.create('view').setAttr('title', 'Bob').insert([9]))
}

export const testProjectMarkDeleteRides = () => {
  const it = transform(delta.$delta({ attrs: { name: s.$string } }), $d =>
    project($d, delta.create('view').setAttr('title', attr($d, 'name')))
  ).init()
  it.applyA(delta.create().setAttr('name', 'Bob'))
  const dc = delta.create()
  dc.deleteMarks = new Set(['M'])
  t.compare(it.applyA(dc).b?.deleteMarks, new Set(['M']))
}

export const testProjectDeltaValuedAttrModify = () => {
  // a projected attribute can be delta-valued (a sub-document). An incremental `modifyAttr` change must
  // be forwarded through the modify channel, NOT written raw into the slot (regression: content
  // corruption). A cursor inside the sub-document rides along and stays reachable.
  /**
   * @param {delta.DeltaBuilderAny} base
   * @param {delta.DeltaBuilderAny?} c
   */
  const apply = (base, c) => { base.apply(c, { final: true }); return base }
  // --- attr hole ---
  const it = transform(delta.$delta({ attrs: { body: delta.$delta('para', { text: true }) } }), $d =>
    project($d, delta.create('view').setAttr('body', attr($d, 'body')))
  ).init()
  const base = psettle(it.applyA(delta.create().setAttr('body', delta.create('para').insert('hi'))).b)
  cmp(base, delta.create('view').setAttr('body', delta.create('para').insert('hi')))
  apply(base, it.applyA(delta.create().modifyAttr('body', delta.create().retain(2).insert('!'))).b)
  cmp(base, delta.create('view').setAttr('body', delta.create('para').insert('hi!'))) // content intact, not the raw change
  // a mark inside the sub-document stays reachable through the projection
  apply(base, it.applyA(delta.create().addMark(position.create(['body', 1], 1), 'I')).b)
  t.compare(position.marksToPositions(base), [{ id: 'I', path: ['body', 1], assoc: 1 }])
  // --- value child hole ---
  const it2 = transform(delta.$delta({ attrs: { body: delta.$delta('para', { text: true }) } }), $d =>
    project($d, delta.create('view').insert([attr($d, 'body')]))
  ).init()
  const base2 = psettle(it2.applyA(delta.create().setAttr('body', delta.create('para').insert('hi'))).b)
  apply(base2, it2.applyA(delta.create().modifyAttr('body', delta.create().retain(2).insert('!'))).b)
  cmp(base2, delta.create('view').insert([delta.create('para').insert('hi!')]))
}

export const testProjectApplyBMarkRoundTrip = () => {
  // applyB is mark-aware: a view-side cursor on a projected (editable) attribute hole routes back to
  // the bound data attribute via the carrier (the round-tripping binding the readme advertises)
  const it = transform(delta.$delta({ attrs: { name: s.$string } }), $d =>
    project($d, delta.create('view').setAttr('title', attr($d, 'name')))
  ).init()
  it.applyA(delta.create().setAttr('name', 'Bob')) // initial render
  const back = it.applyB(delta.create().addMark(position.create(['title']), 'cur'))
  const dataDoc = delta.create(it.$in) // a fresh data doc typed by the transformer's input schema
  dataDoc.apply(back.a, { final: true })
  t.compare(position.marksToPositions(dataDoc), [{ id: 'cur', path: ['name'], assoc: 1 }])
}
