import * as delta from '../delta.js'
import * as math from '../../math.js'
import { Transformer, Template, createTransformResult, $template } from './core.js'

/**
 * The scalar (or full replacement value) a `lib0:value` carrier *sets*: its `value` attribute op's
 * value, but **only when that op is a `SetAttrOp`** (a full value set). Returns `undefined` for a
 * `ModifyAttrOp` carrier (an incremental change to a delta-valued attribute — see {@link modifyOf}) or
 * a `DeleteAttrOp`/absent op, so an incremental change is never mistaken for a replacement value.
 *
 * @param {delta.DeltaAny?} carrier
 */
const scalarOf = carrier => {
  const op = carrier == null ? undefined : /** @type {any} */ (carrier.attrs).value
  return delta.$setAttrOp.check(op) ? op.value : undefined
}

/**
 * The inner change delta a `lib0:value` carrier *modifies* with: its `value` attribute op's value when
 * that op is a `ModifyAttrOp` (an incremental change to a delta-valued projected attribute), else
 * `undefined`. Routed through the slot's modify channel instead of replacing the slot value.
 *
 * @param {delta.DeltaAny?} carrier
 */
const modifyOf = carrier => {
  const op = carrier == null ? undefined : /** @type {any} */ (carrier.attrs).value
  return delta.$modifyAttrOp.check(op) ? /** @type {any} */ (op).value : undefined
}

/**
 * Whether `el` is a `lib0:value` carrier node (the convention produced by the
 * {@link import('./attr.js').attr} transformer). Such a carrier at a child position is lifted to a
 * bare scalar embed; any other node is embedded verbatim (e.g. a `lib0:inline` fragment, which a
 * downstream `inline(['lib0:inline'])` may splice).
 *
 * @param {any} el
 */
const isValueNode = el => delta.$deltaAny.check(el) && el.name === 'lib0:value'

/**
 * Whether the delta `d` contains a transformer {@link Template} anywhere in its attribute values or
 * (recursively) its inserted child nodes. Used by {@link ProjectionTemplate#init} to decide whether
 * a nested static subtree must be auto-wrapped into a nested {@link project} (it has a hole inside)
 * or embedded verbatim (it is purely static). A plain delta has no `init` method, so `$template`
 * correctly returns false for non-template subtrees.
 *
 * @param {delta.DeltaAny} d
 * @return {boolean}
 */
const containsTemplate = d => {
  for (const op of d.attrs) {
    if (delta.$setAttrOp.check(op) && $template.check(op.value)) return true
  }
  for (const op of d.children) {
    if (delta.$insertOp.check(op)) {
      for (const el of op.insert) {
        if ($template.check(el)) return true
        if (delta.$deltaAny.check(el) && containsTemplate(el)) return true
      }
    }
  }
  return false
}

/**
 * Place a carried cursor mark from a value/attr hole's output `rb` (a `lib0:value` carrier whose mark
 * is keyed `'value'`) as a root mark on `out` at `slotKey` - the attribute key or child position the
 * hole occupies. A scalar/attribute slot has no mark channel of its own, so this root mark is the
 * cursor's only home; with several same-id value/attr slots the last placement wins (`Marks` is
 * id-keyed per node, so an id cannot exist twice on one node - true duplication is impossible here).
 * Node holes need none of this: their marks ride nested inside the embedded node. `deleteMarks` ride
 * verbatim (id-keyed).
 *
 * @param {delta.DeltaBuilderAny} out
 * @param {delta.DeltaBuilderAny?} rb
 * @param {string|number} slotKey
 */
const placeCarrierMark = (out, rb, slotKey) => {
  if (rb == null) return
  if (rb.marks !== null) {
    for (const m of rb.marks) if (m.key === 'value') delta.addRootMark(out, m.copy(slotKey))
  }
  if (rb.deleteMarks !== null) {
    for (const id of rb.deleteMarks) delta.deleteRootMark(out, id)
  }
}

