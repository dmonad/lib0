import * as t from 'lib0/testing'
import * as s from 'lib0/schema'
import * as delta from './delta.js'
import * as error from '../error.js'
import * as prng from '../prng.js'

/**
 * Delta is a versatyle format enabling you to efficiently describe changes. It is part of lib0, so
 * that non-yjs applications can use it without consuming the full Yjs package. It is well suited
 * for efficiently describing state & changesets.
 *
 * Assume we start with the text "hello world". Now we want to delete " world" and add an
 * exclamation mark. The final content should be "hello!" ("hello world" => "hello!")
 *
 * In most editors, you would describe the necessary changes as replace operations using indexes.
 * However, this might become ambiguous when many changes are involved.
 *
 * - delete range 5-11
 * - insert "!" at position 11
 *
 * Using the delta format, you can describe the changes similar to what you would do in an text editor.
 * The "|" describes the current cursor position.
 *
 * - d.retain(5) - "|hello world" => "hello| world" - jump over the next five characters
 * - d.delete(6) - "hello| world" => "hello|" - delete the next 6 characres
 * - d.insert('!') - "hello!|" - insert "!" at the current position
 * => compact form: d.retain(5).delete(6).insert('!')
 *
 * You can also apply the changes in two distinct steps and then rebase the op so that you can apply
 * them in two distinct steps.
 * - delete " world":              d1 = delta.create().retain(5).delete(6)
 * - insert "!":                   d2 = delta.create().retain(11).insert('!')
 * - rebase d2 on-top of d1:       d2.rebase(d1)    == delta.create().retain(5).insert('!')
 * - merge into a single change:   d1.apply(d2)     == delta.create().retain(5).delete(6).insert(!)
 *
 * @param {t.TestCase} _tc
 */
export const testDeltaBasicApi = _tc => {
  // the state of our text document
  const state = delta.create().insert('hello world')
  // describe changes: delete " world" & insert "!"
  const change = delta.create().retain(5).delete(6).insert('!')
  // apply changes to state
  state.apply(change)
  // compare state to expected state
  t.assert(state.equals(delta.create().insert('hello!')))
}

/**
 * Deltas can describe changes on attributes and children. Textual insertions are children. But we
 * may also insert json-objects and other deltas as children.
 * Key-value pairs can be represented as attributes. This "convoluted" changeset enables us to
 * describe many changes in the same breath:
 *
 * delta.create().set('a', 42).retain(5).delete(6).insert('!').unset('b')
 *
 * @param {t.TestCase} _tc
 */
export const testDeltaValues = _tc => {
  const _q = delta.create().setAttr('a', 42).deleteAttr('b').retain(5).delete(5).insert('!')
  const change = _q.insert([{ my: 'custom object' }])
  // iterate through attribute changes
  for (const attrChange of change.attrs) {
    if (delta.$setAttrOp.check(attrChange)) {
      console.log(`set ${attrChange.key} to ${attrChange.value}`)
    } else if (delta.$deleteAttrOp.check(attrChange)) {
      console.log(`delete ${attrChange.key}`)
    }
  }
  // iterate through child changes
  for (const childChange of change.children) {
    if (delta.$retainOp.check(childChange)) {
      console.log(`retain ${childChange.retain} child items`)
    } else if (delta.$deleteOp.check(childChange)) {
      console.log(`delete ${childChange.delete} child items`)
    } else if (delta.$insertOp.check(childChange)) {
      console.log('insert child items:', childChange.insert)
    } else if (delta.$textOp.check(childChange)) {
      console.log('insert textual content', childChange.insert)
    }
  }
  /**
   * @typedef {t.Assert<t.Equal<typeof _q,delta.DeltaBuilder<{attrs:{a:number,b:never},text:true}>>>}
   */
  /**
   * @typedef {t.AssertExtends<typeof _q,delta.DeltaBuilder<{attrs:{a:string|number,b:string},text:true}>>}
   */
  /**
   * @typedef {t.Assert<t.Equal<typeof change,delta.DeltaBuilder<{attrs:{a:number,b:never},text:true,children:{my:string}}>>>}
   */
  /**
   * @typedef {t.AssertExtends<typeof change,delta.DeltaBuilder<{attrs:{a:number,b:never},text:true,children:{my:string}}>>}
   */
}

