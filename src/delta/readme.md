# Deltas

- Enable you to efficiently represent changes on all kinds of data structures.
- Support schemas
- Support OT-style conflict resolution `delta2.apply(delta1.rebase(delta2, true)) === delta1.apply(delta2.rebase(delta1, false))`
- nice typings

## Delta for Map-like structures

```javascript
// define schema
const $d = delta.$delta({ attrs: { attr1: s.$string, attr2: s.$number } })
const d = delta.create($d)


// create an update
const update = delta.create().setAttr('attr1', 'val1').setAttr('attr2', 42)
d.apply(update)

// In case  of an invalid update
const update2 = delta.create().setAttr('attr1', 42)
// it is possible to check an update beforehand
$d.check(update2) // => false
// and you also get type errors
d.apply(update2) // type error: expected 'attr1' to be of type string
```

## Delta for Text-like structures

Text-like deltas work similarly to [Quill Deltas]{https://quilljs.com/docs/delta}

```javascript
// define schema
const $d = delta.$delta({ text: true })
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
const $d = delta.$delta({ children: s.$array(s.$object({ some: s.$string })) })
const d = delta.create($d).insert([{ some: 'hello world' }])

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
const $d = delta.$delta({ name: s.$literal('div', 'p', 'h1'), attrs: { style: s.$string }, text: true, recursiveChildren: true })
const d = delta.create('div', $d)

// create an update - insert paragraph into the <div>
const update = delta.create().insert([delta.create('p', { style: 'bold: true' }, 'hello world')])
d.apply(update)

// modify the paragraph by deleting the text 'world' and appending '!'
d.apply(delta.create().modify(
  delta.create().retain(6).delete(5).insert('!')
))
```

# Cursors & selections (marks)

A **mark** is a cursor/selection anchor stored on a delta node: a stable `id`, a terminal `key` (a
content offset or an attribute key), an `assoc` gravity (`-1` binds to the preceding content, `1`
to the following), and optional immutable `attrs` (user metadata, e.g. a client/user id). Build a
`Pos` with `position.create(path, assoc?, attrs?)`, add a mark at it, and read them back from a
settled delta with `marksToPositions`:

```javascript
import * as position from 'lib0/delta/position'

const d = delta.create().insert('hello')
d.addMark(position.create([1]), 'cursorA')  // a cursor between 'h' and 'e' (right gravity)
position.marksToPositions(d)                // ⇒ [{ id: 'cursorA', path: [1], assoc: 1 }]

// attrs carried on the position ride with the mark and surface in the reconstructed MarkPos
d.addMark(position.create([2], 1, { user: 'kevin' }), 'cursorB')

// removeMark removes a mark in place; on a fresh delta it instead builds a transmittable
// delete-mark change (symmetric to addMark on a fresh delta building an add-mark change)
delta.create().removeMark(position.create([1]), 'cursorA') // ⇒ { deleteMarks: ['cursorA'] }
```

Marks are **local, ephemeral cursor state**, deliberately **excluded from a delta's fingerprint and
equality** — only document *content* is part of a delta's identity. Consequences:

- **Best-effort under concurrency.** `apply`/`rebase` carry and shift marks (an insert before a cursor
  pushes it right; a delete covering it collapses it to the cut point so it survives). Document content
  is guaranteed to converge; cursor **positions are not** (a deletion maps a range to a single point, so
  concurrent edits can land a cursor on different sides on the two rebase replays). Mark **existence**
  does converge: concurrent add-vs-delete of the same id resolves to *add wins*, delete-vs-delete dedups.
- **Best-effort through transformers.** A transformer remaps a mark through the same position mapping it
  applies to content. A mark may be **dropped** when it has no image on the other side (e.g. an
  attribute the transformer removes, or an attribute mark on an inlined node) or **duplicated** when one
  piece of data is rendered in several places (e.g. the same value projected into multiple `project`
  holes). Such drops are intentional and documented per transformer, never silent.
- **Not carried by `diff`.** `delta.diff` compares content only (it keys off the mark-excluding
  fingerprint), so two states differing *only* in marks diff to an empty change. Marks therefore survive
  on the live `apply`/`rebase`/transform path but **not** across a `diff` — including a `Binding`'s
  initial-state sync (`rdt.js`) and the DOM RDT, which model no marks. Carrying cursors to or from a
  diff-based side needs an out-of-band channel (not provided here).

A mark needs a terminal step, so the root position `[]` cannot anchor one. A node holds at most one mark
per `id` (re-adding the same id replaces it — e.g. to update its `attrs`).

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

# Projections — rendering data onto a structure

A *projection* expands a data delta (the *projectionDelta*) into a nested, html-like
delta, bidirectionally — a React-like "render data to markup", but expressed as a
change-to-change mapping rather than a vdom diff.

**`project(spec)`** is the whole thing. `spec` is an ordinary `delta.create()` tree whose
attribute values and inserted children may be transformer *templates* ("holes"). Each hole
receives the whole projectionDelta; its output is placed at that position. `project` resolves
its own holes and **auto-nests**, so it needs no downstream resolver:

```javascript
import * as delta from 'lib0/delta'
import * as dt from 'lib0/delta/transformer'

const view = dt.project(
  delta.create('p').insert('Name: ').insert([dt.attr('name')])
).init(delta.$deltaAny)

// initial render (applying a final delta)
view.applyA(delta.create().setAttr('name', 'Erika')).b
// ⇒ create('p').insert('Name: ').insert(['Erika'])

// incremental update
view.applyA(delta.create().setAttr('name', 'Max')).b
// ⇒ retain(6).delete(1).insert(['Max'])
```

Holes are detected with `$template` (any value exposing an `init` method, e.g. `attr(…)`,
`pipe(…)`, a nested `project(…)`). Each hole is initialized once at `init`.

- **Value holes** — a hole whose output is a `lib0:value` carrier (produced by `attr`) is
  lifted to its bare scalar, both at an **attribute** position (keyed) and at a **child**
  position (positional, one node ⇒ one scalar embed). A reverse edit of a projected
  *attribute* routes back through the hole; a child value slot is display-only (see below).
- **Node holes** — a hole whose output is a structural node (a nested `project`, or any
  non-`lib0:value` carrier such as a `lib0:inline` fragment) is embedded verbatim, and its
  incremental change is forwarded as a `modify`.
- **Auto-nesting** — a nested subtree that *contains* a hole anywhere inside is automatically
  wrapped into a nested `project` at `init` (recursion built once, bounded by spec depth). You
  don't nest `project(...)` by hand. Plain static subtrees (no holes) are embedded verbatim.
- **Static content** is constant, so the output layout is *fixed* (each hole occupies one
  attribute or one child node). `applyA` routes data changes into the holes; `applyB` routes
  view edits at node-hole positions back to the holes and **self-heals** edits to static
  content and to value slots:

```javascript
// a view edit deletes the static 'Name: ' prefix
view.applyB(delta.create().delete(6))
// ⇒ { a: null, b: insert('Name: ') }   // static content restored, no data change
```

## The `lib0:*` carrier protocol

A *carrier* is a reserved node name a transformer emits to signal "resolve me":

- **`lib0:value`** — a scalar carrier holding the value in its `value` attribute (produced by
  `attr`). `project` lifts it to the bare scalar (at attribute and child positions).
- **`lib0:inline`** — a fragment whose children are spliced into the parent (handled by the
  `inline` transformer configured with the `lib0:inline` name).

`project` resolves carriers in its *own* structure. For a carrier emitted **outside** a
`project` — e.g. a bare `children(() => attr('x'))` map, or a `children`-map you
`rename('lib0:inline')` — compose the matching flat resolver yourself, exactly as you would any
other transformer:

- `dt.unwrapValue` — lifts `lib0:value` children to their scalar (the composable counterpart
  of `inline(['lib0:inline'])`).
- `dt.inline(['lib0:inline'])` — splices `lib0:inline` fragments into their parent. This is
  also how you let a single hole expand to **N sibling nodes** between static siblings: emit a
  `lib0:inline` fragment and compose `inline(['lib0:inline'])` after `project`.

## Lists and tables

Map a collection's children with the `children` transformer and relabel the container with
`rename`. Each row is a `project`, so it lifts its own values — no resolver needed:

```javascript
const rowSpec = delta.create('li').insert([dt.attr('name')])
const list = dt.pipe(dt.children(() => dt.project(rowSpec)), dt.rename('ul'))

list.init(delta.$deltaAny).applyA(delta.create('users').insert([
  delta.create('user').setAttr('name', 'Erika'),
  delta.create('user').setAttr('name', 'Max')
])).b
// ⇒ create('ul').insert([ create('li').insert(['Erika']), create('li').insert(['Max']) ])
```

`children` maps one data item to one row (incremental insert/delete/retain/modify, per-item
transformer state preserved positionally); `rename('ul')` relabels the mapped container. For an
**editable** row binding use an *attribute* hole (`delta.create('li').setAttr('label',
dt.attr('name'))`): a view edit of the attribute round-trips back to the data item.

## Limitations & extensions (v1)

- **Child scalars resolve to a single embed, not text merged into a surrounding run.** A
  value interpolated *inside* a text run (`Hello {name}!`) needs count-changing resolution;
  deferred (it would reuse `inline` over a child-content carrier representation).
- **Child value slots are display-only.** A scalar embed has no `modify` channel, so a view
  edit of a child value is self-healed, not routed to data (the same v1 limitation
  `unwrapValue` documents). Use an **attribute** hole for an editable binding — those
  round-trip.
- **Carriers emitted outside a `project`** are resolved only if you compose `unwrapValue` /
  `inline(['lib0:inline'])`; deep non-`project` carrier trees are not auto-recursed.
- **Live DOM binding** — wire a projection through `bind` (`rdt.js`):
  `bind(dataRDT, domRDT, project(spec))`.
- **Char-level attr sync** (model attr values as text deltas, `recursiveAttrs`),
  **computed one-way bindings**, and **keyed `map` identity** — out of scope.