/**
 * One child slot of a {@link ProjectionTransformer}'s fixed output layout: a run of static text, a
 * single static node/embed, or a single hole (filled by a sub-transformer's output).
 *
 * A hole's `carrier` records how its sub-transformer's output is placed: `'value'` lifts a
 * `lib0:value` carrier to a bare scalar embed (1 position, replaced on update); `'node'` embeds a
 * structural node verbatim (a nested `project`'s render, or a non-value carrier) and forwards its
 * incremental change as a `modify`. The kind is fixed once: known at `init` for auto-wrapped nested
 * projects, otherwise sniffed from the first render and cached (`lastScalar` keeps the last lifted
 * scalar so a view deletion of a value slot can be self-healed).
 *
 * @typedef {{ kind: 'text', str: string, format?: any, attribution?: any }
 *  | { kind: 'static', el: any, format?: any, attribution?: any }
 *  | { kind: 'hole', t: Transformer<any,any>, el: any, carrier?: 'value'|'node', lastScalar?: any, format?: any, attribution?: any }} ChildItem
 */

/**
 * Stateful transformer produced by {@link ProjectionTemplate}. Side A is the data (the
 * *projectionDelta*); side B is the projected structure - the spec with each hole filled by its
 * sub-transformer's output. `project` resolves the `lib0:value` carrier itself: at an *attribute*
 * position (keyed) and at a *child* position (positional, 1->1) it lifts the carrier to its bare
 * scalar. A child hole that is a nested `project` (or any non-`lib0:value` carrier) is embedded as a
 * node. A `lib0:inline` fragment is left intact for a downstream `inline(['lib0:inline'])`.
 *
 * The output layout is *fixed*: every hole occupies exactly one attribute or one child node, and
 * static content is constant. So `applyA` routes data changes into holes, and `applyB` routes view
 * edits at *node*-hole positions back to holes while **self-healing** edits to static content and to
 * value slots (a bare scalar has no `modify` channel, so a value-slot view edit is not round-tripped
 * to data in v1 - use an attribute hole for an editable binding).
 *
 * @extends {Transformer<any,any>}
 */
export class ProjectionTransformer extends Transformer {
  /**
   * @param {string} name
   * @param {Array<{ key: string|number, value: any, attribution?: any }>} staticAttrs
   * @param {Array<{ key: string|number, t: Transformer<any,any> }>} attrHoles
   * @param {Array<ChildItem>} items child slots in output order
   */
  constructor (name, staticAttrs, attrHoles, items) {
    super()
    this.name = name
    this.staticAttrs = staticAttrs
    this.attrHoles = attrHoles
    this.items = items
    // absolute output position of each child slot (static text spans its length, everything else 1)
    let pos = 0
    /**
     * @type {Array<{ start: number, len: number, item: ChildItem }>}
     */
    this.segs = items.map(item => {
      const len = item.kind === 'text' ? item.str.length : 1
      const seg = { start: pos, len, item }
      pos += len
      return seg
    })
    this.initialized = false
  }

  /**
   * @param {delta.DeltaBuilderAny} d a data change (or the full data on the first call)
   * @return {import('./core.js').TransformResultAny}
   */
  applyA (d) {
    return this.initialized ? this._update(d) : this._render(d)
  }

  /**
   * Lift a child hole's sub-transformer output and place it on `out`. Returns the output count (1).
   * For a value carrier the bare scalar is inserted (and cached for self-heal); otherwise the node is
   * embedded verbatim. The hole's `carrier` kind is sniffed once here and cached.
   *
   * @param {delta.DeltaBuilderAny} out
   * @param {ChildItem & { kind: 'hole' }} item
   * @param {delta.DeltaBuilderAny?} rb the sub-transformer's B output
   */
  _placeHole (out, item, rb) {
    if (item.carrier == null) item.carrier = isValueNode(rb) ? 'value' : 'node'
    if (item.carrier === 'value') {
      const sc = scalarOf(rb)
      const v = sc === undefined ? null : sc
      item.lastScalar = v
      out.insert([v], item.format, item.attribution)
    } else {
      out.insert([rb], item.format, item.attribution)
    }
  }

