import * as error from '../error.js'
import * as t from '../testing.js'
import * as delta from './index.js'
import * as s from '../schema.js'
import * as prng from '../prng.js'

/**
 * @param {t.TestCase} _tc
 */
export const testMapDeltaBasics = _tc => {
  const $d = s.$object({
    num: s.$union(s.$number, s.$string),
    str: s.$string
  })
  const dmap = delta.map($d)
  t.fails(() => {
    // @ts-expect-error
    dmap.set('str', 42)
  })
  dmap.set('str', 'hi')
  t.fails(() => {
    // @ts-expect-error
    dmap.set('?', 'hi')
  })

  dmap.forEach((c) => {
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
  dmap.get('?')
  const x = dmap.get('str')
  t.assert(delta.$insertOpWith(s.$string).optional.check(x) && delta.$insertOpWith(s.$string).optional.validate(x))
  t.assert(!delta.$insertOpWith(s.$number).optional.check(x))
  dmap.has('str')
  // @ts-expect-error should throw type error
  dmap.has('_')
  dmap.done()
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapDeltaModify = _tc => {
  // Yjs users will create nested Yjs types like this (instead of $mapDelta they would use $yarray):
  const $d = s.$object({
    num: s.$union(s.$number, s.$string),
    str: s.$string,
    map: delta.$map(s.$object({ x: s.$number }))
  })
  const $dsmaller = s.$object({
    str: s.$string
  })
  t.group('test extensibility', () => {
    // observeDeep needs to transform this to a modifyOp, while preserving tying
    const d = delta.map().set('num', 42)
    t.assert(delta.$map($d).check(d))
    t.assert(delta.$map($dsmaller).check(d))
    t.assert(delta.$map($d).check(delta.map().set('x', 99))) // this should work, since this is a unknown property
    t.assert(!delta.$map($d).check(delta.map().set('str', 99))) // this shoul fail, since str is supposed to be a string
  })
  t.group('test delta insert', () => {
    const d = delta.map($d)
    const testDeleteThis = delta.map(s.$object({ x: s.$number })).set('x', 42).done()
    d.set('map', testDeleteThis)
    d.forEach(change => {
      if (change.key === 'map' && change.type === 'insert') {
        delta.$map(s.$object({ x: s.$number })).validate(change.value)
      } else {
        error.unexpectedCase()
      }
    })
  })
  t.group('test modify', () => {
    const d = delta.map($d)
    d.modify('map', delta.map(s.$object({ x: s.$number })).delete('x'))
    d.forEach(change => {
      if (change.key === 'map' && change.type === 'modify') {
        delta.$map(s.$object({ x: s.$number })).validate(change.value)
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
  const x = s.$object({
    key: s.$string,
    v: s.$number,
    over: s.$string
  })
  const d = delta.map(x)
    .delete('over')
    .set('key', 'value')
    .useAttribution({ delete: ['me'] })
    .delete('v', 94)
    .useAttribution(null)
    .set('over', 'andout', 'i existed before')
    .done()
  t.compare(d.toJSON(), {
    key: { type: 'insert', value: 'value', attribution: null },
    v: { type: 'delete', attribution: { delete: ['me'] } },
    over: { type: 'insert', value: 'andout', attribution: null }
  })
  t.compare(d.origin, null)
  t.compare(d.remote, false)
  t.compare(d.isDiff, true)
  d.forEach(change => {
    if (change.key === 'v') {
      t.assert(d.get(change.key)?.prevValue === 94) // should know that value is number
      if (delta.$insertOp.check(change)) {
        // @ts-expect-error
        t.assert(change.value !== '')
        t.assert(change.value === undefined)
        t.assert(change.prevValue === 94)
      } else if (delta.$deleteOp.check(change)) {
        t.assert(change.value === undefined)
        t.assert(change.prevValue === 94 || change.prevValue === undefined)
      } else {
        t.fail('should be an insert op')
      }
    } else if (change.key === 'key') {
      if (change.type === 'insert') {
        t.assert(change.prevValue === undefined)
        t.assert(change.prevValue !== 'test')
        // @ts-expect-error should know that prevValue is not a string
        t.assert(change.prevValue !== 42)
      }
      t.assert(d.get(change.key)?.value === 'value') // show know that value is a string
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
  const $d = s.$object({ a: s.$number, b: delta.$map(s.$object({ x: s.$string })) })
  const $dm = delta.$map($d)
  console.log($dm)
  const gen = tc.prng
  const createDelta = () => {
    const d = delta.map($d)
    prng.oneOf(gen, [
      // create insert
      () => {
        if (prng.bool(gen)) {
          // write 'a'
          d.set('a', prng.int32(gen, 0, 365))
        } else if (prng.bool(gen)) {
          // 25% chance to create an insertion on 'b'
          d.set('b', delta.map(s.$object({ x: s.$string })).set('x', prng.utf16String(gen)).done())
        } else {
          // 25% chance to create a modify op on 'b'
          d.modify('b', delta.map(s.$object({ x: s.$string })).set('x', prng.utf16String(gen)).done())
        }
      },
      // create delete
      () => {
        if (prng.bool(gen)) {
          d.delete('a')
        } else {
          d.delete('b')
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
   * @param {Array<s.Unwrap<$dm>>} ops
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
   * @param {Array<s.Unwrap<typeof $dm>>} ops
   */
  const apply = ops => {
    const d = delta.map($d)
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

export const testMapSimplerTyping = () => {
  const x = delta.map(s.$object({ x: s.$number }))
  const y = delta.map({ x: s.$number })
  t.compare(x, y)
}
