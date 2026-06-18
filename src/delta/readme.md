# Deltas

- Enable you to efficiently represent changes on all kinds of data structures.
- Support schemas
- Support OT-style conflict resolution `delta2.apply(delta1.rebase(delta2, true)) === delta1.apply(delta2.rebase(delta1, false))`
- nice typings

## Delta for Map-like structures

```javascript
// define schema
const $d = delta.$delta(s.$any, { attr1: s.$string, attr2: s.$number })
const d = delta.create($d)


// create an update
const update = delta.create().set('attr1', 'val1').set('attr2', 42)
d.apply(update)

// In case  of an invalid update
const update2 = delta.create().set('attr1', 42)
// it is possible to check an update beforehand
$d.check(update2) // => false
// and you also get type errors
d.apply(update2) // type error: expected 'attr1' to be of type string
```

## Delta for Text-like structures

Text-like deltas work similarly to [Quill Deltas]{https://quilljs.com/docs/delta}

```javascript
// define schema
const $d = delta.$delta(s.$any, null, s.$string)
const d = delta.create($d).insert('hello world')

// create an update
const update = delta.create().retain(11).insert('!')
d.apply(update)

// In case  of an invalid update
const update2 = delta.create().insert([{ some: 'object' }])
// it is possible to check an update beforehando
$d.check(update2) // => false
// and you also get type errors
d.apply(update2) // type error: unexpected attribute 'attr1'
```

## Delta for Array-like structures

```javascript
// define schema
const $d = delta.$delta(s.$any, null, s.$array(s.object({ some: s.$string }, s.$string)))
const d = delta.create($d).insert(['hello world'])

// create an update
const update = delta.create().retain(1).insert({ some: 'object' })
d.apply(update)

// In case  of an invalid update
const update2 = delta.create().insert([{ unknown: 'prop' }])
// it is possible to check an update beforehando
$d.check(update2) // => false
// and you also get type errors
d.apply(update2) // type error: { unknown: 'prop' } is not assignable to { some: string }
```

## Delta for Node-like structures (similar to XML,Trees with named nodes)

```javascript
// define schema for a 'p'|'h1' node that may contain text or other instances of itself
const $d = delta.$delta(s.$literal('div', 'p', 'h1'), { style: s.$string }, s.$string, true))
const d = delta.create('div', $d)

// create an update - insert paragraph into the <div>
const update = delta.create().insert([delta.create('p', { style: 'bold: true' }, 'hello world')])
d.apply(update)

// modify the paragraph by deleting the text 'world' and appending '!'
d.apply(delta.create().modify(
  delta.create().retain(6).delete(5).insert('!')
))
```

# Transformers

We often have two different data structures that we want to keep in sync — e.g. a
data delta (backed by Yjs) and an html-like delta tree (backed by the DOM). A delta
transformer describes the mapping once and translates *changes* in both directions:

- data updates ⇒ incremental updates on the html structure
- html edits (e.g. from a `contenteditable` editor) ⇒ updates on the data

A `Template` (`rename`, `filter`, `pipe`, …) is initialized against an input schema
and yields a `Transformer<A,B>`. `applyA(deltaA)` maps an A-change to a B-change,
`applyB(deltaB)` maps back, and `apply({a,b})` resolves concurrent changes on both
sides via rebase (see `Transformer.apply` in `transformer.js`).

# Projections — React-like templates (design)

> **Status: design-stage.** `rename`, `filter`, `queryAttr` and `pipe` exist in
> `transformer.js`. The projection templates specified here — `dt.node`, `dt.map`,
> `dt.queryText` and the `queryAttr` factory — are not implemented yet. This section
> is the spec for them.

A projection expands a data delta into a nested html-equivalent delta. It is
declared like a React component tree — `dt.node` instead of `createElement`/JSX,
query-templates instead of `{expr}`:

```javascript
import * as delta from 'lib0/delta'
import * as dt from 'lib0/delta/transformer'
import * as s from 'lib0/schema'

// the data: a list of users
const $user = delta.$delta({ name: 'user', attrs: { name: s.$string, address: s.$string } })
const $users = delta.$delta({ children: $user })

// React:  const UserView = ({user}) =>
//   <li class='user'><h2>{user.name}</h2><p class='address'>{user.address}</p></li>
const UserView = dt.node('li', { class: 'user' }, [
  dt.node('h2', {}, [dt.queryAttr('name')]),
  dt.node('p', { class: 'address' }, [dt.queryAttr('address')])
])

// React:  const UserList = ({users}) => <ul>{users.map(u => <UserView user={u}/>)}</ul>
const UserList = dt.node('ul', {}, [dt.map(UserView)])

const t = UserList.init($users) // Transformer<users-conf, ul-conf>
```

How this relates to React:

| React                                | delta transformers                                          |
|--------------------------------------|-------------------------------------------------------------|
| `createElement(tag, props, children)` | `dt.node(name, attrs, children)`                            |
| `{user.name}`                         | `dt.queryAttr('name')`                                      |
| text content                          | `dt.queryText()`                                            |
| `users.map(u => …)`                   | `dt.map(UserView)`                                          |
| `key` prop for list identity          | not needed — identity is positional, carried by insert/delete/retain ops |
| re-render + vdom diff                 | none — changes map directly to changes                      |
| one-way data flow                     | bidirectional — `applyB` maps html edits back to the data   |

## Combinators

- **`dt.node(name, attrs, children)`** — projects onto a named node. `attrs` values
  are either static values or templates (bound attrs). `children` entries are either
  static strings or templates. Mixing is fine:
  `dt.node('p', {}, ['Address: ', dt.queryAttr('address')])`.
- **`dt.queryAttr(name)`** — binds the value of attr `name` of the input delta
  (factory over the existing `QueryAttr` template).
- **`dt.queryText()`** — binds the text content of the input delta. Unlike attr
  bindings (replacement semantics, see below), text↔text maps char-level:
  retain/insert/delete pass through directly.
- **`dt.map(itemTemplate)`** — only valid in children position. Renders every child
  of the input delta through `itemTemplate`; one data item ↔ one html node.
- Projections compose with the existing templates:
  `dt.pipe(dt.filter(delta.$delta({ attrs: { name: s.$string, address: s.$string } })), UserView)`.

**The `lib0:value` carrier convention.** Scalar bindings transport their value as a
`lib0:value` node with the value in `attrs.value` (established by
`QueryAttrTransformer`). `dt.node` unwraps carriers at attr positions (set the attr)
and at child positions (render as text); any other template output splices in as a
subtree. This is the interop contract between all binding combinators.

## Forward direction (`applyA`: data → html)

Deltas represent both state and change: applying a final delta is the initial
render, subsequent deltas map incrementally.

```javascript
// initial render
t.applyA(delta.create().insert([
  delta.create('user', { name: 'Erika', address: 'Friedrichstr. 12' })
])).b
// ⇒ insert([ create('li', { class: 'user' }, [
//      create('h2', null, 'Erika'),
//      create('p', { class: 'address' }, 'Friedrichstr. 12')
//    ]) ])

// incremental update: change the address of user 0
t.applyA(delta.create().modify(
  delta.create('user').setAttr('address', 'Hauptstr. 5')
)).b
// ⇒ modify(                                // into <li> #0
//     retain(1).modify(                    // skip <h2>, into <p>
//       delete(16).insert('Hauptstr. 5')   // replace bound text
//     )
//   )
```

Per binding kind:

- **attr binding** — A `setAttr('name', v)` ⇒ B `setAttr('class', v)`;
  `deleteAttr` ⇒ `deleteAttr`.
- **scalar binding in children** — A `setAttr` ⇒ B `modify(…)` path down to the bound
  segment, `delete(oldLen).insert(newValue)`. Replacement semantics — char-level sync
  for attrs is possible by modeling the attr value itself as a text delta
  (`recursiveAttrs`, see extensions).
- **`dt.map` region** — A `insert([item,…])` ⇒ render each item through a fresh
  per-item transformer instance, B `insert([rendered,…])`; `delete(n)` ⇒ `delete(n)`
  (instances dropped); `retain(n)` ⇒ `retain(n)`; `modify(d)` ⇒
  `modify(instanceᵢ.applyA(d).b)`.

**Position translation.** A host's children are a sequence of segments: static
entries (constant length; a static string of length k occupies k positions),
bound-text segments (current value length) and map regions (current item count).
The node transformer tracks segment lengths and per-item instances to translate
positions — it is stateful (`stateless = false`). This is the children-sync
machinery that `ProjectionTransformer` currently lacks.

## Backward direction (`applyB`: html → data)

```javascript
// contenteditable appends ' M.' to the <h2> of user 0
t.applyB(delta.create().modify(
  delta.create().modify(delta.create().retain(5).insert(' M.'))
)).a
// ⇒ modify(create('user').setAttr('name', 'Erika M.'))

// a new, template-conforming <li> subtree is inserted ⇒ inverse render
t.applyB(delta.create().retain(1).insert([
  delta.create('li', { class: 'user' }, [
    delta.create('h2', null, 'Max'),
    delta.create('p', { class: 'address' }, 'Berliner Allee 1')
  ])
])).a
// ⇒ retain(1).insert([ create('user', { name: 'Max', address: 'Berliner Allee 1' }) ])
```

- **bound attr edit** ⇒ A `setAttr` (reverse of the binding).
- **edit inside a bound text segment** ⇒ the new value is reconstructed from segment
  state + the edit ⇒ A `setAttr(name, newValue)`.
- **inside a `dt.map` region** — `modify` at item i ⇒ `instanceᵢ.applyB` ⇒ A `modify`
  at index i; `delete` ⇒ A `delete` of the corresponding items; **insert of a subtree
  ⇒ inverse render**: the inserted tree is matched against `itemTemplate`, bound
  values are extracted, and the corresponding data item is constructed.
- **static regions: self-healing.** Edits touching static template content produce no
  A-delta. Instead the transformer emits a correcting B-delta (in
  `TransformResult.b`) restoring the static content — the html can never drift from
  the template. Concurrent B-changes are rebased over the correction by the existing
  `Transformer.apply` machinery. Inverse-render inputs whose static parts don't match
  the template heal the same way: bound values are accepted, the rest is corrected.

```javascript
const NoteView = dt.node('p', {}, ['Address: ', dt.queryAttr('address')])
// B-edit deletes the static 'Address: ' prefix (9 chars)
nt.applyB(delta.create().delete(9))
// ⇒ { a: null, b: insert('Address: ') }   // heal: restore static content
```

## Typing

Like the existing templates, projections compute their output conf at the type
level, so `t.applyA(…)` / schema checks are fully typed:

- `dt.node` returns `NodeTpl<Name, AttrsSpec, ChildrenSpec>`; an
  `ApplyNode<Name, AttrsSpec, ChildrenSpec, IN>` alias derives the output conf:
  `name: Name`; per attr key the static value type or the unwrapped carrier value
  (cf. `ApplyQueryAttr`); children as the union of static text (`text: true`),
  nested `delta.Delta<ApplyNode<…>>` confs, and — for `dt.map` —
  `delta.Delta<ApplyNode<ItemTpl…, ChildConf<IN>>>` where `ChildConf` extracts the
  input's `children` conf.
- `ApplyPipeNorm` gets one new dispatch branch for `NodeTpl`. The produced conf must
  be constructed as an object literal inside the branch — see the TS2589 notes on
  `ApplyPipeNorm` in `transformer.js` (literal-carry, per-step destructure forcing,
  TS-alone outer check).
- Template-tree recursion depth equals markup nesting depth (shallow), orthogonal to
  the pipe-length ceiling (~85, guarded by `testPipeTypeDepthCeiling`). The
  implementation should add a nesting-depth probe alongside the existing ceiling
  tests.

## Extensions (out of scope for v1)

- **Live DOM binding** — `rdt.js` sketches RDTs for both sides:
  `bind(dataRDT, domRDT, UserList.init($users))` wires MutationObserver-derived
  deltas through the transformer and back.
- **Computed one-way bindings** (`dt.computed(f)`) — not invertible; write-backs
  would heal like static content.
- **Char-level attr sync** — model attr values as text deltas (`recursiveAttrs`)
  so attr bindings stop being replacement-level.
- **Keyed identity for `dt.map`** — only if positional OT identity proves
  insufficient in practice.