  /**
   * Initial render: emit the full structure with every hole filled.
   *
   * @param {delta.DeltaBuilderAny} d
   */
  _render (d) {
    this.initialized = true
    const out = delta.create(/** @type {any} */ (this.name))
    const res = createTransformResult(null, out)
    for (const a of this.staticAttrs) out.setAttr(/** @type {any} */ (a.key), a.value, a.attribution)
    for (const h of this.attrHoles) {
      const r = h.t.applyA(d)
      const sc = scalarOf(r.b)
      if (sc !== undefined) out.setAttr(/** @type {any} */ (h.key), sc)
      placeCarrierMark(out, r.b, h.key) // a cursor on this data attr anchors at the output attr key
      res.applyA(r.a)
    }
    let childPos = 0 // output child position, to anchor a value-hole's carried cursor mark
    for (const item of this.items) {
      if (item.kind === 'text') {
        out.insert(item.str, item.format, item.attribution)
        childPos += item.str.length
      } else if (item.kind === 'static') {
        out.insert([item.el], item.format, item.attribution)
        childPos += 1
      } else {
        const r = item.t.applyA(d)
        this._placeHole(out, item, r.b)
        // value holes lift a bare scalar (no mark channel) - anchor the cursor at the slot position;
        // node holes carry their marks nested inside the embedded node (no action needed)
        if (item.carrier === 'value') placeCarrierMark(out, r.b, childPos)
        childPos += 1
        res.applyA(r.a)
      }
    }
    return res
  }

  /**
   * Incremental data change: emit only the hole updates. A value hole is *replaced*
   * (`delete(1).insert([scalar])`, since a scalar embed has no inner structure to modify); a node
   * hole forwards its sub-transformer's incremental change as a `modify`.
   *
   * @param {delta.DeltaBuilderAny} d
   */
  _update (d) {
    const out = delta.create()
    const res = createTransformResult(null, out)
    for (const h of this.attrHoles) {
      const r = h.t.applyA(d)
      // emit the attr update by the carrier's op KIND (a mark-only change carries no value op at all):
      // SetAttr -> full set/replace; ModifyAttr -> incremental change to a delta-valued attr, forwarded
      // through the modify channel (NOT written as the value); DeleteAttr -> remove the attr.
      const carrierOp = r.b == null ? undefined : /** @type {any} */ (r.b.attrs).value
      if (delta.$setAttrOp.check(carrierOp)) {
        out.setAttr(/** @type {any} */ (h.key), scalarOf(r.b))
      } else if (delta.$modifyAttrOp.check(carrierOp)) {
        out.modifyAttr(/** @type {any} */ (h.key), modifyOf(r.b))
      } else if (delta.$deleteAttrOp.check(carrierOp)) {
        out.deleteAttr(/** @type {any} */ (h.key))
      }
      placeCarrierMark(out, r.b, h.key)
      res.applyA(r.a)
    }
    let emitted = 0 // output position already covered by `out`'s child ops
    for (const seg of this.segs) {
      if (seg.item.kind !== 'hole') continue
      const item = seg.item
      const r = item.t.applyA(d)
      if (item.carrier === 'value') {
        // route by the carrier's op KIND (a mark-only change carries no value op, so the slot is left
        // intact and only the cursor is anchored): SetAttr -> replace the scalar embed; ModifyAttr ->
        // forward an incremental change to a delta-valued embed through the modify channel.
        const carrierOp = r.b == null ? undefined : /** @type {any} */ (r.b.attrs).value
        if (delta.$setAttrOp.check(carrierOp)) {
          if (seg.start > emitted) out.retain(seg.start - emitted)
          const sc = scalarOf(r.b)
          const v = sc === undefined ? null : sc
          item.lastScalar = v
          out.delete(1)
          out.insert([v])
          emitted = seg.start + 1
        } else if (delta.$modifyAttrOp.check(carrierOp)) {
          if (seg.start > emitted) out.retain(seg.start - emitted)
          out.modify(modifyOf(r.b)) // incremental change to the delta-valued embed
          emitted = seg.start + 1
        }
        placeCarrierMark(out, r.b, seg.start)
      } else if (r.b != null && !r.b.isEmpty()) {
        // node hole: forward the incremental change as a modify; its marks ride nested
        if (seg.start > emitted) out.retain(seg.start - emitted)
        out.modify(r.b)
        emitted = seg.start + 1
      }
      res.applyA(r.a)
    }
    return res
  }