export const testBasicDeltaAssignability = () => {
  /**
   * @type {delta.Delta<{attrs: {x: number, y: number}, text: true, children: number}>}
   */
  const a = delta.create().insert('hi').insert([42]).setAttr('y', 42).done()
  /**
   * @type {delta.Delta<{attrs: {x: number, y: number}, text: true, children: number}>}
   */
  // @ts-expect-error
  const b = delta.create().insert('hi').insert([42]).setAttr('unknown', 42).done()
  /**
   * @type {delta.Delta<{attrs: {x: number, y: number}, text: true, children: string}>}
   */
  // @ts-expect-error
  const c = delta.create().insert('hi').insert([42]).done()
  /**
   * @type {delta.Delta<{attrs: {x: number, y: number}, text: true, children: string}>}
   */
  // @ts-expect-error
  const d = delta.create().insert('hi').setAttr('x', 42).setAttr('x', 'dtrn').done()
  return { a, b, c, d }
}

export const testDeltaBasicCases = () => {
  const $ds = delta.$delta({ name: s.$string, attrs: { k: s.$number, d: delta.$delta({ name: 'sub', text: true }) }, children: s.$number, text: true })
  const ds = delta.create('root', $ds)
  ds.insert('dtrn')
  ds.modifyAttr('d', delta.create('sub', null, 'hi').done())
  ds.apply(delta.create('root', { k: 42 }, [42]))
  ds.apply(delta.create('root', { k: 42 }))
  // @ts-expect-error
  t.fails(() => ds.apply(delta.create('root', { k: 'hi' }, 'content')))
  const d1 = delta.create().insert('hi')
  d1.insert([42]).insert('hi').insert([{ there: 42 }]).insert(['']).insert(['dtrn']).insert('stri').insert('dtruniae')
  d1.setAttr('hi', 'there').setAttr('test', 42).setAttr(42, 43)
  const _tdelta = delta.create().insert('dtrn').insert([42]).insert(['', { q: 42 }]).setAttr('kv', false).setAttr('x', 42) // eslint-disable-line
  delta.$delta({ name: s.$any, attrs: s.$object({ kv: s.$boolean, x: s.$number }), children: s.$union(s.$string, s.$number, s.$object({ q: s.$number })), text: true }).expect(_tdelta)
  console.log(_tdelta)
  // @ts-expect-error
  delta.create().insert('hi').apply(delta.create().insert('there').insert([42]))
  // @ts-expect-error
  delta.create().setAttr('x', 42).apply(delta.create().setAttr('x', '42'))
  // @ts-expect-error
  delta.create().setAttr('x', 42).apply(delta.create().setAttr('y', '42'))
  delta.create().setAttr('x', 42).apply(delta.create().deleteAttr('x'))
  const t2 = delta.create().insert('hi').insert(['there']).setAttr('k', '42').setAttr('k', 42)
  t2.apply(delta.create().insert('there').insert(['??']).setAttr('k', 42))
  const m = delta.create().setAttr('x', 42).setAttr('y', 'str').insert('hi').insert([42])
  m.apply(delta.create().deleteAttr('y').insert('hi'))
}

export const testDeltaAttrAssignability = () => {
  const x1 = delta.create().setAttr('a', 42).setAttr('b', 'dtrn').insert('dtrn').insert([1234, 'dtrn']).setAttr('q', delta.create().setAttr('a', 42))
  x1.apply(delta.create().setAttr('a', 1234).done())
}

export const testDeltaArrayBasics = () => {
  t.group('apply edge cases', () => {
    const d = delta.create().insert('abc')
    d.apply(delta.create().retain(1).delete(1))
    t.compare(d, delta.create().insert('ac'))
  })
}

