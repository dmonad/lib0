import * as t from 'lib0/testing'
import * as s from 'lib0/schema'
import * as delta from './d2.js'
import * as error from '../error.js'
import * as prng from '../prng.js'

export const testDeltaBasics = () => {
  const ds_ = delta.create(delta.$delta(s.$string, s.$object({ k: s.$number }), s.$string))
  const ds = delta.create('root', delta.$delta(s.$string, s.$object({ k: s.$number, d: delta.$delta(s.$literal('sub'), s.$object({  }), s.$string) }), s.$string))
  ds.insert('dtrn')
  ds.modify('d', delta.create('sub', null, 'hi'))
  ds.apply(delta.create('root', { k: 42 }, 'content'))
  ds.apply(delta.create('root', { k: 42 }))
  // @ts-expect-error
  t.fails(() => ds.apply(delta.create('root', { k: 'hi' }, 'content')))
  const m42 = delta.create('42').insert([42])
  const d1 = delta.create().insert('hi')
  const q = d1.insert([42]).insert('hi').insert([{ there: 42 }]).insert(['']).insert(['dtrn']).insert('stri').insert('dtruniae')
  const p = d1.set('hi', 'there').set('test', 42).set(42, 43)
  const tdelta = delta.create().insert('dtrn').insert([42]).insert(['', { q: 42} ]).set('kv', false).set('x', 42)
  // @ts-expect-error
  const applyTest = delta.create().insert('hi').apply(delta.create().insert('there').insert([42]))
  // @ts-expect-error
  const applyTestMap = delta.create().set('x', 42).apply(delta.create().set('x', '42'))
  // @ts-expect-error
  const applyTestMap2 = delta.create().set('x', 42).apply(delta.create().set('y', '42'))
  const applyMapTest3 = delta.create().set('x', 42).apply(delta.create().unset('x'))
  const t2 = delta.create().insert('hi').insert(['there']).set('k', '42').set('k', 42)
  const applyTest2 = t2.apply(delta.create().insert('there').insert(['dtrn']).set('k', 42))
  const m = delta.create().set('x', 42).set('y', 'str').insert('hi').insert([42])
  m.apply(delta.create().set('y', undefined).insert('hi'))
  const m2 = m.set('k', m).modify('k', m)
}

/**
 * @param {t.TestCase} _tc
 */
export const testDelta = _tc => {
  const d = delta.create().insert('hello').insert(' ').useAttributes({ bold: true }).insert('world').useAttribution({ insert: ['tester'] }).insert('!')
  t.compare(d.toJSON(), { children: [{ insert: 'hello ' }, { insert: 'world', format: { bold: true } }, { insert: '!', format: { bold: true }, attribution: { insert: ['tester'] } }] })
}

/**
 * @param {t.TestCase} _tc
 */
export const testDeltaMerging = _tc => {
  const d = delta.create(delta.$delta(s.$string, s.$union(s.$object({})), s.$union(s.$string,s.$array(s.$number,s.$object({})))))
    .insert('hello')
    .insert('world')
    .insert(' ', { italic: true })
    .insert([{}])
    .insert([1])
    .insert([2])
  t.compare(d.toJSON(), { children: [{ insert: 'helloworld' }, { insert: ' ', format: { italic: true } }, { insert: [{}, 1, 2] }] })
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

/**
 * @param {t.TestCase} _tc
 */
export const testMapDeltaBasics = _tc => {
  const $d = s.$object({
    num: s.$union(s.$number, s.$string),
    str: s.$string
  })
  const dmap = delta.create(delta.$delta(s.$any, $d, s.$never))
  t.fails(() => {
    // @ts-expect-error
    dmap.apply(delta.create().set('str', 42))
  })
  dmap.set('str', 'hi')
  dmap.attrs.forEach((c) => {
    if (c.key === 'str') {
      // @ts-expect-error because value can't be a string
      t.assert(c.value !== 42)
    } else if (c.key === 'num') {
      t.assert(c.value !== 42)
    } else {
      // no other option, this will always throw if called
      s.assert(c, s.$never)
    }
  })
  // @ts-expect-error
  dmap.attrs.get('?')
  const x = dmap.attrs.get('str')
  t.assert(delta.$insertOpWith(s.$string).optional.check(x) && delta.$insertOpWith(s.$string).optional.validate(x))
  t.assert(!delta.$insertOpWith(s.$number).optional.check(x))
  dmap.attrs.has('str')
  // @ts-expect-error should throw type error
  dmap.attrs.has('_')
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapDeltaModify = _tc => {
  // Yjs users will create nested Yjs types like this (instead of $mapDelta they would use $yarray):
  const $d = delta.$delta(s.$any, s.$object({
    num: s.$union(s.$number, s.$string),
    str: s.$string,
    map: delta.$delta(s.$any, s.$object({ x: s.$number }), s.$never)
  }), s.$never)
  const $dsmaller = delta.$delta(s.$any, s.$object({
    str: s.$string
  }), s.$never)
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
    const testDeleteThis = delta.create(delta.$delta(null, s.$object({ x: s.$number }))).set('x', 42)
    d.set('map', testDeleteThis)
    d.attrs.forEach(change => {
      if (change.key === 'map' && change.type === 'insert') {
        delta.$delta(s.$any, s.$object({ x: s.$number }), s.$never).validate(change.value)
      } else {
        error.unexpectedCase()
      }
    })
  })
  t.group('test modify', () => {
    const d = delta.create($d)
    d.modify('map', delta.create().unset('x'))
    d.attrs.forEach(change => {
      if (change.key === 'map' && change.type === 'modify') {
        delta.$delta(null, s.$object({ x: s.$number })).validate(change.value)
      } else {
        error.unexpectedCase()
      }
    })
  })
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapDelta = _tc => {
  const x = delta.$delta(null, s.$object({
    key: s.$string,
    v: s.$number,
    over: s.$string
  }), null)
  const d = delta.create(x)
    .unset('over')
    .set('key', 'value')
    .useAttribution({ delete: ['me'] })
    .unset('v')
    .useAttribution(null)
    .set('over', 'andout')
  
  t.compare(d.toJSON(), {
    attrs: {
      key: { type: 'insert', value: 'value' },
      v: { type: 'delete', attribution: { delete: ['me'] } },
      over: { type: 'insert', value: 'andout' }
    }
  })
  t.compare(d.origin, null)
  d.attrs.forEach(change => {
    if (change.key === 'v') {
      t.assert(d.attrs.get(change.key)?.prevValue !== 94) // should know that value is number
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
      t.assert(d.attrs.get(change.key)?.value === 'value') // show know that value is a string
      t.assert(change.value === 'value')
    } else if (change.key === 'over') {
      t.assert(change.value === 'andout')
    } else {
      throw new Error()
    }
  })
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRebaseMergeDeltas = tc => {
  const $d = delta.$delta(null, s.$object({ a: s.$number, b: delta.$delta(null, s.$object({ x: s.$string })) }))
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
          d.modify('b', delta.create().set('x', prng.utf16String(gen)))
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
        ops[i].rebase(ops[j], ops[i].origin < ops[j].origin)
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

