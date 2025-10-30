import * as t from 'lib0/testing'
import * as s from 'lib0/schema'
import * as delta from './d2.js'
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
  const change = delta.create().set('a', 42).unset('b').retain(5).delete(6).insert('!').insert([{ my: 'custom object' }])
  // iterate through attribute changes
  for (const attrChange of change.attrs) {
    if (delta.$insertOp.check(attrChange)) {
      console.log(`set ${attrChange.key} to ${attrChange.value}`)
    } else if (delta.$deleteOp.check(attrChange)) {
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
}

export const testDeltaBasicCases = () => {
  const $ds = delta.$delta({ name: s.$string, attrs: s.$object({ k: s.$number, d: delta.$delta({ name: s.$literal('sub'), attrs: s.$object({ }), hasText: true }) }), children: s.$number, hasText: true })
  const ds = delta.create('root', $ds)
  ds.insert('dtrn')
  ds.update('d', delta.create('sub', null, 'hi'))
  ds.apply(delta.create('root', { k: 42 }, [42]))
  ds.apply(delta.create('root', { k: 42 }))
  // @ts-expect-error
  t.fails(() => ds.apply(delta.create('root', { k: 'hi' }, 'content')))
  const d1 = delta.create().insert('hi')
  d1.insert([42]).insert('hi').insert([{ there: 42 }]).insert(['']).insert(['dtrn']).insert('stri').insert('dtruniae')
  d1.set('hi', 'there').set('test', 42).set(42, 43)
  const _tdelta = delta.create().insert('dtrn').insert([42]).insert(['', { q: 42 }]).set('kv', false).set('x', 42) // eslint-disable-line
  delta.$delta({ name: s.$any, attrs: s.$object({ kv: s.$boolean, x: s.$number }), children: s.$union(s.$string, s.$number, s.$object({ q: s.$number })), hasText: true }).expect(_tdelta)
  console.log(_tdelta)
  // @ts-expect-error
  delta.create().insert('hi').apply(delta.create().insert('there').insert([42]))
  // @ts-expect-error
  delta.create().set('x', 42).apply(delta.create().set('x', '42'))
  // @ts-expect-error
  delta.create().set('x', 42).apply(delta.create().set('y', '42'))
  delta.create().set('x', 42).apply(delta.create().unset('x'))
  const t2 = delta.create().insert('hi').insert(['there']).set('k', '42').set('k', 42)
  t2.apply(delta.create().insert('there').insert(['??']).set('k', 42))
  const m = delta.create().set('x', 42).set('y', 'str').insert('hi').insert([42])
  m.apply(delta.create().unset('y').insert('hi'))
  m.set('k', m).update('k', m)
}

/**
 * It should be possible to assign delta "subsets" to "supersets", but not the other way around
 */
export const testAssignability = () => {
  t.group('map - prop is a subset of the other', () => {
    /**
     * @type {delta.Delta<any,{ a: number },any,any,any>}
     */
    let subset = delta.create(delta.$delta({ attrs: s.$object({ a: s.$number }) })).done()
    /**
     * @type {delta.Delta<any,{ a: number|string },any,any,any>}
     */
    let superset = delta.create(delta.$delta({ attrs: s.$object({ a: s.$union(s.$number, s.$string) }) })).done()
    superset = subset
    // @ts-expect-error
    subset = superset
  })
  t.group('map - map is a subset of the other', () => {
    /**
     * @type {delta.Delta<any,{ a: number },any,any,any>}
     */
    const d = delta.create(delta.$delta({ attrs: s.$object({ a: s.$number }) })).done()
    /**
     * @type {delta.Delta<any,{ a: number, b: string },any,any,any>}
     */
    let m = delta.create(delta.$delta({ attrs: s.$object({ a: s.$number, b: s.$string }) })).done()
    m = d
    return m
  })

  t.group('children - are different', () => {
    /**
     * @type {delta.Delta<any,{},number,any,any>}
     */
    let a = delta.create(delta.$delta({ children: s.$number })).done()
    /**
     * @type {delta.Delta<any,{},string,any,any>}
     */
    let b = delta.create(delta.$delta({ children: s.$string })).done()
    // @ts-expect-error
    a = b
    // @ts-expect-error
    b = a
  })
  t.group('children - is a subset of the other', () => {
    /**
     * @type {delta.Delta<any,{},number,any,any>}
     */
    let a = delta.create(delta.$delta({ children: s.$number })).done()
    /**
     * @type {delta.Delta<any,{},number|string,any,any>}
     */
    let b = delta.create(delta.$delta({ children: s.$union(s.$string, s.$number) })).done()
    b = a
    // @ts-expect-error
    a = b
  })
  t.group('children - is a subset of the other - with modify', () => {
    const $child = delta.$delta({ name: s.$literal('string'), attrs: s.$object({ a: s.$number }) })
    /**
     * @type {delta.Delta<any,{},number,any,any>}
     */
    let a = delta.create(delta.$delta({ children: s.$number })).done()
    /**
     * @type {delta.Delta<any,{},number|string|s.Unwrap<$child>,any,any>}
     */
    let b = delta.create(delta.$delta({ children: s.$union(s.$string, s.$number, $child) })).done()
    b = a
    // @ts-expect-error
    a = b
  })
  t.group('children - is a subset of the other - with different modify', () => {
    const $child = delta.$delta({ name: s.$literal('string'), attrs: s.$object({ a: s.$string }), hasText: false })
    const $child2 = delta.$delta({ name: s.$literal('number'), attrs: s.$object({ a: s.$number }), hasText: false })
    /**
     * @type {delta.Delta<any,{},s.Unwrap<$child>,never,any>}
     */
    let a = delta.create(delta.$delta({ children: $child })).done()
    /**
     * @type {delta.Delta<any,{},s.Unwrap<$child>|s.Unwrap<$child2>,never,any>}
     */
    let b = delta.create(delta.$delta({ children: s.$union($child, $child2) })).done()
    /**
     * @type {delta.Delta<any,{},s.Unwrap<$child2>,never,any>}
     */
    let c = delta.create(delta.$delta({ children: $child2 })).done()
    // d is a superset of a and b
    let d = delta.create(delta.$delta({ children: delta.$delta({ attrs: s.$object({ a: s.$union(s.$string, s.$number) }) }), hasText: false })).done()
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
    const $d = delta.$delta({ name: s.$literal('string'), children: s.$number, hasText: true })
    /**
     * @type {delta.Delta<'string', {}, number, string>}
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
  // @todo
  // val subset
  // string subset
  // DeltaAny is greates set
  // Default Delta is smallest set
}

export const testText = () => {
  // only allow certain embeds
  const $q = delta.$text(s.$object({ m: s.$number }))
  const q = delta.text($q)
  q.insert('hi')
  q.insert([{ m: 42 }])
  // @ts-expect-error
  q.insert([{ q: 42 }])
  delta.text()
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
  const $d = delta.$delta({ name: s.$string, children: s.$union(s.$number, s.$object({})), hasText: true })
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
  const $q = delta.$map(s.$object({ x: s.$number }))
  const mmm = delta.map().set('x', 42)
  $q.expect(mmm)
  const mmm2 = delta.map().set('x', 'xx')
  t.fails(() => {
    // @ts-expect-error
    $q.expect(mmm2)
  })
  const q = delta.map($q)
  q.set('x', 42)
  // @ts-expect-error
  q.set('y', 42)
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
    dmap.apply(delta.create().set('str', 42))
  })
  dmap.set('str', 'hi')
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
  t.assert(delta.$insertOpWith(s.$string).optional.check(x) && delta.$insertOpWith(s.$string).optional.validate(x))
  t.assert(!delta.$insertOpWith(s.$number).optional.check(x))
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
    const d = delta.create().set('num', 42)
    t.assert($d.check(d))
    t.assert($dsmaller.check(d))
    t.assert($d.check(delta.create().set('x', 99))) // this should work, since this is a unknown property
    t.assert(!$d.check(delta.create().set('str', 99))) // this shoul fail, since str is supposed to be a string
  })
  t.group('test delta insert', () => {
    const d = delta.create($d)
    const testDeleteThis = delta.create(delta.$delta({ attrs: s.$object({ x: s.$number }) })).set('x', 42)
    d.set('map', testDeleteThis)
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
    d.update('map', delta.create().unset('x'))
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
    .unset('over')
    .set('key', 'value')
    .useAttribution({ delete: ['me'] })
    .unset('v')
    .useAttribution(null)
    .set('over', 'andout')

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
      if (delta.$insertOp.check(change)) {
        // @ts-expect-error
        t.assert(change.value !== '')
        t.assert(change.value === undefined)
      } else if (delta.$deleteOp.check(change)) {
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
          d.set('a', prng.int32(gen, 0, 365))
        } else if (prng.bool(gen)) {
          // 25% chance to create an insertion on 'b'
          d.set('b', delta.create().set('x', prng.utf16String(gen)))
        } else {
          // 25% chance to create a modify op on 'b'
          d.update('b', delta.create().set('x', prng.utf16String(gen)))
        }
      },
      // create delete
      () => {
        if (prng.bool(gen)) {
          d.unset('a')
        } else {
          d.unset('b')
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

  const order1 = [da.clone(), db.clone(), dc.clone()]
  const order2 = [dc.clone(), db.clone(), da.clone()]
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
  d.set('a', 1)
  d.unset('a')
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
  const $d = delta.$delta({ name: s.$string, attrs: s.$object({ q: s.$number }), hasText: true, recursive: true })
  // @ts-ignore this works once the tsc files are declared
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