/**
 * It should be possible to assign delta "subsets" to "supersets", but not the other way around
 */
export const testAssignability = () => {
  t.group('map - prop is a subset of the other', () => {
    /**
     * @type {delta.Delta<{attrs: { a: number }}>}
     */
    let subset = delta.create(delta.$delta({ attrs: s.$object({ a: s.$number }) })).done()
    /**
     * @type {delta.Delta<{attrs: { a: number|string }}>}
     */
    let superset = delta.create(delta.$delta({ attrs: s.$object({ a: s.$union(s.$number, s.$string) }) })).done()
    superset = subset
    // @ts-expect-error
    subset = superset
  })
  t.group('map - map is a subset of the other', () => {
    /**
     * @type {delta.Delta<{attrs: { a: number }}>}
     */
    const d = delta.create(delta.$delta({ attrs: s.$object({ a: s.$number }) })).done()
    /**
     * @type {delta.Delta<{ attrs: { a: number, b: string } }>}
     */
    let m = delta.create(delta.$delta({ attrs: s.$object({ a: s.$number, b: s.$string }) })).done()
    m = d
    return m
  })

  t.group('children - are different', () => {
    /**
     * @type {delta.Delta<{ attrs: {}, children: number }>}
     */
    let a = delta.create(delta.$delta({ children: s.$number })).done()
    /**
     * @type {delta.Delta<{ attrs: {}, children: string }>}
     */
    let b = delta.create(delta.$delta({ children: s.$string })).done()
    // @ts-expect-error
    a = b
    // @ts-expect-error
    b = a
  })
  t.group('children - is a subset of the other', () => {
    /**
     * @type {delta.Delta<{ children: number }>}
     */
    let a = delta.create(delta.$delta({ children: s.$number })).done()
    /**
     * @type {delta.Delta<{ children: number|string }>}
     */
    let b = delta.create(delta.$delta({ children: s.$union(s.$string, s.$number) })).done()
    b = a
    // @ts-expect-error
    a = b
  })
  t.group('children - is a subset of the other - with modify', () => {
    const $child = delta.$delta({ name: s.$literal('string'), attrs: s.$object({ a: s.$number }) })
    /**
     * @type {delta.Delta<{ children: number }>}
     */
    let a = delta.create(delta.$delta({ children: s.$number })).done()
    /**
     * @type {delta.Delta<{ children: number|string|s.Unwrap<$child> }>}
     */
    let b = delta.create(delta.$delta({ children: s.$union(s.$string, s.$number, $child) })).done()
    b = a
    // @ts-expect-error
    a = b
  })
  t.group('children - is a subset of the other - with different modify', () => {
    const $child = delta.$delta({ name: s.$literal('string'), attrs: s.$object({ a: s.$string }), text: false })
    const $child2 = delta.$delta({ name: s.$literal('number'), attrs: s.$object({ a: s.$number }), text: false })
    /**
     * @type {delta.Delta<{ children: s.Unwrap<$child> }>}
     */
    let a = delta.create(delta.$delta({ children: $child })).done()
    /**
     * @type {delta.Delta<{ children: s.Unwrap<$child>|s.Unwrap<$child2> }>}
     */
    let b = delta.create(delta.$delta({ children: s.$union($child, $child2) })).done()
    /**
     * @type {delta.Delta<{ children: s.Unwrap<$child2> }>}
     */
    let c = delta.create(delta.$delta({ children: $child2 })).done()
    // d is a superset of a and b
    let d = delta.create(delta.$delta({ children: delta.$delta({ attrs: s.$object({ a: s.$union(s.$string, s.$number) }) }), text: false })).done()
    b = a
    // @ts-expect-error
    a = b
    // @ts-expect-error different children
    c = a
    d = a
    d = b
    return [a, b, c, d]
  })
  t.group('text+array builder - text and array builder support', () => {
    const $d = delta.$delta({ name: s.$literal('string'), children: s.$number, text: true })
    /**
     * @type {delta.Delta<{ name: 'string', children: number, text: true }>}
     */
    let d = delta.create($d)
    const b1 = delta.create('string', null, 'hi')
    $d.expect(b1)
    const b2 = delta.create('string', null, ['there'])
    // @ts-expect-error
    d = b2
    t.fails(() => {
      // @ts-expect-error
      $d.expect(b2)
    })
    const b3 = delta.create('string', null, 'hi').insert([42])
    d = b3
    $d.expect(b3)
    const b4 = delta.create('string', null, [42])
    d = b4
    $d.expect(b4)
    return [d]
  })
  t.group('Delta children sub and superset', () => {
    /**
     * @type {delta.DeltaAny}
     */
    let deltaAny = delta.create().done()
    let deltaNone = delta.create().done()
    let deltaNoneWithString = delta.create(delta.$delta({ text: true })).done()
    let deltaNoneWithNumberContent = delta.create(delta.$delta({ children: s.$number })).done()
    deltaNone = delta.create()
    deltaAny = delta.create().setAttr('x', 42)
    // @ts-expect-error
    deltaNone = deltaNoneWithString
    // i can assign non-string content to with-string content
    deltaNoneWithString = deltaNone
    deltaNoneWithString = delta.create().insert('hi')
    // @ts-expect-error no numbers allowed
    deltaNoneWithString = delta.create().insert([42]).done()
    // @ts-expect-error no children allowed
    deltaNone = deltaNoneWithNumberContent
    // i can assign non-children content to with-children content
    deltaNoneWithNumberContent = deltaNone
    // @ts-expect-error no strings
    deltaNoneWithNumberContent = delta.create().insert('hi')
    deltaNoneWithNumberContent = delta.create().insert([42]).done()
    // @ts-expect-error because it contains object
    deltaNoneWithNumberContent = delta.create().insert([42]).insert([{}]).done()
    return { deltaAny }
  })
}