  /**
   * Reconstruct the content occupying output positions `[start, start+len)` as insert ops on `out`
   * (used to self-heal a view delete). Static text/nodes are restored from the spec, and a value
   * slot is restored from its last-rendered scalar. Node-hole positions are skipped (their dynamic
   * structure cannot be restored without the current data).
   *
   * @param {delta.DeltaBuilderAny} out
   * @param {number} start
   * @param {number} len
   */
  _restore (out, start, len) {
    const end = start + len
    for (const seg of this.segs) {
      if (seg.start >= end || seg.start + seg.len <= start) continue
      const from = math.max(start, seg.start)
      const to = math.min(end, seg.start + seg.len)
      const item = seg.item
      if (item.kind === 'text') {
        out.insert(item.str.slice(from - seg.start, to - seg.start), item.format, item.attribution)
      } else if (item.kind === 'static') {
        out.insert([item.el], item.format, item.attribution)
      } else if (item.kind === 'hole' && item.carrier === 'value') {
        out.insert([item.lastScalar], item.format, item.attribution)
      }
    }
  }

  /**
   * @param {delta.DeltaBuilderAny} d a view change in the output space
   * @return {import('./core.js').TransformResultAny}
   */
  applyB (d) {
    const res = createTransformResult(null, null)
    const heal = delta.create()
    let healed = false
    // attributes: route hole-attr edits to their holes, self-heal edits to static attrs
    for (const op of d.attrs) {
      const hole = this.attrHoles.find(h => h.key === op.key)
      if (hole != null) {
        if (delta.$setAttrOp.check(op)) {
          res.applyA(hole.t.applyB(delta.create('lib0:value').setAttr('value', op.value)).a)
        }
      } else {
        const st = this.staticAttrs.find(a => a.key === op.key)
        if (st != null && !(delta.$setAttrOp.check(op) && op.value === st.value)) {
          heal.setAttr(/** @type {any} */ (st.key), st.value)
          healed = true
        }
      }
    }
    // children: walk with a pre-change position cursor, routing node-hole modifies and self-healing
    // everything else (drift, edited static content, edited value slots)
    let pos = 0
    const segAt = (/** @type {number} */ p) => this.segs.find(s => s.start <= p && p < s.start + s.len)
    for (const op of d.children) {
      if (delta.$retainOp.check(op)) {
        heal.retain(op.retain)
        pos += op.retain
      } else if (delta.$textOp.check(op)) {
        heal.delete(op.insert.length) // inserted text is drift
        healed = true
      } else if (delta.$insertOp.check(op)) {
        heal.delete(op.insert.length) // inserted nodes/embeds are drift
        healed = true
      } else if (delta.$deleteOp.check(op)) {
        this._restore(heal, pos, op.delete) // re-insert the deleted static / value content
        healed = true
        pos += op.delete
      } else if (delta.$modifyOp.check(op)) {
        const seg = segAt(pos)
        if (seg != null && seg.item.kind === 'hole' && seg.item.carrier === 'node') {
          // op.value is an immutable Delta view; transformers consume a DeltaBuilder
          res.applyA(seg.item.t.applyB(delta.clone(op.value)).a)
          heal.retain(1)
        } else {
          // a static node or a value slot was modified: restore it
          heal.delete(1)
          this._restore(heal, pos, 1)
          healed = true
        }
        pos += 1
      }
    }
    // route view-side cursor marks on ATTRIBUTE holes back to their data attribute (the editable,
    // round-tripping binding): a root mark keyed to an attr hole's output key rides on a `lib0:value`
    // carrier so the attr sub-transformer maps it to the data attribute. Best-effort for the rest -
    // node-hole nested marks already ride on the routed `modify` above; value child slots are
    // display-only (no data channel); marks at static / non-hole positions and view-side mark
    // *deletions* are not routed back (marks are ephemeral cursor state - see the readme).
    if (d.marks !== null) {
      for (const m of d.marks) {
        const hole = this.attrHoles.find(h => h.key === m.key)
        if (hole != null) {
          const carrier = /** @type {delta.DeltaBuilderAny} */ (delta.create('lib0:value'))
          delta.addRootMark(carrier, m.copy('value'))
          res.applyA(hole.t.applyB(carrier).a)
        }
      }
    }
    if (healed) {
      heal.done(false)
      res.applyB(heal)
    }
    return res
  }
}

