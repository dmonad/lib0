import * as t from 'lib0/testing'
import * as s from 'lib0/schema'
import * as delta from './delta.js'
import * as position from './position.js'
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
 * `apply(other, { move: true })` re-parents `other`'s ops into the target instead of cloning them.
 * The merged result must equal the default (cloning) apply, and a moved op must be the *same* object.
 *
 * @param {t.TestCase} _tc
 */
export const testApplyMove = _tc => {
  // build a change hitting every moved op site: set-attr, modify-attr, insert-text, insert-embed, modify
  const build = () => delta.create()
    .setAttr('a', 42)
    .modifyAttr('m', delta.create('sub', null, 'hi').done())
    .insert('text')
    .insert([7])
    .modify(delta.create('sub', null, 'x').done())
  // empty target typed `any`: it receives confs it was not statically built for
  const emptyTarget = () => /** @type {any} */ (delta.create())
  // move == clone equivalence
  const moved = emptyTarget().apply(build(), { move: true })
  const cloned = emptyTarget().apply(build())
  t.assert(moved.equals(cloned), 'move apply equals clone apply')
  // deleteAttr (non-final) is moved too
  t.assert(emptyTarget().apply(delta.create().deleteAttr('z'), { move: true })
    .equals(delta.create().deleteAttr('z')), 'moved deleteAttr matches')
  // modify landing on a retain target (the modify replaces one retained position) is moved too
  const modChange = () => delta.create().modify(delta.create('s', null, 'y').done())
  t.assert(emptyTarget().retain(2).apply(modChange(), { move: true })
    .equals(emptyTarget().retain(2).apply(modChange())), 'moved modify-onto-retain matches')

  // identity guard: the moved attr op is the *same* object in the target (clone was skipped)
  const srcAttr = delta.create().setAttr('k', 1)
  const attrOp = srcAttr.attrs.k
  t.assert(emptyTarget().apply(srcAttr, { move: true }).attrs.k === attrOp, 'attr op moved, not cloned')
  // identity guard for an inserted child op
  const srcInsert = delta.create().insert([9])
  const insOp = srcInsert.children.start
  t.assert(emptyTarget().apply(srcInsert, { move: true }).children.start === insOp, 'insert op moved, not cloned')
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
  const $ds = delta.$delta({ name: s.$string, attrs: { k: s.$number, d: delta.$delta('sub', { text: true }) }, children: s.$number, text: true })
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

/**
 * Focusing on attrs
 */
export const testDeltaBasicCases2 = () => {
  const $dattrs = s.$record(s.$string, s.$number)
  const $d = delta.$delta({ attrs: $dattrs })
  const d = delta.create($d)
  d.setAttr('a', 42)
  // @ts-expect-error
  d.setAttr('a', 'b')
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
    const $child = delta.$delta('string', { attrs: s.$object({ a: s.$number }) })
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
    const $child = delta.$delta('string', { attrs: s.$object({ a: s.$string }), text: false })
    const $child2 = delta.$delta('number', { attrs: s.$object({ a: s.$number }), text: false })
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
    const $d = delta.$delta('string', { children: s.$number, text: true })
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
  const d = delta.create().insert('hello').insert(' ').useFormats({ bold: true }).insert('world').useAttribution({ insert: ['tester'] }).insert('!')
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
export const testUseFormats = _tc => {
  const d = delta.create()
    .insert('a')
    .updateUsedFormats('bold', true)
    .insert('b')
    .insert('c', { bold: 4 })
    .updateUsedFormats('bold', null)
    .insert('d')
    .useFormats({ italic: true })
    .insert('e')
    .useFormats(null)
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

export const testRebaseBasic = () => {
  const d1 = delta.create().retain(5).delete(6)
  const d2 = delta.create().retain(11).insert('!')
  const rebased = d2.rebase(d1, false)
  console.log({
    d1: JSON.stringify(d1.toJSON()),
    d2: JSON.stringify(d2.toJSON()),
    rebased: JSON.stringify(rebased.toJSON())
  })
  t.compare(rebased, delta.create().retain(5).insert('!'))
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
  const $d = delta.$delta('hi', { attrs: { q: s.$number }, text: true, recursiveChildren: true })
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
  const $d = delta.$delta('div', { attrs: { a: s.$number, b: s.$string.optional, unknown: s.$string }, children: [s.$number], text: true })
  t.assert($d.check(delta.create('div', { a: 42 }).insert([42]).insert('str')))
  t.assert(!$d.check(delta.create('dove', { a: 42 }).insert([42]).insert('str')))
}

export const testDiffing = () => {
  const $d = delta.$delta('div', { attrs: { key: s.$number, b: s.$string, unknown: s.$string }, children: [s.$number], text: true })
  const d1 = delta.create($d).insert([1]).insert('hello').insert([2]).setAttr('key', 42).setAttr('unknown', 'unknown').done()
  const d2 = delta.create($d).insert('hello').setAttr('key', 1).done()
  const d = delta.diff(d1, d2)
  t.compare(d.done(), delta.create().delete(1).retain(5).delete(1).setAttr('key', 1).deleteAttr('unknown').done())
}

export const testDiffingCommonPreSuffix = () => {
  const $d = delta.$delta('div', { children: [s.$number], text: true })
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
  const d1 = delta.random(tc.prng, $d, { attribution: true })
  const d2 = delta.random(tc.prng, $d, { attribution: true })
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
  const $d = delta.$delta('list', { attrs: { a: s.$string, b: s.$number } })
  const d1 = delta.random(tc.prng, $d, { attribution: true })
  const d2 = delta.random(tc.prng, $d, { attribution: true })
  d1.isFinal = true
  d2.isFinal = true
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

export const testDeltaDiff1 = () => {
  const stateA = delta.create().insert([delta.create('paragraph').setAttr('ychange', null).insert('ABCDEFGHIJKLMNOPQRSTUVWXYZ')])
  const stateB = delta.create().insert([delta.create('paragraph').setAttr('ychange', null).insert('ABCDE123FGHIJKLMNOPQRSTUVWXYZ2sawfa')])
  const expectedDiff = delta.create().modify(delta.create('paragraph').retain(5).insert('123').retain(21).insert('2sawfa'))
  const diffResult = delta.diff(stateA, stateB)
  const synced = delta.clone(stateA).apply(diffResult)
  t.assert(synced.equals(stateB))
  t.assert(expectedDiff.equals(diffResult))
}

/**
 * `diff` decides child pairing via `options.compare`, which defaults to a name comparison. A
 * stricter predicate (here: name AND first child must match) causes nodes that don't satisfy it to
 * be replaced wholesale instead of paired into a `modify`.
 */
export const testDiffCompareGranularity = () => {
  // pair only when name AND first child match
  const compare = (/** @type {delta.DeltaAny} */ a, /** @type {delta.DeltaAny} */ b) =>
    a.name === b.name && a.children.start?.fingerprint === b.children.start?.fingerprint

  // two paragraphs share the name 'paragraph' but differ in their first child ('alpha' vs 'beta')
  const stateA = delta.create().insert([delta.create('paragraph').insert('alpha').insert(' tail')])
  const stateB = delta.create().insert([delta.create('paragraph').insert('beta').insert(' tail')])

  // default: same name → paired → single modify op
  const defaultDiff = delta.diff(stateA, stateB)
  t.assert(delta.$modifyOp.check(defaultDiff.children.start), 'default compare pairs same-name children into a modify')
  t.assert(delta.clone(stateA).apply(defaultDiff).equals(stateB), 'default diff roundtrips')

  // strict: first children differ → not paired → wholesale replace (delete + insert)
  const strictDiff = delta.diff(stateA, stateB, { compare })
  t.assert(delta.$deleteOp.check(strictDiff.children.start), 'strict compare replaces wholesale → starts with a delete')
  t.assert(delta.clone(stateA).apply(strictDiff).equals(stateB), 'strict diff roundtrips')
  let hasModify = false
  for (let op = strictDiff.children.start; op != null; op = op.next) { hasModify ||= delta.$modifyOp.check(op) }
  t.assert(!hasModify, 'strict diff contains no modify op')
}

/**
 * `compare` is forwarded to every child diff, so the chosen granularity applies all the way down
 * the tree. Here the top-level rows pair under both predicates (same name AND same first child),
 * but their grandchild cells share a name while differing in their first child — so only a forwarded
 * `compare` can change the diff at that nested level.
 */
export const testDiffCompareForwardedToChildren = () => {
  const compare = (/** @type {delta.DeltaAny} */ a, /** @type {delta.DeltaAny} */ b) =>
    a.name === b.name && a.children.start?.fingerprint === b.children.start?.fingerprint

  // rows: same name + same first child ('mark') → paired at the top level under either predicate.
  // cells: same name 'cell' but first children differ ('x' vs 'y') → only strict `compare` replaces.
  const stateA = delta.create().insert([delta.create('row').insert('mark').insert([delta.create('cell').insert('x')])])
  const stateB = delta.create().insert([delta.create('row').insert('mark').insert([delta.create('cell').insert('y')])])

  const defaultDiff = delta.diff(stateA, stateB)
  const strictDiff = delta.diff(stateA, stateB, { compare })

  // both roundtrip correctly...
  t.assert(delta.clone(stateA).apply(defaultDiff).equals(stateB), 'default diff roundtrips')
  t.assert(delta.clone(stateA).apply(strictDiff).equals(stateB), 'strict diff roundtrips')
  // ...and both pair the rows at the top level (a modify op)...
  t.assert(delta.$modifyOp.check(defaultDiff.children.start), 'default: top-level row paired')
  t.assert(delta.$modifyOp.check(strictDiff.children.start), 'strict: top-level row still paired')
  // ...but the diffs differ — proving `compare` reached the nested cell and changed its pairing.
  t.assert(!strictDiff.equals(defaultDiff), 'forwarded compare changes the diff at the nested level')
}

/**
 * Minimal repro for `lib0/delta`'s `diff` losing node-level format
 * changes when it converts an `insert` into a `modify`.
 *
 * `a` and `b` both have one paragraph child but differ in two ways:
 *   1. Children: paragraph text "hello world" vs "hello".
 *   2. Parent format on the insert op: `{x: 1}` vs none.
 *
 * Because the paragraph's identity is preserved (same name, same
 * position), the diff turns the insert into a `modify` op describing
 * only the children-level change ("delete ' world'"). The parent-level
 * `format` change is dropped: the resulting `modify` op carries no
 * `format: null` instruction.
 */
export const testDiffNodeLevelFormatOnModify = () => {
  const a = delta.create()
    .insert([delta.create('paragraph', {}, 'hello world')], { x: 1 })
    .done()
  const b = delta.create()
    .insert([delta.create('paragraph', {}, 'hello')])
    .done()
  const diff = delta.diff(a, b)
  // The diff must address BOTH the children change and the parent
  // format change. Today it produces a `modify` with the children
  // delete but no format-removal instruction, so this assertion fails.
  const diffStr = JSON.stringify(diff)
  t.assert(
    diffStr.includes('"x":null') || diffStr.includes('"format":null'),
    'diff should encode the removal of the parent-level format `x`'
  )
  // and applying the diff to a must yield b
  const synced = delta.clone(a).apply(diff)
  t.assert(synced.equals(b), 'a.apply(diff(a, b)) must equal b')
}

/**
 * `apply(diff, { final: true })` does not propagate `final` through
 * the `modifyAttr` recursion.
 *
 * The outer delta has an attribute `q` whose value is itself a delta
 * with sub-attribute `weight: 'bold'`. `b` removes that sub-attribute.
 * `diff` correctly produces a `modifyAttr` op whose nested value
 * carries a `deleteAttr` for `weight`. But applying with `final: true`
 * still leaves a `DeleteAttrOp` on the nested attrs map:
 *
 *   delta.js (apply attrs):
 *     if ($modifyAttrOp.check(op)) {
 *       if ($deltaAny.check(c?.value)) {
 *         c._modValue.apply(op.value)         // ← `final` not forwarded
 *       } ...
 *     }
 *
 * Compare with the children path (`$modifyOp.check(op)` branch), which
 * does forward `final` on the recursive `apply` calls.
 */
export const testDiffModifyAttrFinalPropagation = () => {
  const a = delta.create('div')
    .setAttr('q', delta.create('span', { weight: 'bold' }, 'hi'))
    .done()
  const b = delta.create('div')
    .setAttr('q', delta.create('span', {}, 'hi'))
    .done()
  const synced = delta.clone(a).apply(delta.diff(a, b), { final: true })
  t.assert(synced.equals(b), 'final must propagate through modifyAttr recursion')
}

export const testDeltaDiff2 = () => {
  const stateA = delta.create().insert('hello world\n\nthis ')
  const stateB = delta.create().insert('hello world!\n\nth is')
  // const expectedDiff = delta.create().retain(11).insert('!').retain(4).insert(' ').retain(2).delete(1)
  const diffResult = delta.diff(stateA, stateB)
  const synced = delta.clone(stateA).apply(diffResult)
  t.assert(synced.equals(stateB))
}

export const testDeltaMapDiff = () => {
  const stateA = delta.create('div').setAttr('key', delta.create('p', {}, 'some text'))
  const stateB = delta.create('div').setAttr('key', delta.create('p', {}, 'just text'))
  const diffResult = delta.diff(stateA, stateB)
  const synced = delta.clone(stateA).apply(diffResult)
  t.assert(synced.equals(stateB))
  t.assert(delta.$modifyAttrOp.check(diffResult.attrs.key))
  t.assert(diffResult.name === 'div')
  t.assert(diffResult.attrs.key?.value?.name === 'p')
}

export const testDeltaFormattingApply = () => {
  const start = delta.create().retain(11).delete(1)
  const formatting = delta.create().retain(2).retain(3, { a: null })
  start.apply(formatting)
  const expected = delta.create().retain(2).retain(3, { a: null }).retain(6).delete(1)
  t.compare(start, expected)
}

export const testDeltaFormattingComparability = () => {
  const d1 = delta.create().insert('a', {}).retain(2, {}).modify(delta.create(), {}).insert([1], {})
  const d2 = delta.create().insert('a').retain(2).modify(delta.create()).insert([1])
  // semantically the same
  t.compare(d1, d2)
}

/**
 * Formatting & attribution semantics — one unified tri-state for a `retain`/`modify`/`*Attr` update value
 * (`format` and `attribution` behave identically):
 *
 * - `undefined` / omitted => skip (leave the dimension unchanged)
 * - `null`                => clear all keys
 * - `{}`                  => no-op (merge nothing)
 * - `{[k]: v}`            => set key k
 * - `{[k]: null}`         => remove key k
 *
 * A `retain`/`modify` op stores the instruction verbatim (`undefined`/`null`/object); a settled
 * `insert`/`text`/attr op stores resolved data (object or `null`/none).
 */
export const testDeltaRemoveFormatOp = () => {
  // `null` (clear) is a real change op kept by done(); on either dimension
  const rFormatClear = delta.create().retain(1, null).done()
  const rAttrClear = delta.create().retain(1, undefined, null).done()
  t.assert(rFormatClear.children.start != null && rFormatClear.children.start === rFormatClear.children.end, 'format clear is a kept change op')
  t.assert(rAttrClear.children.start != null && rAttrClear.children.start === rAttrClear.children.end, 'attribution clear is a kept change op')
  // `{}` / omitted are no-ops: positional retains merge and the whole tail is trimmed by done()
  const rNoop = delta.create().retain(1).retain(1, {}).done()
  t.assert(rNoop.children.start == null, '{} and omitted retains merge and are trimmed')
}

export const testDeltaFormattingDiff = () => {
  const da = delta.create().insert('abc abc abc')
  const db = delta.create()
    .insert('a')
    .insert('bc', { a: true })
    .insert('!', { b: true })
    .insert(' a')
    .insert('bc', { a: true })
    .insert('!', { b: true })
    .insert(' abc')
  const diff = delta.diff(db, da)
  const expectedDiff = delta.create()
    .retain(1)
    // formats clear per-key: even when 'a' is the only prior key we emit `{a:null}`, not a top-level
    // `null` (individual clears rebase without clobbering concurrently-added formats)
    .retain(2, /** @type {any} */ ({ a: null }))
    .delete(1)
    .retain(2)
    .retain(2, /** @type {any} */ ({ a: null }))
    .delete(1)
  t.compare(diff, expectedDiff)
  db.apply(diff)
  t.compare(db, da)
}

/**
 * Diff must detect attribution changes — now incrementally (per-key, unified with formats) — and the
 * diff must round-trip: `a.apply(diff(a,b)).equals(b)`.
 */
export const testDeltaAttributionDiffAdd = () => {
  // attribution added to existing, otherwise-unchanged text — a pure attribution-only diff
  const a = delta.create().insert('hello').done()
  const b = delta.create().insert('hello', undefined, { insert: ['me'] }).done()
  const diff = delta.diff(a, b)
  t.compare(diff, delta.create().retain(5, undefined, { insert: ['me'] }))
  t.assert(delta.clone(a).apply(diff).equals(b))
}

export const testDeltaAttributionDiffRemove = () => {
  // removing all attribution emits a top-level `null` (clear), distinct from `undefined` = no change
  const a = delta.create().insert('hello', undefined, { insert: ['me'] }).done()
  const b = delta.create().insert('hello').done()
  const diff = delta.diff(a, b)
  t.compare(diff, delta.create().retain(5, undefined, null))
  t.assert(delta.clone(a).apply(diff).equals(b))
}

export const testDeltaAttributionDiffChange = () => {
  // incremental (per-key): the changed `insert` key is set and the `insertAt` key present on `a` but
  // absent on `b` is removed via `{insertAt: null}` — NOT a whole-object replace
  const a = delta.create().insert('hi', undefined, { insert: ['a'], insertAt: 1 }).done()
  const b = delta.create().insert('hi', undefined, { insert: ['b'] }).done()
  const diff = delta.diff(a, b)
  // `{insertAt: null}` is a per-key removal update, not a canonical Attribution → cast for the test
  t.compare(diff, delta.create().retain(2, undefined, /** @type {any} */ ({ insert: ['b'], insertAt: null })))
  t.assert(delta.clone(a).apply(diff).equals(b))
}

export const testDeltaAttributionDiffWithFormat = () => {
  // format and attribution carried on one retain (both incremental, unified)
  const a = delta.create().insert('hello world').done()
  const b = delta.create().insert('hello ').insert('world', { bold: true }, { insert: ['me'] }).done()
  const diff = delta.diff(a, b)
  t.compare(diff, delta.create().retain(6).retain(5, { bold: true }, { insert: ['me'] }))
  t.assert(delta.clone(a).apply(diff).equals(b))
}

export const testDeltaAttributionDiffSubRangeMerge = () => {
  // two adjacent, differently-attributed ops collapse under one uniform retain
  const a = delta.create()
    .insert('ab', undefined, { insert: ['a'] })
    .insert('cd', undefined, { insert: ['b'] })
    .done()
  const b = delta.create().insert('abcd', undefined, { insert: ['z'] }).done()
  const diff = delta.diff(a, b)
  t.compare(diff, delta.create().retain(4, undefined, { insert: ['z'] }))
  const applied = delta.clone(a).apply(diff)
  t.assert(applied.equals(b))
  t.assert(applied.children.start === applied.children.end, 'the covered range merges into a single op')
}

export const testDeltaAttributionDiffInsert = () => {
  // newly inserted attributed content — attribution is recovered by the attribution-diff pass
  const a = delta.create().insert('ab').done()
  const b = delta.create().insert('a').insert('Xb', undefined, { insert: ['me'] }).done()
  const diff = delta.diff(a, b)
  t.assert(delta.clone(a).apply(diff).equals(b))
}

export const testDeltaAttributionDiffSetAttr = () => {
  // node-level attribute attribution change (value unchanged)
  const a = delta.create().setAttr('k', 1, { insert: ['a'] }).done()
  const b = delta.create().setAttr('k', 1, { insert: ['b'] }).done()
  const diff = delta.diff(a, b)
  t.compare(diff, delta.create().setAttr('k', 1, { insert: ['b'] }))
  t.assert(delta.clone(a).apply(diff).equals(b))
}

export const testDeltaAttributionDiffModifyAttr = () => {
  // delta-valued attribute where only the attribution changes — emitted via modifyAttr
  const a = delta.create().setAttr('body', delta.create().insert('x'), { insert: ['a'] }).done()
  const b = delta.create().setAttr('body', delta.create().insert('x'), { insert: ['b'] }).done()
  const diff = delta.diff(a, b)
  t.assert(delta.clone(a).apply(diff).equals(b))
}

export const testDeltaAttributionApplyModifyAttr = () => {
  // applying a `modifyAttr` MERGES its attribution onto the target `setAttr`'s attribution (incremental):
  // the `insert` sibling is kept while `insertAt` is added
  const doc = delta.create().setAttr('body', delta.create().insert('x'), { insert: ['a'] }).done()
  const change = delta.create().modifyAttr('body', delta.create(), { insertAt: 5 }).done()
  const applied = delta.clone(doc).apply(change)
  t.assert(applied.equals(delta.create().setAttr('body', delta.create().insert('x'), { insert: ['a'], insertAt: 5 }).done()))
}

export const testDeltaAttributionIncrementalMerge = () => {
  // applying a `retain` with an attribution object MERGES per-key: the existing `insert` provenance is
  // kept while a new key is added (not replaced wholesale)
  const a = delta.create().insert('hi', undefined, { insert: ['alice'] }).done()
  const applied = delta.clone(a).apply(delta.create().retain(2, undefined, { insertAt: 1 }))
  t.assert(applied.equals(delta.create().insert('hi', undefined, { insert: ['alice'], insertAt: 1 }).done()))
}

export const testDeltaAttributionPerKeyRemove = () => {
  // `{k: null}` removes just that attribution key, leaving siblings intact
  const a = delta.create().insert('hi', undefined, { insert: ['alice'], insertAt: 1 }).done()
  // `{insertAt: null}` is a per-key removal update, not a canonical Attribution → cast for the test
  const applied = delta.clone(a).apply(delta.create().retain(2, undefined, /** @type {any} */ ({ insertAt: null })))
  t.assert(applied.equals(delta.create().insert('hi', undefined, { insert: ['alice'] }).done()))
}

export const testDeltaAttributionFormatMerge = () => {
  // an attribution's nested `format` sub-object merges per inner key (the styling `format` dimension is
  // unaffected): adding `italic` keeps the existing `bold`.
  // apply({format:{bold:[]}}, {format:{italic:[]}}) === {format:{italic:[],bold:[]}}
  const a = delta.create().insert('hi', undefined, { format: { bold: [] } }).done()
  const applied = delta.clone(a).apply(delta.create().retain(2, undefined, { format: { italic: [] } }))
  t.assert(applied.equals(delta.create().insert('hi', undefined, { format: { bold: [], italic: [] } }).done()))
}

export const testDeltaAttributionFormatPerKeyRemove = () => {
  // `{format:{k:null}}` removes just that inner format key, keeping inner siblings (and their values) intact
  const a = delta.create().insert('hi', undefined, { format: { bold: ['alice'], italic: ['bob'] } }).done()
  const applied = delta.clone(a).apply(delta.create().retain(2, undefined, /** @type {any} */ ({ format: { bold: null } })))
  t.assert(applied.equals(delta.create().insert('hi', undefined, { format: { italic: ['bob'] } }).done()))
}

export const testDeltaAttributionFormatRemoveEmpties = () => {
  // removing the last inner format key drops the whole `format` key (no stored `format:{}`), emptying the
  // attribution. apply({format:{bold:[]}}, {format:{bold:null}}) === {} (no attribution)
  const a = delta.create().insert('hi', undefined, { format: { bold: [] } }).done()
  const applied = delta.clone(a).apply(delta.create().retain(2, undefined, /** @type {any} */ ({ format: { bold: null } })))
  t.assert(applied.equals(delta.create().insert('hi').done()))
}

export const testDeltaAttributionFormatDiff = () => {
  // diff emits a NESTED incremental update for attribution.format (per-inner-key set + remove) and round-trips
  const a = delta.create().insert('hi', undefined, { format: { bold: ['alice'], italic: ['bob'] } }).done()
  const b = delta.create().insert('hi', undefined, { format: { bold: ['alice'], under: ['carol'] } }).done()
  const d = delta.diff(a, b)
  // bold unchanged, italic removed, under added → nested {format:{italic:null, under:['carol']}}
  t.compare(d, delta.create().retain(2, undefined, /** @type {any} */ ({ format: { italic: null, under: ['carol'] } })))
  t.assert(delta.clone(a).apply(d).equals(b)) // round-trip
}

export const testDeltaAttributionFormatBuilderResolve = () => {
  // a DATA-op builder resolves an inner `{format:{k:null}}` removal against a `useAttribution` context, storing
  // canonical settled data (no `null` leaf) — consistent with apply-time resolution
  const a = delta.create().useAttribution({ insert: ['alice'], format: { bold: ['x'], italic: ['y'] } })
    .insert('hi', undefined, /** @type {any} */ ({ format: { bold: null } })).done()
  t.assert(a.equals(delta.create().insert('hi', undefined, { insert: ['alice'], format: { italic: ['y'] } }).done()))
}

export const testDeltaAttributionContextResolvesRemovals = () => {
  // a `{k:null}` removal that lives in the `useAttribution` CONTEXT (the base, not the per-call arg) has
  // nothing to clear on a fresh data op, so it must collapse away — settled data carries no `null` leaf. This
  // makes the context path consistent with the direct-arg path (which already resolves).
  const ctxNested = delta.create().useAttribution(/** @type {any} */ ({ format: { bold: null } }))
    .insert('x', undefined, { insert: [] }).done()
  t.assert(ctxNested.equals(delta.create().insert('x', undefined, { insert: [] }).done()))
  // same result as passing the removal directly as the arg
  const directArg = delta.create().insert('x', undefined, /** @type {any} */ ({ format: { bold: null }, insert: [] })).done()
  t.assert(directArg.equals(ctxNested))
  // a LEAF removal in the context (`{insert:null}`) collapses too, keeping the sibling set key
  const ctxLeaf = delta.create().useAttribution(/** @type {any} */ ({ insert: null, insertAt: 3 }))
    .insert('y', undefined, { format: { bold: ['u'] } }).done()
  t.assert(ctxLeaf.equals(delta.create().insert('y', undefined, { insertAt: 3, format: { bold: ['u'] } }).done()))
  // a context format with a real value AND a null sibling: the real survives, the removal drops
  const ctxMixed = delta.create().useAttribution(/** @type {any} */ ({ format: { bold: ['alice'], italic: null } }))
    .insert('z', undefined, { insertAt: 1 }).done()
  t.assert(ctxMixed.equals(delta.create().insert('z', undefined, { format: { bold: ['alice'] }, insertAt: 1 }).done()))
  // INSTRUCTION op (resolve=false): a `retain` via the same context KEEPS the `{bold:null}` removal so it
  // still clears downstream — the canonicalisation is data-op only.
  const retain = delta.create().useAttribution(/** @type {any} */ ({ format: { bold: null } }))
    .retain(1, undefined, { insertAt: 2 }).done()
  t.assert(retain.equals(delta.create().retain(1, undefined, /** @type {any} */ ({ format: { bold: null }, insertAt: 2 })).done()))
}

export const testDeltaFormatFormatStaysShallow = () => {
  // the styling `format` dimension treats a key literally named `format` like any other — wholesale REPLACE,
  // NOT the per-inner-key merge that attribution.format gets. Only attribution.format observes the deep merge.
  const a = delta.create().insert('hi', { format: { a: 1 } }).done()
  const r = delta.clone(a).apply(delta.create().retain(2, { format: { b: 2 } }))
  t.assert(r.equals(delta.create().insert('hi', { format: { b: 2 } }).done()))
}

export const testDeltaFormatClearAll = () => {
  // `null` clears ALL format keys on the range (unified with attribution)
  const a = delta.create().insert('hi', { bold: true, italic: true }).done()
  const applied = delta.clone(a).apply(delta.create().retain(2, null))
  t.assert(applied.equals(delta.create().insert('hi').done()))
}

export const testDeltaFinalApplyOverRetainCollapsesRemovals = () => {
  // On a FINAL (materializing) apply, a `retain` carrying a "remove-by-null" attribution/format that lands
  // BEYOND existing content has nothing to act on, so it resolves away (the now-bare retain is trimmed by
  // done() when trailing). On a NON-final/instruction apply the same removal is kept verbatim (it must still
  // propagate to clear downstream). Helper: a fresh empty FINAL doc.
  const mkFinal = () => { const d = delta.create(delta.$deltaAny); d.isFinal = true; return d }

  // 1. nested-format removal beyond content ⇒ empty (format collapses ⇒ attribution collapses ⇒ no attribution)
  t.assert(mkFinal().apply(delta.create().retain(1, undefined, /** @type {any} */ ({ format: { bold: null } }))).done().equals(delta.create().done()))
  // 2. leaf removal `{insert:null}` ⇒ empty
  t.assert(mkFinal().apply(delta.create().retain(1, undefined, /** @type {any} */ ({ insert: null }))).done().equals(delta.create().done()))
  // 3. removal + set: the removal collapses, the set survives ⇒ retain(1, {insertAt:5})
  t.assert(mkFinal().apply(delta.create().retain(1, undefined, /** @type {any} */ ({ insert: null, insertAt: 5 }))).done()
    .equals(delta.create().retain(1, undefined, { insertAt: 5 }).done()))
  // 4. the styling `format` DIMENSION (not attribution.format) collapses its removal too
  t.assert(mkFinal().apply(delta.create().retain(1, /** @type {any} */ ({ bold: null }))).done().equals(delta.create().done()))
  // 5. positioning guard: a resolved-away retain followed by content stays (so the insert keeps its position)
  t.assert(mkFinal().apply(delta.create().retain(2, undefined, /** @type {any} */ ({ format: { bold: null } })).insert('X')).done()
    .equals(delta.create().retain(2).insert('X').done()))
  // 6. over-retain spanning content + beyond: the char keeps no attribution, no trailing attribution retain
  t.assert(mkFinal().insert('a').apply(delta.create().retain(2, undefined, /** @type {any} */ ({ insert: null }))).done()
    .equals(delta.create().insert('a').done()))
  // 7. regression — a NON-final apply keeps the removal instruction verbatim (it must still clear downstream)
  t.assert(delta.create().apply(delta.create().retain(1, undefined, /** @type {any} */ ({ format: { bold: null } })))
    .equals(delta.create().retain(1, undefined, /** @type {any} */ ({ format: { bold: null } }))))
}

/**
 * We want to ensure that a.apply(b).apply(c) equals a.apply(b.apply(c)) - test the interactions of
 * different ops
 */
export const testDeltaApplyCases = () => {
  const c = () => delta.create(delta.$deltaAny)
  t.compare(
    c().delete(1).apply(
      c().delete(1)
    ),
    c().delete(2),
    'delete + delete'
  )
  t.compare(
    c().delete(1).apply(
      c().insert('a')
    ),
    c().delete(1).insert('a'),
    'delete + insert'
  )
  t.compare(
    c().delete(1).apply(
      c().retain(1, { a: 1 })
    ),
    c().delete(1).retain(1, { a: 1 }),
    'delete + retain'
  )
  t.compare(
    c().delete(1).apply(
      c().modify(c().insert('a'))
    ),
    c().delete(1).modify(c().insert('a')),
    'delete + modify'
  )
  t.compare(
    c().insert('a').apply(
      c().delete(2)
    ),
    c().delete(1),
    'insert + delete'
  )
  t.compare(
    c().insert('a').apply(
      c().retain(2, { a: 1 })
    ),
    c().insert('a', { a: 1 }).retain(1, { a: 1 }),
    'insert + retain'
  )
  t.compare(
    c().retain(1, { a: true }).apply(
      c().delete(2)
    ),
    c().delete(2),
    'retain + delete'
  )
  t.compare(
    c().retain(2, { a: true }).apply(
      c().retain(1).insert('a')
    ),
    c().retain(1, { a: true }).insert('a').retain(1, { a: true }),
    'retain + insert'
  )
  t.compare(
    c().retain(1, { a: 1 }).apply(
      c().retain(2, { b: 2 })
    ),
    c().retain(1, { a: 1, b: 2 }).retain(1, { b: 2 }),
    'retain + retain'
  )
  t.compare(
    c().retain(1, { a: 1 }).apply(
      c().modify(c().insert('a'))
    ),
    c().modify(c().insert('a'), { a: 1 }),
    'retain + modify'
  )
  t.compare(
    c().modify(c().insert('a')).apply(
      c().delete(2)
    ),
    // a modify stands in for a retained source position, so deleting over it deletes that
    // position too: modify(1) + delete(2) === delete(2) (not delete(1) - that dropped the
    // modify's underlying position).
    c().delete(2),
    'modify + delete'
  )
  t.compare(
    c().modify(c().insert('a')).apply(
      c().insert('a')
    ),
    c().insert('a').modify(c().insert('a')),
    'modify + insert'
  )
  t.compare(
    c().modify(c().insert('a')).apply(
      c().retain(2, { a: 1 })
    ),
    c().modify(c().insert('a'), { a: 1 }).retain(1, { a: 1 }),
    'modify + retain'
  )
  t.compare(
    c().modify(c().insert('a')).apply(
      c().modify(c().insert('0'))
    ),
    c().modify(c().insert('0a')),
    'modify + modify'
  )
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

/**
 * @template {delta.DeltaConf} Conf
 * @param {t.TestCase} tc
 * @param {s.Schema<delta.Delta<Conf>>} $d
 * @param {{ minChildOps: number, maxChildOps: number }} opts
 */
const testDeltaDiff = (tc, $d, opts) => {
  // @todo this should  create sentences, words, functions, etc
  const start = delta.random(tc.prng, $d, { ...opts, attribution: true }).done()
  const change = delta.random(tc.prng, $d, { source: start, ...opts, attribution: true })
  const final = delta.clone(start)
  final.isFinal = true
  final.apply(change)
  const d = delta.diff(start, final)
  const updatedStart = delta.clone(start)
  updatedStart.isFinal = true
  updatedStart.apply(d)
  t.compare(updatedStart, final)
}

const $textDelta = delta.$delta({ text: true })
const $mapDelta = delta.$delta({ attrs: { x: [1, 2, 'str'], y: s.$string } })
const $arrayDelta = delta.$delta({ children: [0, 1, -1, s.$string, delta.$delta({ attrs: { a: [1, 2], b: [null, 'str'] } })], text: true })
const $xmlDelta = delta.$delta({ name: ['div', 'p'], children: [0, 1, -1, s.$string, delta.$delta({ attrs: { a: [1, 2] } })], text: true, attrs: { a: [1, 2, 3] } })
// $richTextDelta exercises format ops on text/insert/retain. The other schemas declare no
// `formats`, so $formats normalizes to s.$null in delta.random and every op is generated with
// format=null - leaving the format-bearing diff paths unfuzzed.
// format keys are .optional so the random generator drops each ~50% of the
// time — this is what makes the two sides of a concurrent edit hold a
// non-identical key set, which in turn exercises the partial-strip branch in
// rebase's format reconciliation.
const $richTextDelta = delta.$delta({ text: true, formats: { bold: s.$boolean.optional, color: s.$(['red', 'blue']).optional } })
// $richXmlDelta exercises format ops on inner-node inserts (the insert→modify diff path) and
// child-name unions (the findIndex(cc.name === ...) pairing in applyChangesetToDelta).
const $richXmlDelta = delta.$delta({
  name: ['div', 'p'],
  text: true,
  attrs: { a: [1, 2, 3] },
  formats: { bold: s.$boolean.optional },
  children: s.$union(s.$number, s.$string, delta.$delta({ name: ['span', 'em'], text: true, attrs: { c: s.$string }, formats: { italic: s.$boolean.optional } }))
})

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomTextDeltaDiff = tc => {
  testDeltaDiff(tc, $textDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomTextDeltaDiffLarge = tc => {
  testDeltaDiff(tc, $textDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomMapDeltaDiff = tc => {
  testDeltaDiff(tc, $mapDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomMapDeltaDiffLarge = tc => {
  testDeltaDiff(tc, $mapDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomArrayDeltaDiff = tc => {
  testDeltaDiff(tc, $arrayDelta, { minChildOps: 3, maxChildOps: 3 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomArrayDeltaDiffLarge = tc => {
  testDeltaDiff(tc, $arrayDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomXmlDeltaDiff = tc => {
  testDeltaDiff(tc, $xmlDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomXmlDeltaDiffLarge = tc => {
  testDeltaDiff(tc, $xmlDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomRichTextDeltaDiff = tc => {
  testDeltaDiff(tc, $richTextDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomRichTextDeltaDiffLarge = tc => {
  testDeltaDiff(tc, $richTextDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomRichXmlDeltaDiff = tc => {
  testDeltaDiff(tc, $richXmlDelta, { minChildOps: 3, maxChildOps: 10 })
}

export const testDeltaApplyMoveEdges = () => {
  // deterministic coverage for the move-mode op clones the random fuzz only hits probabilistically.
  // modify PAST the end of the content -> the modify op is cloned (opsI == null); move must not freeze it
  const mDoc = delta.create('doc').insert([delta.create('p').insert('hi')]).done()
  const change = () => delta.create().retain(1).modify(delta.create().insert('!'))
  t.compare(delta.clone(mDoc).apply(change()), delta.clone(mDoc).apply(change(), { move: true }))
  // modifyAttr on an attribute that does not (yet) hold a delta -> the modifyAttr op is cloned; move ditto
  // (modifyAttr on a node with no declared `a` attr is invalid input -> cast)
  const aDoc = delta.create('node').done()
  const aChange = () => /** @type {any} */ (delta.create().modifyAttr('a', delta.create().insert('x')))
  t.compare(delta.clone(aDoc).apply(aChange()), delta.clone(aDoc).apply(aChange(), { move: true }))
}

/**
 * @template {delta.DeltaConf} Conf
 * @param {t.TestCase} tc
 * @param {s.Schema<delta.Delta<Conf>>} $d
 * @param {{ minChildOps: number, maxChildOps: number }} opts
 */
const testDeltaApply = (tc, $d, opts) => {
  // @todo this should  create sentences, words, functions, etc
  const start = delta.random(tc.prng, $d, opts).done()
  const change1 = delta.random(tc.prng, $d, { source: start, ...opts })
  const startUpdated = delta.clone(start).apply(change1)
  const change2 = delta.random(tc.prng, $d, { source: startUpdated, ...opts })
  const finalA = delta.clone(startUpdated).apply(change2)
  const changesCombined = delta.clone(change1).apply(change2)
  const finalB = delta.clone(start).apply(changesCombined)
  t.compare(finalA, finalB)
  // `move: true` donates disposable change clones (consumed mutable, not frozen-cloned); the result must
  // be identical to the default copy path. A bad share would corrupt the second apply -> mismatch here.
  const finalMove = delta.clone(start).apply(delta.clone(change1), { move: true }).apply(delta.clone(change2), { move: true })
  t.compare(finalA, finalMove, 'move-mode apply matches the copy path')
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomTextDeltaApply = tc => {
  testDeltaApply(tc, $textDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomTextDeltaApplyLarge = tc => {
  testDeltaApply(tc, $textDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomMapDeltaApply = tc => {
  testDeltaApply(tc, $mapDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomMapDeltaApplyLarge = tc => {
  testDeltaApply(tc, $mapDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomArrayDeltaApply = tc => {
  testDeltaApply(tc, $arrayDelta, { minChildOps: 3, maxChildOps: 3 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomArrayDeltaApplyLarge = tc => {
  testDeltaApply(tc, $arrayDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomXmlDeltaApply = tc => {
  testDeltaApply(tc, $xmlDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomXmlDeltaApplyLarge = tc => {
  testDeltaApply(tc, $xmlDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * Convergence (TP1) property for `rebase`.
 *
 * Two users start from the same `base` and concurrently produce `diff1` and
 * `diff2`. Each side replays the other's change after rebasing it, and the
 * final states must agree:
 *
 *   user1: base.apply(diff1).apply( diff2.rebase(diff1, false /*no priority *\/) )
 *   user2: base.apply(diff2).apply( diff1.rebase(diff2, true  /*priority    *\/) )
 *
 * The asymmetric `priority` arg encodes which side wins true conflicts. We
 * assign priority to `diff1` on both paths, so both clients converge on the
 * same conflict resolution.
 *
 * @template {delta.DeltaConf} Conf
 * @param {t.TestCase} tc
 * @param {s.Schema<delta.Delta<Conf>>} $d
 * @param {{ minChildOps: number, maxChildOps: number }} opts
 */
const testDeltaRebase = (tc, $d, opts) => {
  const base = delta.random(tc.prng, $d, opts).done()
  // both users observe `base` then independently produce a change against it
  const diff1 = delta.random(tc.prng, $d, { source: base, ...opts })
  const diff2 = delta.random(tc.prng, $d, { source: base, ...opts })

  // user1: applies own change first, then the rebased remote change
  const stateA = delta.clone(base)
    .apply(delta.clone(diff1))
    .apply(delta.clone(diff2).rebase(diff1, false))

  // user2: applies own change first, then the rebased remote change
  const stateB = delta.clone(base)
    .apply(delta.clone(diff2))
    .apply(delta.clone(diff1).rebase(diff2, true))

  t.compare(stateA, stateB)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomTextDeltaRebase = tc => {
  testDeltaRebase(tc, $textDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomTextDeltaRebaseLarge = tc => {
  testDeltaRebase(tc, $textDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomMapDeltaRebase = tc => {
  testDeltaRebase(tc, $mapDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomMapDeltaRebaseLarge = tc => {
  testDeltaRebase(tc, $mapDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomArrayDeltaRebase = tc => {
  testDeltaRebase(tc, $arrayDelta, { minChildOps: 3, maxChildOps: 3 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomArrayDeltaRebaseLarge = tc => {
  testDeltaRebase(tc, $arrayDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomXmlDeltaRebase = tc => {
  testDeltaRebase(tc, $xmlDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomXmlDeltaRebaseLarge = tc => {
  testDeltaRebase(tc, $xmlDelta, { minChildOps: 50, maxChildOps: 80 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomRichTextDeltaRebase = tc => {
  testDeltaRebase(tc, $richTextDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomRichXmlDeltaRebase = tc => {
  testDeltaRebase(tc, $richXmlDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * Pick a uniformly-random valid cursor position in `node`: descend into random child nodes, then stop
 * at a random content gap. (Attribute-leaf marks are covered by the deterministic position tests.)
 *
 * @param {prng.PRNG} gen
 * @param {delta.DeltaAny} node
 * @return {position.Pos}
 */
const randomMarkPos = (gen, node) => {
  /** @type {Array<string|number>} */
  const path = []
  let cur = node
  for (;;) {
    /** @type {Array<[number, delta.DeltaAny]>} */
    const slots = []
    let i = 0
    for (const op of cur.children) {
      if (delta.$insertOp.check(op)) {
        for (const el of op.insert) {
          if (delta.$deltaAny.check(el)) slots.push([i, el])
          i++
        }
      } else {
        i += op.length
      }
    }
    if (slots.length === 0 || prng.bool(gen)) {
      path.push(prng.int32(gen, 0, cur.childCnt))
      return position.create(path, prng.bool(gen) ? 1 : -1)
    }
    const [idx, child] = prng.oneOf(gen, slots)
    path.push(idx)
    cur = child
  }
}

/**
 * Build a random mark-change delta against `doc`: add or remove a mark, the id drawn from a small
 * shared pool so concurrent changes collide on the same id (exercising the rebase conflict rules).
 *
 * @param {prng.PRNG} gen
 * @param {delta.DeltaAny} doc
 * @return {delta.DeltaBuilderAny}
 */
const randomMarkChange = (gen, doc) => {
  const c = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  const id = prng.oneOf(gen, ['p', 'q', 'r'])
  const p = randomMarkPos(gen, doc)
  if (prng.bool(gen)) c.addMark(p, id); else c.removeMark(p, id)
  return c
}

/**
 * TP1 convergence for the document under rebase WITH marks present. The base is seeded with a few marks;
 * each side then makes either a content change or a mark change (add/remove). Replaying the other side
 * after rebase must agree on the document. Marks are local/ephemeral cursor state excluded from delta
 * equality, so `t.compare` checks content convergence; cursor positions use collapse-to-cut and are NOT
 * asserted to converge (a delete maps a range to a point — see shiftMarkKey).
 *
 * @template {delta.DeltaConf} Conf
 * @param {t.TestCase} tc
 * @param {s.Schema<delta.Delta<Conf>>} $d
 * @param {{ minChildOps: number, maxChildOps: number }} opts
 */
const testMarkRebaseConvergence = (tc, $d, opts) => {
  const gen = tc.prng
  const raw = delta.random(gen, $d, opts).done()
  const base = /** @type {delta.DeltaBuilderAny} */ (delta.clone(raw))
  // seed the base with a few marks so concurrent content edits must shift them
  for (let i = prng.int32(gen, 0, 3); i > 0; i--) {
    base.addMark(randomMarkPos(gen, raw), prng.oneOf(gen, ['p', 'q', 'r']))
  }
  base.done()
  const mkDiff = () => prng.bool(gen)
    ? /** @type {delta.DeltaBuilderAny} */ (delta.random(gen, $d, { source: base, ...opts }))
    : randomMarkChange(gen, base)
  const d1 = mkDiff()
  const d2 = mkDiff()
  const a = delta.clone(base).apply(delta.clone(d1), { final: true }).apply(delta.clone(d2).rebase(d1, false), { final: true })
  const b = delta.clone(base).apply(delta.clone(d2), { final: true }).apply(delta.clone(d1).rebase(d2, true), { final: true })
  t.compare(a, b, 'documents converge (content; marks excluded from equality)')
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatMarkRebaseConvergenceText = tc => {
  testMarkRebaseConvergence(tc, $textDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatMarkRebaseConvergenceArray = tc => {
  testMarkRebaseConvergence(tc, $arrayDelta, { minChildOps: 3, maxChildOps: 3 })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatMarkRebaseConvergenceXml = tc => {
  testMarkRebaseConvergence(tc, $xmlDelta, { minChildOps: 3, maxChildOps: 10 })
}

/**
 * Applying a change carrying `deleteMarks` removes those marks from the settled node's final set (it
 * does not leave a lingering `deleteMarks` on the settled state). A re-add of an existing id replaces
 * the mark in place (same id == same mark), so a mark can be "updated" with new `attrs`.
 */
export const testMarkDeleteAndUpdateApply = () => {
  const doc = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('hello'))
  doc.addMark(position.create([1], 1, { color: 'red' }), 'M')
  t.assert(doc.marks?.size === 1)
  // update: re-add the same id replaces in place (one mark, attributes updated)
  doc.addMark(position.create([1], 1, { color: 'blue' }), 'M')
  t.assert(doc.marks?.size === 1)
  t.compare([...(doc.marks ?? [])].map(m => m.attrs), [{ color: 'blue' }])
  // delete via a deleteMarks change: the mark is gone from the final set, no lingering deleteMarks
  const del = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  del.deleteMarks = new Set(['M'])
  doc.apply(del, { final: true })
  t.assert(doc.marks === null || doc.marks.size === 0)
  t.assert(doc.deleteMarks === null)
  t.compare(position.marksToPositions(doc), [])
}

/**
 * The builder OR-propagates the conservative `maybeHasMarks` flag for delta-valued children/values, so a
 * directly-built delta flags `true` and `marksToPositions` can reach a nested-only mark. Removal never
 * clears the flag (it stays conservatively `true`); `marksToPositions` self-corrects an emptied subtree.
 */
export const testMarkFlagBuilderMaintained = () => {
  // insert([markedChild]): the parent flags the child's subtree marks
  const child = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('aa'))
  child.addMark(position.create([1], 1), 'm1')
  const d = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert([child]))
  t.assert(d.maybeHasMarks === true)
  t.compare(position.marksToPositions(d), [{ id: 'm1', path: [0, 1], assoc: 1 }])
  // modify(markedValue): a change delta flags the modify value's marks
  const mv = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('x'))
  mv.addMark(position.create([0]), 'mod')
  t.assert(/** @type {delta.DeltaBuilderAny} */ (delta.create().retain(1).modify(mv)).maybeHasMarks === true)
  // setAttr(markedDelta) flags; replacing it leaves no reachable mark (flag stays true, self-corrected)
  const av = /** @type {delta.DeltaBuilderAny} */ (delta.create('doc').insert('x'))
  av.addMark(position.create([0]), 'z')
  const n = /** @type {delta.DeltaBuilderAny} */ (delta.create('node'))
  n.setAttr('body', av)
  t.assert(n.maybeHasMarks === true)
  n.apply(/** @type {any} */ (delta.create().setAttr('body', delta.create('doc').insert('y'))), { final: true })
  t.compare(position.marksToPositions(n), []) // the replaced attr's mark is gone (no negative-count fallout)
  t.assert(n.maybeHasMarks === false) // marksToPositions self-corrected the now-empty subtree's flag
  // modifyAttr(markedValue) flags
  const ma = /** @type {delta.DeltaBuilderAny} */ (delta.create().insert('q'))
  ma.addMark(position.create([0]), 'ma')
  const dma = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  dma.modifyAttr('body', ma)
  t.assert(dma.maybeHasMarks === true)
}

/**
 * `mergeRootMarks` (the unified copy/merge helper, routed through the `deleteMarkTo`/`addMarkTo`
 * primitives) keeps last-writer-wins: a source `deleteMarks` strips a conflicting add on the target
 * (never both), and a source add strips a target's pending delete of the same id.
 */
export const testMarkLwwMergeAndCopy = () => {
  // delete-cancels-add: source deleteMarks strip a present add on target. Two ids exercise both the
  // first (`?? new Set()`) and the reuse path inside deleteMarkTo.
  const target = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  delta.addRootMark(target, delta.createMark(0, 'c', 1, null))
  const source = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  source.deleteMarks = new Set(['c', 'e'])
  delta.mergeRootMarks(target, source)
  t.assert(target.marks === null || target.marks.size === 0) // the 'c' add was stripped
  t.compare(target.deleteMarks, new Set(['c', 'e']))

  // add-cancels-delete (the mirror): a source add strips the target's pending delete of the same id
  const target2 = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  target2.deleteMarks = new Set(['d'])
  const source2 = /** @type {delta.DeltaBuilderAny} */ (delta.create())
  delta.addRootMark(source2, delta.createMark(0, 'd', 1, null))
  delta.mergeRootMarks(target2, source2)
  t.assert(target2.marks?.size === 1)
  t.assert(target2.deleteMarks === null)
}

// ---------------------------------------------------------------------------
// Targeted behavior tests (added to drive `delta.js` coverage from ~94 % to
// 100 % while testing concrete behavior, not lines).
// ---------------------------------------------------------------------------

/**
 * The variadic `delta.from(...)` helper builds a delta from positional args:
 * an optional leading string is the node name, an optional next plain object
 * is the attrs map, and any remaining args are inserted as children. Multiple
 * trailing inserts merge when the builder allows it.
 */
export const testFrom = () => {
  t.group('name only', () => {
    const d = delta.from('div')
    t.assert(d.name === 'div')
    t.assert(d.isEmpty())
  })
  t.group('children only (no name)', () => {
    const d = delta.from(['a', 'b'])
    t.assert(d.name === null)
    t.compare(d, delta.create().insert(['a', 'b']))
  })
  t.group('name + attrs', () => {
    t.compare(delta.from('div', { x: 1 }), delta.create('div').setAttr('x', 1))
  })
  t.group('name + attrs + children', () => {
    t.compare(delta.from('div', { x: 1 }, ['a']), delta.create('div').setAttr('x', 1).insert(['a']))
  })
  t.group('attrs + children, no name', () => {
    t.compare(delta.from({ x: 1 }, ['a']), delta.create().setAttr('x', 1).insert(['a']))
  })
  t.group('multiple trailing insert args merge', () => {
    // exercises the `for (; i < args.length; i++)` loop body
    t.compare(delta.from('div', ['a'], ['b']), delta.create('div').insert(['a', 'b']))
  })
}

/**
 * `mergeDeltas(a, b)` is the null-safe equivalent of `clone(a).apply(b)`. It
 * is used by callers that don't yet know whether either side has any changes.
 */
export const testMergeDeltas = () => {
  const a = delta.create().insert('hi')
  const b = delta.create().retain(2).insert('!')
  t.group('both sides non-null', () => {
    t.compare(delta.mergeDeltas(a, b), delta.clone(a).apply(b))
  })
  t.group('one side null returns the other', () => {
    t.assert(delta.mergeDeltas(null, b) === b, 'left null → right is returned by reference')
    t.assert(delta.mergeDeltas(a, null) === a, 'right null → left is returned by reference')
  })
  t.group('both null returns null', () => {
    t.assert(delta.mergeDeltas(null, null) === null)
  })
}

/**
 * `isEmpty()` is true when a delta carries no attribute changes and no child
 * ops. Trailing format-less retains do *not* count as content because `done()`
 * cleans them up.
 */
export const testIsEmpty = () => {
  t.assert(delta.create().isEmpty(), 'fresh builder is empty')
  t.assert(!delta.create().setAttr('x', 1).isEmpty(), 'attrs make it non-empty')
  t.assert(!delta.create().insert('hi').isEmpty(), 'children make it non-empty')
  t.assert(delta.create().retain(3).done().isEmpty(), 'done() drops unformatted trailing retain')
  t.assert(!delta.create().retain(3, { a: 1 }).done().isEmpty(), 'formatted retain survives done()')
}

/**
 * After `.done()`, every mutating builder method must throw "Readonly Delta
 * can't be modified". This is the readonly invariant of the builder API.
 */
export const testReadonlyAfterDone = () => {
  const d = delta.create().insert('hi').done()
  // children mutators
  t.fails(() => /** @type {any} */ (d).insert('!'))
  t.fails(() => /** @type {any} */ (d).retain(1))
  t.fails(() => /** @type {any} */ (d).delete(1))
  t.fails(() => /** @type {any} */ (d).modify(delta.create()))
  // attr mutators
  t.fails(() => /** @type {any} */ (d).setAttr('x', 1))
  t.fails(() => /** @type {any} */ (d).setAttrs({ a: 1 }))
  t.fails(() => /** @type {any} */ (d).deleteAttr('x'))
  t.fails(() => /** @type {any} */ (d).modifyAttr('m', delta.create()))
  // builder state mutators
  t.fails(() => /** @type {any} */ (d).useFormats({ bold: true }))
  t.fails(() => /** @type {any} */ (d).useAttribution({ insert: ['x'] }))
  t.fails(() => /** @type {any} */ (d).updateUsedFormats('bold', true))
  t.fails(() => /** @type {any} */ (d).updateUsedAttribution('insert', ['x']))
  // higher-level mutators
  t.fails(() => /** @type {any} */ (d).apply(delta.create()))
  t.fails(() => /** @type {any} */ (d).rebase(delta.create(), false))
  t.fails(() => /** @type {any} */ (d).rebaseOnInverse(delta.create(), false))
}

/**
 * `delete(len, prevValue)` records the content that was removed (used to
 * compute inverses). Two adjacent `.delete()` calls merge: their lengths add
 * and their `prevValue` deltas concatenate via `append`.
 */
export const testDeleteWithPrevValue = () => {
  t.group('adjacent deletes with non-null prevValue concatenate', () => {
    const d = delta.create()
      .delete(2, delta.create().insert('ab'))
      .delete(3, delta.create().insert('cde'))
    t.assert(d.children.len === 1, 'deletes merged into one op')
    const op = d.children.start
    t.assert(delta.$deleteOp.check(op))
    t.assert(/** @type {any} */ (op).delete === 5, 'lengths added')
    t.compare(/** @type {any} */ (op).prevValue, delta.create().insert('abcde'))
  })
  t.group('adjacent deletes with null prevValue still merge', () => {
    const d = delta.create().delete(2).delete(3)
    t.assert(d.children.len === 1)
    const op = /** @type {any} */ (d.children.start)
    t.assert(op.delete === 5)
    t.assert(op.prevValue === null)
  })
  t.group('DeleteOp._splice keeps prevValue in sync when the delete is split by a concurrent insert', () => {
    // A concurrent insert that lands in the middle of a delete forces the
    // rebase to split the delete around the new content. The surviving tail
    // DeleteOp must drop the prefix from its prevValue — otherwise the
    // recorded "what was deleted" no longer matches `this.delete`, and an
    // inverse computed from it would re-insert the wrong bytes.
    const d1 = delta.create().delete(5, delta.create().insert('abcde'))
    const d2 = delta.create().retain(2).insert('XYZ').done()
    d1.rebase(d2, false)
    /** @type {Array<any>} */
    const ops = []
    for (const op of d1.children) ops.push(op)
    t.assert(ops.length === 3, 'split into [delete(2), retain(3), delete(3)]')
    t.assert(delta.$deleteOp.check(ops[0]) && ops[0].delete === 2)
    t.assert(delta.$retainOp.check(ops[1]) && ops[1].retain === 3)
    t.assert(delta.$deleteOp.check(ops[2]) && ops[2].delete === 3)
    // The original op survives as the tail (suffix); _splice removed the
    // first two entries from its prevValue, leaving just 'cde'.
    t.compare(ops[2].prevValue, delta.create().insert('cde'))
    // DeleteOp.clone() drops prevValue, so the prefix DeleteOp has none.
    t.assert(ops[0].prevValue === null)
  })
}

/**
 * Every op class exposes a `type` getter and a `fingerprint` getter. The
 * fingerprint must be stable across two semantically equal deltas and must
 * change when any op-level data changes.
 */
export const testOpIntrospection = () => {
  const buildD = () => delta.create()
    .insert('hello') // TextOp
    .insert([1, 2]) // InsertOp
    .modify(delta.create().insert('a')) // ModifyOp
    .retain(3, { x: 1 }) // RetainOp (with format so it survives `done`)
    .delete(2) // DeleteOp
    .setAttr('s', 1) // SetAttrOp
    .deleteAttr('d') // DeleteAttrOp
    .modifyAttr('m', delta.create().setAttr('y', 1)) // ModifyAttrOp
  t.group('op.type per op kind', () => {
    const d = buildD()
    const childTypes = []
    for (const op of d.children) childTypes.push(op.type)
    t.compare(childTypes, ['insert', 'insert', 'modify', 'retain', 'delete'])
    /** @type {{[k:string]:string}} */
    const attrTypes = {}
    for (const op of d.attrs) attrTypes[op.key] = op.type
    t.compare(attrTypes, { s: 'insert', d: 'delete', m: 'modify' })
  })
  t.group('fingerprint is deterministic and reflects op content', () => {
    const fp = buildD().fingerprint
    t.assert(typeof fp === 'string' && fp.length > 0)
    t.assert(buildD().fingerprint === fp, 'identical builders → identical fingerprint')
    t.assert(delta.create().delete(3).fingerprint !== delta.create().delete(4).fingerprint, 'delete length changes fingerprint')
    t.assert(delta.create().retain(2, { x: 1 }).fingerprint !== delta.create().retain(2, { x: 2 }).fingerprint, 'retain format changes fingerprint')
    t.assert(delta.create().deleteAttr('a').fingerprint !== delta.create().deleteAttr('b').fingerprint, 'deleteAttr key changes fingerprint')
    t.assert(
      delta.create().modifyAttr('m', delta.create().setAttr('y', 1)).fingerprint !==
        delta.create().modifyAttr('m', delta.create().setAttr('y', 2)).fingerprint,
      'modifyAttr nested value changes fingerprint'
    )
  })
}

/**
 * `slice` is exercised by `testSlice` for the simple in-single-op case. This
 * test covers the multi-op walks: skipping leading nodes when `start` is past
 * the first child, and a partial trailing node when `end` falls strictly
 * inside a non-first child.
 */
export const testSliceMultiOp = () => {
  t.group('slice that starts past the first node', () => {
    const d = delta.create().insert('aa').insert([1, 2]).insert('bb')
    // start=5 lands inside the third op; the loop must walk past 'aa' and [1,2]
    t.compare(delta.slice(d, 5, 6), delta.create().insert('b'))
  })
  t.group('slice that ends mid non-first node', () => {
    const d = delta.create().insert('ab').insert([1]).insert('cdef')
    // start=1 lands inside 'ab' (partial-start branch);
    // end=4 lands inside 'cdef' on a *different* node (partial-end branch).
    t.compare(delta.slice(d, 1, 4), delta.create().insert('b').insert([1]).insert('c'))
  })
}

/**
 * Applying a `modify` op against an existing `retain` longer than one unit
 * splits the retain: a new modify op is inserted, the retain shrinks by 1,
 * and the retain's format propagates onto the inserted modify.
 */
export const testApplyModifyAgainstRetain = () => {
  const c = () => delta.create(delta.$deltaAny)
  t.group('modify against retain length > 1', () => {
    const target = c().retain(3, { a: 1 })
    target.apply(c().modify(c().insert('x')))
    t.compare(target,
      c()
        .modify(c().insert('x'), { a: 1 })
        .retain(2, { a: 1 })
    )
  })
  t.group('modify with format mid-InsertOp splits the insert into three', () => {
    // applying a `modify({...}, format)` at offset 1 of an InsertOp of three
    // delta items should split the insert into [item0], [item1 with format],
    // [item2] and apply the inner modify to item1.
    const sub = /** @param {string} s */ (s) => c().insert(s)
    const a = c().insert([sub('1'), sub('2'), sub('3')])
    a.apply(c().retain(1).modify(c().insert('a'), { x: 1 }))
    const ops = []
    for (const op of a.children) ops.push(op)
    t.assert(ops.length === 3, 'three insert ops after split')
    t.assert(/** @type {any} */ (ops[1]).format?.x === 1, 'middle op picked up the format')
    t.compare(/** @type {any} */ (ops[1]).insert[0], sub('a2'), 'inner modify applied')
  })
}

/**
 * Concrete rebase scenarios on children. Not exhaustive — fuzz tests will
 * fill the matrix later. Each `t.group` locks in one of the rules from the
 * comment at delta.js:1747-1753.
 */
export const testRebaseChildren = () => {
  t.group('insert vs insert, priority=true keeps current at position 0', () => {
    const c = delta.create().insert('A')
    c.rebase(delta.create().insert('B'), true)
    t.compare(c, delta.create().insert('A'))
  })
  t.group('insert vs insert, priority=false shifts current by a retain', () => {
    const c = delta.create().insert('A')
    c.rebase(delta.create().insert('B'), false)
    t.compare(c, delta.create().retain(1).insert('A'))
  })
  t.group('modify vs insert prepends a retain so modify still hits original child', () => {
    const c = delta.create().modify(delta.create().setAttr('x', 1))
    c.rebase(delta.create().insert([1]), false)
    t.compare(c, delta.create().retain(1).modify(delta.create().setAttr('x', 1)))
  })
  t.group('modify vs delete drops the modify entirely', () => {
    const c = delta.create().modify(delta.create().setAttr('x', 1))
    c.rebase(delta.create().delete(1), false)
    t.assert(c.childCnt === 0)
    t.assert(c.children.len === 0)
  })
  t.group('modify vs modify recurses on the inner delta (priority decides)', () => {
    // ModifyOp.clone() marks its inner delta as `done`. The rebase recursion
    // must therefore go through `_modValue`, not `.value`, or it would throw
    // "Readonly Delta can't be modified" the moment a cloned ModifyOp is
    // rebased — which is exactly what happens on the `apply(diff.rebase(...))`
    // path in convergence.
    const base = delta.create().insert([delta.create().setAttr('x', 0).done()]).done()
    const d1 = delta.create().modify(delta.create().setAttr('x', 1))
    const d2 = delta.create().modify(delta.create().setAttr('x', 2))
    const stateA = delta.clone(base).apply(delta.clone(d1)).apply(delta.clone(d2).rebase(d1, false))
    const stateB = delta.clone(base).apply(delta.clone(d2)).apply(delta.clone(d1).rebase(d2, true))
    t.compare(stateA, stateB) // TP1
    // priority assigned to d1 on both paths, so x must end up as d1's value
    t.assert(/** @type {any} */ (stateA.children.start).insert[0].attrs.x?.value === 1)
  })
  t.group('retain vs retain format conflict: split prefix AND suffix when overlap is mid-op', () => {
    // The format-reconciliation block has to split currChild on BOTH sides
    // whenever the overlap is strictly interior — `currOffset > 0` *and*
    // `currOffset + maxCommonLen < currChild.length`. Fuzz tests rarely line
    // up exactly this way: diff2's wide formatted retain spans diff1's
    // narrow conflicting retain in the middle, forcing the reconciliation
    // to emit three retain ops (prefix-with-orig-format, middle-stripped,
    // suffix-with-orig-format).
    const base = delta.create().insert('abcde').done()
    const d1 = delta.create().retain(1).retain(2, { bold: false }).retain(2)
    const d2 = delta.create().retain(5, { bold: true })
    const stateA = delta.clone(base).apply(delta.clone(d1)).apply(delta.clone(d2).rebase(d1, false))
    const stateB = delta.clone(base).apply(delta.clone(d2)).apply(delta.clone(d1).rebase(d2, true))
    t.compare(stateA, stateB) // TP1
    // d1 has priority on both paths → bold:false survives on the inner 'bc'
    t.compare(stateA, delta.create()
      .insert('a', { bold: true })
      .insert('bc', { bold: false })
      .insert('de', { bold: true })
    )
  })
  t.group('retain vs retain format conflict: partial overlap keeps the non-conflicting key', () => {
    // currChild carries TWO format keys; only `bold` is also written by otherChild. `bold` is
    // conceded (strippedAny) while `color` is kept, so `stripped` is non-empty and the middle retain
    // takes {color:'red'} — the `: stripped` branch of the format reconciliation in rebase (the
    // all-keys-conceded `null` branch is covered by the group above).
    const base = delta.create().insert('abcde').done()
    const d1 = delta.create().retain(1).retain(2, { bold: false }).retain(2)
    const d2 = delta.create().retain(5, { bold: true, color: 'red' })
    const stateA = delta.clone(base).apply(delta.clone(d1)).apply(delta.clone(d2).rebase(d1, false))
    const stateB = delta.clone(base).apply(delta.clone(d2)).apply(delta.clone(d1).rebase(d2, true))
    t.compare(stateA, stateB) // TP1
    // d1 has priority → bold:false wins on 'bc'; color:'red' (only on d2) survives everywhere
    t.compare(stateA, delta.create()
      .insert('a', { bold: true, color: 'red' })
      .insert('bc', { bold: false, color: 'red' })
      .insert('de', { bold: true, color: 'red' })
    )
  })
  t.group('retain vs retain: a blanket `null` clear always wins (priority-independent) → converges to cleared', () => {
    // A blanket clear is a local-only utility: it beats a concurrent set on BOTH rebase orderings (the
    // `otherChild.format === null` concession is priority-independent), so the result always ends up
    // cleared and the concurrent set is LOST. This single TP1 case exercises both new code paths: stateA's
    // rebase has currChild=clear (stays, wins); stateB's has otherChild=clear (currChild concedes despite
    // having priority). See the `Formats` docs for why `null` must not cross a channel.
    const base = delta.create().insert('abcde', { italic: true }).done()
    const d1 = delta.create().retain(5, { bold: true }) // d1 has priority, sets bold
    const d2 = delta.create().retain(5, null) // d2 concedes, clears all
    const stateA = delta.clone(base).apply(delta.clone(d1)).apply(delta.clone(d2).rebase(d1, false))
    const stateB = delta.clone(base).apply(delta.clone(d2)).apply(delta.clone(d1).rebase(d2, true))
    t.compare(stateA, stateB) // TP1
    t.compare(stateA, delta.create().insert('abcde')) // both the pre-existing italic and d1's bold are cleared
  })
  t.group('retain vs retain: a clear over part of a formatted run splits and clears only the overlap', () => {
    // exercises the split-around-overlap path of the `otherChild.format === null` branch (prefix + suffix)
    const base = delta.create().insert('abcde').done()
    const d1 = delta.create().retain(5, { bold: true }) // d1 priority, bold on all 5
    const d2 = delta.create().retain(1).retain(2, null).retain(2) // d2 concedes, clears the middle 'bc'
    const stateA = delta.clone(base).apply(delta.clone(d1)).apply(delta.clone(d2).rebase(d1, false))
    const stateB = delta.clone(base).apply(delta.clone(d2)).apply(delta.clone(d1).rebase(d2, true))
    t.compare(stateA, stateB) // TP1
    t.compare(stateA, delta.create()
      .insert('a', { bold: true })
      .insert('bc')
      .insert('de', { bold: true })
    )
  })
  t.group('retain vs retain: a per-key `{k:null}` removal reconciles by priority (converges, no data loss)', () => {
    // Unlike a blanket clear, a per-key removal is just another key write: it yields to a higher-priority
    // concurrent write on the same key (the existing strip-loop), so the concurrent set is NOT lost. This is
    // the recommended way to clear formats/attributions — what the rebase fuzz exercises.
    const base = delta.create().insert('abcde', { bold: true }).done()
    const d1 = delta.create().retain(5, { bold: false }) // d1 priority: set bold:false
    const d2 = delta.create().retain(5, { bold: null }) // d2 concedes: remove bold
    const stateA = delta.clone(base).apply(delta.clone(d1)).apply(delta.clone(d2).rebase(d1, false))
    const stateB = delta.clone(base).apply(delta.clone(d2)).apply(delta.clone(d1).rebase(d2, true))
    t.compare(stateA, stateB) // TP1
    t.compare(stateA, delta.create().insert('abcde', { bold: false })) // d1's set wins; the removal is conceded
  })
  t.group('delete vs delete with the same length leaves no remaining childCnt', () => {
    const c = delta.create().delete(2)
    c.rebase(delta.create().delete(2), false)
    t.assert(c.childCnt === 0, 'overlap consumed the entire delete')
  })
  t.group('retain vs insert (offset=0) inserts a leading retain', () => {
    const c = delta.create().retain(3)
    c.rebase(delta.create().insert('B'), false)
    // rebase does not merge adjacent retains, so we get two retain ops
    t.assert(c.childCnt === 4)
    t.assert(c.children.len === 2)
    const start = /** @type {any} */ (c.children.start)
    const end = /** @type {any} */ (c.children.end)
    t.assert(delta.$retainOp.check(start) && start.retain === 1)
    t.assert(delta.$retainOp.check(end) && end.retain === 3)
  })
  t.group('rebaseOnInverse is currently a no-op stub', () => {
    // unimplemented; locks in current behavior — the next implementer will see
    // this fail and update it.
    const c = delta.create().insert('hi')
    const before = c.toJSON()
    const result = c.rebaseOnInverse(delta.create().insert('!'), false)
    t.assert(result === c, 'returns the receiver')
    t.compare(c.toJSON(), before, 'state unchanged')
  })
}

/**
 * `delta.diff` cannot operate on inputs that already contain `delete` ops —
 * the diff algorithm only knows how to compare insertions. Doing so throws a
 * documented `[lib0/delta] diffing deletes unsupported` error.
 */
export const testDiffRejectsDeletes = () => {
  const c = () => delta.create(delta.$deltaAny)
  const d1 = c().retain(2).delete(3).done()
  const d2 = c().insert('hi').done()
  t.fails(() => delta.diff(d1, d2))
}

/**
 * The `_modValue` getters on InsertOp / ModifyOp / SetAttrOp lazily clone the
 * sub-delta when it is `done` (so a frozen value is never mutated in-place),
 * and reuse it when it is still mutable.
 */
export const testLazyModValueClone = () => {
  t.group('SetAttrOp with a not-yet-done value is reused', () => {
    const inner = delta.create().setAttr('x', 1)
    const a = delta.create().setAttr('m', inner)
    a.apply(delta.create().modifyAttr('m', delta.create().setAttr('x', 2)))
    const op = /** @type {any} */ (a.attrs).m
    t.assert(delta.$setAttrOp.check(op))
    t.assert(op.value === inner, 'no clone because inner was not done')
    t.assert(op.value.attrs.x?.value === 2)
  })
  t.group('ModifyOp with a done value is cloned on apply', () => {
    const inner = delta.create().setAttr('x', 1).done()
    const a = delta.create().modify(inner)
    a.apply(delta.create().modify(delta.create().setAttr('x', 2)))
    const op = /** @type {any} */ (a.children.start)
    t.assert(delta.$modifyOp.check(op))
    t.assert(op.value !== inner, 'done value was cloned before mutation')
    t.assert(op.value.attrs.x?.value === 2)
  })
  t.group('InsertOp with a not-yet-done sub-delta is reused', () => {
    const sub = delta.create().setAttr('x', 1)
    const a = delta.create().insert([sub])
    a.apply(delta.create().modify(delta.create().setAttr('x', 2)))
    const op = /** @type {any} */ (a.children.start)
    t.assert(delta.$insertOp.check(op))
    t.assert(op.insert[0] === sub, 'no clone because sub was not done')
    t.assert(op.insert[0].attrs.x?.value === 2)
  })
}

/**
 * `toJSON` round-trips the structural data of every op kind, including nested
 * deltas (recursively) and optional `format` / `attribution` blobs. The op
 * level is where embedded deltas get unwrapped to plain JSON.
 */
export const testOpJsonSerialization = () => {
  t.group('InsertOp with nested deltas, format, and attribution', () => {
    const inner = delta.create().insert('hi')
    const d = delta.create().insert([inner], { bold: true }, { insert: ['me'] })
    t.compare(d.toJSON(), {
      type: 'delta',
      children: [{
        type: 'insert',
        insert: [{ type: 'delta', children: [{ type: 'insert', insert: 'hi' }] }],
        format: { bold: true },
        attribution: { insert: ['me'] }
      }]
    })
  })
  t.group('RetainOp with format and attribution', () => {
    const d = delta.create().retain(2, { italic: true }, { insert: ['x'] })
    t.compare(d.toJSON(), {
      type: 'delta',
      children: [{ type: 'retain', retain: 2, format: { italic: true }, attribution: { insert: ['x'] } }]
    })
  })
  t.group('ModifyOp with format and attribution', () => {
    const d = delta.create().modify(delta.create().setAttr('x', 1), { bold: true }, { insert: ['m'] })
    t.compare(d.toJSON(), /** @type {any} */ ({
      type: 'delta',
      children: [{
        type: 'modify',
        value: { type: 'delta', attrs: { x: { type: 'insert', value: 1 } } },
        format: { bold: true },
        attribution: { insert: ['m'] }
      }]
    }))
  })
  t.group('ModifyOp without extras emits no format/attribution keys', () => {
    const d = delta.create().modify(delta.create().setAttr('x', 1))
    t.compare(d.toJSON(), /** @type {any} */ ({
      type: 'delta',
      children: [{
        type: 'modify',
        value: { type: 'delta', attrs: { x: { type: 'insert', value: 1 } } }
      }]
    }))
  })
  t.group('SetAttrOp with a delta value + attribution recurses', () => {
    const d = delta.create().setAttr('m', delta.create().setAttr('x', 1), { insert: ['u'] })
    t.compare(d.toJSON(), {
      type: 'delta',
      attrs: {
        m: {
          type: 'insert',
          value: { type: 'delta', attrs: { x: { type: 'insert', value: 1 } } },
          attribution: { insert: ['u'] }
        }
      }
    })
  })
}

/**
 * `delta.apply(null)` is documented as a no-op so callers can apply an
 * optional change without a null guard at every call site.
 */
export const testApplyNullIsNoop = () => {
  const d = delta.create().insert('hi')
  const before = d.toJSON()
  const result = d.apply(null)
  t.assert(result === d, 'returns the receiver')
  t.compare(d.toJSON(), before, 'state unchanged')
}

/**
 * The top-level `name` is a document-type marker, not diffable content. Diff
 * of `<div>a</div>` against `<span>a</span>` yields an empty diff with no
 * name — the children/attrs match, so as far as `diff` is concerned the two
 * inputs are equal at the level it cares about.
 */
export const testDiffMismatchedNames = () => {
  const d1 = /** @type {delta.DeltaAny} */ (delta.create('div').insert('a').done())
  const d2 = /** @type {delta.DeltaAny} */ (delta.create('span').insert('a').done())
  const diff = delta.diff(d1, d2)
  t.assert(diff.name === null, 'mismatched names → diff is name-less')
  t.assert(diff.isEmpty(), 'children are equal → diff has no ops')
}

/**
 * `Delta.fingerprint` sorts attribute keys deterministically: numeric keys
 * first (ascending), then string keys (locale-compared). The fingerprint
 * must therefore be order-independent w.r.t. the order in which `setAttr`
 * calls were made.
 */
export const testFingerprintAttrKeyOrdering = () => {
  // mix numeric and string keys, set in different orders on each delta
  const a = delta.create().setAttr(2, 'b').setAttr(1, 'a').setAttr('z', 1).setAttr('a', 2)
  const b = delta.create().setAttr('a', 2).setAttr('z', 1).setAttr(1, 'a').setAttr(2, 'b')
  t.assert(a.fingerprint === b.fingerprint, 'order of setAttr calls does not affect fingerprint')
}

/**
 * The `$XOpWith($content)` schemas wrap an op-shape schema in a content
 * check: the op must be of the right kind AND its inner content must
 * conform to `$content`. The point is to distinguish ops that look the
 * same structurally but carry different payloads. Each sub-test passes the
 * SAME op shape against two schemas — one whose content predicate accepts
 * the payload, one whose predicate rejects it — so a "pass" or "fail"
 * outcome can only come from the content check, not from the op-kind check.
 */
export const testOpWithSchemas = () => {
  t.group('$setAttrOpWith inspects SetAttrOp.value', () => {
    const strOp = /** @type {any} */ (delta.create().setAttr('k', 'hello').attrs.k)
    const numOp = /** @type {any} */ (delta.create().setAttr('k', 42).attrs.k)
    t.assert(delta.$setAttrOpWith(s.$string).check(strOp))
    t.assert(!delta.$setAttrOpWith(s.$string).check(numOp),
      'same SetAttrOp shape, different value type → rejected')
    // sanity: a non-attr op fails the kind check regardless of content
    t.assert(!delta.$setAttrOpWith(s.$string).check(delta.create().insert('hi').children.start))
  })
  t.group('$insertOpWith inspects EVERY element of InsertOp.insert', () => {
    const allNums = /** @type {any} */ (delta.create().insert([1, 2, 3]).children.start)
    // Same op shape (InsertOp wrapping an array), but one element breaks the
    // homogeneity. `.every` short-circuits on the first mismatch — if this
    // were instead checking the whole array against `$number`, both would
    // fail; the point is that the schema drills INTO the array.
    const oneBadApple = /** @type {any} */ (delta.create().insert([1, 2, /** @type {any} */ ('three')]).children.start)
    t.assert(delta.$insertOpWith(s.$number).check(allNums))
    t.assert(!delta.$insertOpWith(s.$number).check(oneBadApple),
      'one non-number element fails the per-element check')
  })
  t.group('$modifyOpWith inspects the inner Delta of ModifyOp.value', () => {
    // Both are ModifyOps wrapping a Delta — the inner deltas differ only in
    // what they describe (mutation of children vs. mutation of attrs). A
    // schema that demands the inner delta have at least one child op
    // discriminates between them.
    const $innerHasChildren = s.$custom(d => delta.$deltaAny.check(d) && d.children.len > 0)
    const modWithChildren = /** @type {any} */ (delta.create().modify(delta.create().insert('x')).children.start)
    const modAttrsOnly = /** @type {any} */ (delta.create().modify(delta.create().setAttr('y', 1)).children.start)
    t.assert(delta.$modifyOpWith($innerHasChildren).check(modWithChildren))
    t.assert(!delta.$modifyOpWith($innerHasChildren).check(modAttrsOnly),
      'same ModifyOp shape with empty-children inner delta → rejected')
  })
  t.group('$modifyAttrOpWith inspects the inner Delta of ModifyAttrOp.value', () => {
    // Symmetric to $modifyOpWith — here we discriminate on inner attrs.
    // Object.keys() ignores Symbol-keyed entries, so the iterator helper
    // on `attrs` doesn't pollute the count.
    const $innerHasAttrs = s.$custom(d => delta.$deltaAny.check(d) && Object.keys(d.attrs).length > 0)
    const modAttrsInner = /** @type {any} */ (delta.create().modifyAttr('k', delta.create().setAttr('z', 1)).attrs.k)
    const modChildrenInner = /** @type {any} */ (delta.create().modifyAttr('k', delta.create().insert('x')).attrs.k)
    t.assert(delta.$modifyAttrOpWith($innerHasAttrs).check(modAttrsInner))
    t.assert(!delta.$modifyAttrOpWith($innerHasAttrs).check(modChildrenInner),
      'same ModifyAttrOp shape with no-attrs inner delta → rejected')
  })
}

/**
 * Attribute keys may be numbers or strings. The two forms behave differently
 * even though plain-object storage coerces numeric keys to their string form:
 * `SetAttrOp.key` preserves the original type, which the fingerprint sort
 * (numbers before strings) and the equality check both rely on.
 */
export const testNumericAndStringAttrKeys = () => {
  t.group('setAttr(1, …) and setAttr("1", …) collide — JS object storage shares property "1"', () => {
    // Both writes land at this.attrs['1'] because JS coerces numeric property
    // keys to strings. Only the last one survives; the SetAttrOp it carries
    // remembers the originally-passed key type on its `.key` field.
    const numFirst = delta.create().setAttr(1, 'first').setAttr('1', 'second')
    /** @type {Array<any>} */
    const numFirstOps = []
    for (const op of numFirst.attrs) numFirstOps.push(op)
    t.assert(numFirstOps.length === 1, 'second write overwrites the first')
    t.assert(numFirstOps[0].key === '1' && numFirstOps[0].value === 'second')

    const strFirst = delta.create().setAttr('1', 'first').setAttr(1, 'second')
    /** @type {Array<any>} */
    const strFirstOps = []
    for (const op of strFirst.attrs) strFirstOps.push(op)
    t.assert(strFirstOps.length === 1)
    t.assert(strFirstOps[0].key === 1 && strFirstOps[0].value === 'second',
      'when number key is written last, op.key is the number 1')

    // The two surviving SetAttrOps differ in op.key type (number vs string),
    // so the fingerprints diverge even though storage location is the same.
    t.assert(numFirst.fingerprint !== strFirst.fingerprint,
      'numeric vs string key produces distinct fingerprints')
  })
  t.group('fingerprint sort is stable across numeric AND string keys', () => {
    // The sort comparator places numbers before strings. With both kinds of
    // keys present, two deltas built in different orders must still hash to
    // the same fingerprint. Including a non-integer-like numeric key (-1)
    // pushes it past the string keys in `for…in` iteration — that's the only
    // shape that makes the sort comparator compare a number positioned AFTER
    // a string in the keys array, reaching the (num, str) → -1 branch.
    const a = delta.create()
      .setAttr(2, 'B').setAttr('z', 1).setAttr(-1, 'neg').setAttr('a', 2).setAttr(1, 'A')
    const b = delta.create()
      .setAttr('a', 2).setAttr(1, 'A').setAttr(-1, 'neg').setAttr(2, 'B').setAttr('z', 1)
    t.assert(a.fingerprint === b.fingerprint, 'fingerprint is independent of write order')
    // Sanity-check the iteration shape that's required for sort coverage:
    // '1' and '2' (integer-like) iterate first ascending, then the inserted
    // string keys IN INSERTION ORDER — and '-1' is a string-keyed property
    // (not integer-like in JS), so it iterates between 'z' and 'a'. The
    // resulting keys array has a number positioned AFTER a string, which is
    // the only shape that makes V8's sort comparator hit (num, str) → -1.
    const keys = []
    for (const op of a.attrs) keys.push(op.key)
    t.compare(keys, [1, 2, 'z', -1, 'a'])
  })
}

/**
 * `updateUsedFormats` / `updateUsedAttribution` are intended for repeated
 * incremental updates. Setting a key to the value it already holds is a
 * no-op — it preserves object identity so consumers can cheaply detect "did
 * anything change?" via `===`.
 */
export const testUsedFormatsIdempotent = () => {
  t.group('updateUsedFormats(name, sameValue) preserves identity', () => {
    const d = delta.create().updateUsedFormats('bold', true)
    const before = d.usedFormats
    d.updateUsedFormats('bold', true)
    t.assert(d.usedFormats === before)
  })
  t.group('updateUsedAttribution(name, equalValue) preserves identity', () => {
    const d = delta.create().updateUsedAttribution('insert', ['me'])
    const before = d.usedAttribution
    // structurally equal array — still a no-op because `equalityDeep` is used
    d.updateUsedAttribution('insert', ['me'])
    t.assert(d.usedAttribution === before)
  })
}

/**
 * `$delta(spec).check(d)` returns `false` (instead of throwing) when the
 * delta violates the spec. Each branch covers one shape of mismatch.
 */
export const testSchemaCheckRejections = () => {
  t.group('text content in a no-text schema is rejected', () => {
    const $d = delta.$delta({ children: s.$number })
    t.assert(!$d.check(delta.create().insert('hi')))
  })
  t.group('insert item that does not match `children` is rejected', () => {
    const $d = delta.$delta({ children: s.$number })
    t.assert($d.check(delta.create().insert([42])), 'valid item accepted')
    t.assert(!$d.check(delta.create().insert(['not-a-number'])))
  })
  t.group('attr value that does not match `attrs` is rejected', () => {
    const $d = delta.$delta({ attrs: { x: s.$number } })
    t.assert($d.check(delta.create().setAttr('x', 1)), 'valid attr accepted')
    t.assert(!$d.check(delta.create().setAttr('x', 'str')))
  })
  t.group('text-op format that does not match `formats` is rejected', () => {
    const $d = delta.$delta({ text: true, formats: { bold: s.$boolean } })
    t.assert($d.check(delta.create().insert('hi', { bold: true })), 'valid format accepted')
    t.assert(!$d.check(delta.create().insert('hi', { bold: 'not-bool' })))
  })
}