export const testText = () => {
  // only allow certain embeds
  const $q = delta.$delta({ text: true, children: s.$object({ m: s.$number }) })
  const q = delta.create($q)
  q.insert('hi')
  q.insert([{ m: 42 }])
  // @ts-expect-error
  q.insert([{ q: 42 }])
  delta.create(delta.$delta({ text: true, children: s.$never }))
    // @ts-expect-error
    .insert([{ m: 42 }])
}

/**
 * @param {t.TestCase} _tc
 */
export const testDelta = _tc => {
  const d = delta.create().insert('hello').insert(' ').useAttributes({ bold: true }).insert('world').useAttribution({ insert: ['tester'] }).insert('!')
  t.compare(d.toJSON(), { type: 'delta', children: [{ type: 'insert', insert: 'hello ' }, { type: 'insert', insert: 'world', format: { bold: true } }, { type: 'insert', insert: '!', format: { bold: true }, attribution: { insert: ['tester'] } }] })
}

/**
 * @param {t.TestCase} _tc
 */
export const testDeltaMerging = _tc => {
  const $d = delta.$delta({ name: s.$string, children: s.$union(s.$number, s.$object({})), text: true })
  const d = delta.create($d)
    .insert('hello')
    .insert('world')
    .insert(' ', { italic: true })
    .insert([{}])
    .insert([1])
    .insert([2])
  t.compare(d.toJSON(), { type: 'delta', children: [{ type: 'insert', insert: 'helloworld' }, { type: 'insert', insert: ' ', format: { italic: true } }, { type: 'insert', insert: [{}, 1, 2] }] })
}

/**
 * @param {t.TestCase} _tc
 */
export const testUseAttributes = _tc => {
  const d = delta.create()
    .insert('a')
    .updateUsedAttributes('bold', true)
    .insert('b')
    .insert('c', { bold: 4 })
    .updateUsedAttributes('bold', null)
    .insert('d')
    .useAttributes({ italic: true })
    .insert('e')
    .useAttributes(null)
    .insert('f')

  const d2 = delta.create()
    .insert('a')
    .insert('b', { bold: true })
    .insert('c', { bold: 4 })
    .insert('d')
    .insert('e', { italic: true })
    .insert('f')
  t.compare(d, d2)
}