/**
 * Template that projects the *projectionDelta* onto a fixed structure described by `spec` - an
 * ordinary {@link import('../delta.js').create delta} whose attribute values and inserted children
 * may be transformer {@link Template templates} ("holes"). Each hole receives the whole
 * projectionDelta; its output is placed at that position. The spec is a *write-only template*: it is
 * walked once at {@link ProjectionTemplate#init} and never fingerprinted/diffed.
 *
 * Holes resolve themselves: a `lib0:value` carrier (produced by {@link import('./attr.js').attr}) is
 * lifted to a bare scalar; a nested subtree that contains a hole is **auto-wrapped** into a nested
 * `project` at `init`, so deep structure composes through nested templates with the recursion built
 * once (bounded by spec depth). Plain static subtrees are embedded verbatim.
 */
export class ProjectionTemplate extends Template {
  /**
   * @param {delta.DeltaBuilderAny} spec
   */
  constructor (spec) {
    super()
    this.spec = spec
  }

  get stateless () { return false }

  /**
   * @param {import('../../schema.js').Schema<delta.DeltaAny>} $d
   * @return {Transformer<any,any>}
   */
  init ($d) {
    const spec = this.spec
    /**
     * @type {Array<{ key: string|number, value: any, attribution?: any }>}
     */
    const staticAttrs = []
    /**
     * @type {Array<{ key: string|number, t: Transformer<any,any> }>}
     */
    const attrHoles = []
    for (const op of spec.attrs) {
      if (delta.$setAttrOp.check(op)) {
        if ($template.check(op.value)) {
          attrHoles.push({ key: op.key, t: /** @type {Template} */ (op.value).init($d) })
        } else {
          staticAttrs.push({ key: op.key, value: op.value, attribution: op.attribution })
        }
      }
    }
    /**
     * @type {Array<ChildItem>}
     */
    const items = []
    for (const op of spec.children) {
      if (delta.$textOp.check(op)) {
        items.push({ kind: 'text', str: op.insert, format: op.format, attribution: op.attribution })
      } else if (delta.$insertOp.check(op)) {
        for (const el of op.insert) {
          if ($template.check(el)) {
            items.push({ kind: 'hole', t: /** @type {Template} */ (el).init($d), el, format: op.format, attribution: op.attribution })
          } else if (delta.$deltaAny.check(el) && containsTemplate(el)) {
            // a static subtree with a hole inside it - auto-wrap as a nested project (a node hole).
            // reason: `el` is an immutable inserted `Delta`; `project` is typed for the `DeltaBuilder`
            // authoring API, but `ProjectionTemplate.init` only reads attrs/children/name, which both
            // expose, so passing the read-only view through is sound.
            const nested = project(/** @type {any} */ (el)).init($d)
            items.push({ kind: 'hole', t: nested, el, carrier: 'node', format: op.format, attribution: op.attribution })
          } else {
            items.push({ kind: 'static', el, format: op.format, attribution: op.attribution })
          }
        }
      }
    }
    return new ProjectionTransformer(/** @type {any} */ (spec.name), staticAttrs, attrHoles, items)
  }
}

/**
 * Create a {@link ProjectionTemplate} from a spec delta. Embed transformer templates as attribute
 * values or inserted children to mark "holes" that are filled from the projectionDelta. A child hole
 * whose output is a `lib0:value` carrier is lifted to its scalar; a nested subtree containing a hole
 * is auto-wrapped into a nested `project`.
 *
 * @param {delta.DeltaBuilderAny} spec
 */
export const project = spec => new ProjectionTemplate(spec)