/**
 * @param {t.TestCase} _tc
 */
export const testUseAttribution = _tc => {
  const d = delta.create()
    .insert('a')
    .updateUsedAttribution('insert', ['me'])
    .insert('b')
    .insert('c', null, { insert: ['you'] })
    .updateUsedAttribution('insert', null)
    .insert('d')
    .useAttribution({ insert: ['me'] })
    .insert('e')
    .useAttribution(null)
    .insert('f')
  const d2 = delta.create()
    .insert('a')
    .insert('b', null, { insert: ['me'] })
    .insert('c', null, { insert: ['you'] })
    .insert('d')
    .insert('e', null, { insert: ['me'] })
    .insert('f')
  t.compare(d, d2)
}

export const testMapTyping = () => {
  const $q = delta.$delta({ attrs: s.$object({ x: s.$number }) })
  const mmm = delta.create().setAttr('x', 42)
  $q.expect(mmm)
  const mmm2 = delta.create().setAttr('x', 'xx')
  /**
   * @typedef {t.Assert<t.Equal<typeof mmm2, delta.DeltaBuilder<{ attrs: {x:string} }>>>}
   */
  t.fails(() => {
    // @ts-expect-error
    $q.expect(mmm2)
  })
  const q = delta.create($q)
  q.setAttr('x', 42)
  // @ts-expect-error
  q.setAttr('y', 42)
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapDeltaBasics = _tc => {
  const $d = s.$object({
    num: s.$union(s.$number, s.$string),
    str: s.$string
  })
  const dmap = delta.create(delta.$delta({ attrs: $d }))
  t.fails(() => {
    // @ts-expect-error
    dmap.apply(delta.create().setAttr('str', 42))
  })
  dmap.setAttr('str', 'hi')
  for (const c of dmap.attrs) {
    if (c.key === 'str') {
      // @ts-expect-error because value can't be a string
      t.assert(c.value !== 42)
    } else if (c.key === 'num') {
      t.assert(c.value !== 42)
    } else {
      // no other option, this will always throw if called
      s.assert(c, s.$never)
    }
  }
  const x = dmap.attrs.str
  t.assert(delta.$setAttrOpWith(s.$string).optional.check(x) && delta.$setAttrOpWith(s.$string).optional.validate(x))
  t.assert(!delta.$setAttrOpWith(s.$number).optional.check(x))
  t.assert(dmap.attrs.str !== null)
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapDeltaModify = _tc => {
  // Yjs users will create nested Yjs types like this (instead of $mapDelta they would use $yarray):
  const $d = delta.$delta({
    attrs: s.$object({
      num: s.$union(s.$number, s.$string),
      str: s.$string,
      map: delta.$delta({ attrs: s.$object({ x: s.$number }) })
    })
  })
  const $dsmaller = delta.$delta({ attrs: s.$object({ str: s.$string }) })
  t.group('test extensibility', () => {
    // observeDeep needs to transform this to a modifyOp, while preserving tying
    const d = delta.create().setAttr('num', 42)
    t.assert($d.check(d))
    t.assert($dsmaller.check(d))
    t.assert($d.check(delta.create().setAttr('x', 99))) // this should work, since this is a unknown property
    t.assert(!$d.check(delta.create().setAttr('str', 99))) // this shoul fail, since str is supposed to be a string
  })
  t.group('test delta insert', () => {
    const d = delta.create($d)
    const testDeleteThis = delta.create(delta.$delta({ attrs: s.$object({ x: s.$number }) })).setAttr('x', 42)
    d.setAttr('map', testDeleteThis)
    for (const change of d.attrs) {
      if (change.key === 'map' && change.type === 'insert') {
        delta.$delta({ attrs: s.$object({ x: s.$number }) }).validate(change.value)
      } else {
        error.unexpectedCase()
      }
    }
  })
  t.group('test modify', () => {
    const d = delta.create($d)
    d.modifyAttr('map', delta.create().deleteAttr('x'))
    for (const change of d.attrs) {
      if (change.key === 'map' && change.type === 'modify') {
        delta.$delta({ attrs: s.$object({ x: s.$number }) }).validate(change.value)
      } else {
        error.unexpectedCase()
      }
    }
  })
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapDelta = _tc => {
  const x = delta.$delta({
    attrs: s.$object({
      key: s.$string,
      v: s.$number,
      over: s.$string
    })
  })
  const d = delta.create(x)
    .deleteAttr('over')
    .setAttr('key', 'value')
    .useAttribution({ delete: ['me'] })
    .deleteAttr('v')
    .useAttribution(null)
    .setAttr('over', 'andout')

  t.compare(d.toJSON(), {
    type: 'delta',
    attrs: {
      key: { type: 'insert', value: 'value' },
      v: { type: 'delete', attribution: { delete: ['me'] } },
      over: { type: 'insert', value: 'andout' }
    }
  })
  t.compare(d.origin, null)
  for (const change of d.attrs) {
    if (change.key === 'v') {
      t.assert(d.attrs[change.key]?.prevValue !== 94) // should know that value is number
      if (delta.$setAttrOp.check(change)) {
        // @ts-expect-error
        t.assert(change.value !== '')
        t.assert(change.value === undefined)
      } else if (delta.$deleteAttrOp.check(change)) {
        t.assert(change.value === undefined)
      } else {
        t.fail('should be an insert op')
      }
    } else if (change.key === 'key') {
      if (change.type === 'insert') {
        t.assert(change.prevValue !== 'test')
        // @ts-expect-error should know that prevValue is not a string
        t.assert(change.prevValue !== 42)
      }
      t.assert(d.attrs[change.key]?.value === 'value') // show know that value is a string
      t.assert(change.value === 'value')
    } else if (change.key === 'over') {
      t.assert(change.value === 'andout')
    } else {
      throw new Error()
    }
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRebaseMergeDeltas = tc => {
  const $d = delta.$delta({ attrs: s.$object({ a: s.$number, b: delta.$delta({ attrs: s.$object({ x: s.$string }) }) }) })
  const gen = tc.prng
  const createDelta = () => {
    const d = delta.create($d)
    prng.oneOf(gen, [
      // create insert
      () => {
        if (prng.bool(gen)) {
          // write 'a'
          d.setAttr('a', prng.int32(gen, 0, 365))
        } else if (prng.bool(gen)) {
          // 25% chance to create an insertion on 'b'
          d.setAttr('b', delta.create().setAttr('x', prng.utf16String(gen)))
        } else {
          // 25% chance to create a modify op on 'b'
          d.modifyAttr('b', delta.create().setAttr('x', prng.utf16String(gen)))
        }
      },
      // create delete
      () => {
        if (prng.bool(gen)) {
          d.deleteAttr('a')
        } else {
          d.deleteAttr('b')
        }
      }
    ])()
    return d
  }
  const da = createDelta()
  da.origin = 1
  const db = createDelta()
  db.origin = 2
  const dc = createDelta()
  dc.origin = 3

  const order1 = [da, db, dc].map(delta.clone)
  const order2 = [dc, db, da].map(delta.clone)
  /**
   * @param {Array<s.Unwrap<$d>>} ops
   */
  const rebase = (ops) => {
    for (let i = 1; i < ops.length; i++) {
      for (let j = 0; j < i; j++) {
        /** @type {delta.DeltaBuilder} */ (ops[i]).rebase(ops[j], ops[i].origin < ops[j].origin)
      }
    }
  }
  rebase(order1)
  rebase(order2)
  /**
   * @param {Array<s.Unwrap<typeof $d>>} ops
   */
  const apply = ops => {
    const d = delta.create($d)
    for (let i = 0; i < ops.length; i++) {
      d.apply(ops[i])
    }
    return d
  }
  const dmerged1 = apply(order1)
  const dmerged2 = apply(order2)
  console.log('1', JSON.stringify(dmerged1))
  console.log('2', JSON.stringify(dmerged2))
  t.compare(dmerged1, dmerged2)
}

/**
 * @param {t.TestCase} _tc
 */
export const testNodeDelta = _tc => {
  const $d = delta.$delta({ name: s.$string, attrs: s.$object({ a: s.$number }), children: s.$string })
  const d = delta.create('test', $d)
  d.insert(['hi'])
  // @ts-expect-error
  d.insert([42])
  // @ts-expect-error
  d.insert('hi')
  d.setAttr('a', 1)
  d.deleteAttr('a')
  /**
   * @type {Array<Array<string|number>| string | number>}
   */
  const arr = []
  d.children.forEach(
    (op) => {
      if (delta.$insertOp.check(op)) {
        arr.push(op.insert)
      }
    }
  )
  t.compare(arr, [['hi', 42]])
  /**
   * @type {any}
   */
  const attrs = []
  for (const attr of d.attrs) {
    t.assert(attr.key === 'a')
    attrs.push(attr.key, attr.value)
  }
  t.compare(attrs, ['a', undefined])
}

export const testRecursiveNode = () => {
  const $d = delta.$delta({ name: 'hi', attrs: { q: s.$number }, text: true, recursiveChildren: true })
  const rd = delta.create($d)
  // should allow inserting deltas
  const recC = delta.create('hi', { q: 342 })
  rd.insert([recC])
  const d = delta.create('hi', { q: 42 })
  $d.expect(d)
  // should detect invalid attrs
  // @ts-expect-error
  t.assert(!$d.validate(delta.create('hi', { q: 'fortytwo' })))
  // should detect invalid child (of type string)
  // @ts-expect-error
  t.assert(!$d.validate(delta.create('hi', { q: 42 }, ['dtrn'])))
  // should allow adding valid children (of type $d)
  const p = delta.create('hi', { q: 42 }, [d])
  t.assert($d.validate(p))
  // should allow adding text
  t.assert($d.validate(delta.create('hi', { q: 42 }, 'hi')))
}

export const testSimplifiedDeltaSchemaDefinition = () => {
  const $d = delta.$delta({ name: 'div', attrs: { a: s.$number, b: s.$string.optional, unknown: s.$string }, children: [s.$number], text: true })
  t.assert($d.check(delta.create('div', { a: 42 }).insert([42]).insert('str')))
  t.assert(!$d.check(delta.create('dove', { a: 42 }).insert([42]).insert('str')))
}

export const testDiffing = () => {
  const $d = delta.$delta({ name: 'div', attrs: { key: s.$number, b: s.$string, unknown: s.$string }, children: [s.$number], text: true })
  const d1 = delta.create($d).insert([1]).insert('hello').insert([2]).setAttr('key', 42).setAttr('unknown', 'unknown').done()
  const d2 = delta.create($d).insert('hello').setAttr('key', 1).done()
  const d = delta.diff(d1, d2)
  t.compare(d.done(), delta.create().delete(1).retain(1).delete(1).setAttr('key', 1).deleteAttr('unknown').done())
}

export const testDiffingCommonPreSuffix = () => {
  const $d = delta.$delta({ name: 'div', children: [s.$number], text: true })
  const d1 = delta.create($d).insert([1, 2]).insert('aa').insert([3, 4])
  const d2 = delta.create($d).insert([1, 2]).insert('a').insert([3, 4])
  const d = delta.diff(d1, d2).done()
  t.compare(d, delta.create().retain(3).delete(1))
}

export const testSlice = () => {
  const d1 = delta.slice(delta.create().insert('abcde'), 1, 3)
  t.assert(d1.equals(delta.create().insert('bc')))
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomListDiff = tc => {
  const $d = delta.$delta({ children: s.$number })
  const d1 = delta.random(tc.prng, $d)
  const d2 = delta.random(tc.prng, $d)
  $d.expect(d1)
  $d.expect(d2)
  const d = delta.diff(d1, d2)
  d1.apply(d)
  t.compare(d1, d2)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomMapDiff = tc => {
  const $d = delta.$delta({ name: 'list', attrs: { a: s.$string, b: s.$number } })
  const d1 = delta.random(tc.prng, $d)
  const d2 = delta.random(tc.prng, $d)
  $d.expect(d1)
  $d.expect(d2)
  const d = delta.diff(d1, d2)
  d1.apply(d)
  t.compare(d1, d2)
}

/**
 * @param {t.TestCase} _tc
 */
export const testDeltaAppend = _tc => {
  const $d = delta.$delta({ children: s.$number, text: true })
  const other = delta.create().insert('b').insert([1, 2])
  const _d = delta.create().insert('a')
  const d = _d.append(other)
  $d.expect(d)
}

export const testDeltaDiffWithFormatting = () => {
  const d1 = delta.create().insert('hello world!')
  const d2 = delta.create().insert('hello ').insert('world', { bold: true }).insert('!')
  const diff = delta.diff(d1, d2)
  t.compare(diff.done(), delta.create().retain(6).retain(5, { bold: true }))
}

export const testDeltaDiffWithFormatting2 = () => {
  const d1 = delta.create().insert('hello!')
  const d2 = delta.create().insert('hello ').insert('world', { bold: true }).insert('!')
  const diff = delta.diff(d1, d2)
  t.compare(diff, delta.create().retain(5).insert(' ').insert('world', { bold: true }))
}

export const testDeltaDiffIssue1 = () => {
  const stateA = delta.create().insert([delta.create('paragraph').set('ychange', null).insert('ABCDEFGHIJKLMNOPQRSTUVWXYZ')])
  const stateB = delta.create().insert([delta.create('paragraph').set('ychange', null).insert('ABCDE123FGHIJKLMNOPQRSTUVWXYZ2sawfa')])
  const expectedDiff = delta.create().modify(delta.create().retain(5).insert('123').retain(21).insert('2sawfa'))
  const diffResult = delta.diff(stateA, stateB)
  const synced = delta.clone(stateA).apply(diffResult)
  t.assert(synced.equals(stateB))
  t.assert(expectedDiff.equals(diffResult))
}

// TEST TYPINGS

/**
 * @template {delta.ChildrenOpAny} OP
 * @typedef {OP} IsDeltaOpAny
 */

export const testDeltaTypings = () => {
  const q = /** @type {delta.DeltaAny} */ (delta.create())
  /**
   * @type {import('../list.js').List<delta.RetainOp|delta.TextOp|delta.ModifyOp<any>|delta.DeleteOp<any>|delta.InsertOp<any>>}
   */
  const m = q.children
  return { m }
}

/**
 * @typedef {IsDeltaOpAny<delta.TextOp>} DeltaOpTestAnyTextOp
 */
/**
 * @typedef {IsDeltaOpAny<delta.InsertOp<number>>} DeltaOpTestAnyInsertOp
 */
/**
 * @typedef {IsDeltaOpAny<delta.DeleteOp<{children:number}>>} DeltaOpTestAnyDeleteOp
 */
/**
 * @typedef {IsDeltaOpAny<delta.DeleteOp<{text:true}>>} DeltaOpTestAnyDeleteOp2
 */

export const testDeltaDiffIssue1 = () => {
  const stateA = delta.create().insert([delta.create('paragraph').setAttr('ychange', null).insert('ABCDEFGHIJKLMNOPQRSTUVWXYZ')])
  const stateB = delta.create().insert([delta.create('paragraph').setAttr('ychange', null).insert('ABCDE123FGHIJKLMNOPQRSTUVWXYZ2sawfa')])
  const expectedDiff = delta.create().modify(delta.create().retain(5).insert('123').retain(21).insert('2sawfa'))
  const diffResult = delta.diff(stateA, stateB)
  const synced = delta.clone(stateA).apply(diffResult)
  t.assert(synced.equals(stateB))
  t.assert(expectedDiff.equals(diffResult))
}
