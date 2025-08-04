import * as error from '../error.js'
import * as t from 'lib0/testing'
import * as dmap from './map.js'
import * as s from 'lib0/schema'

/**
 * @param {t.TestCase} _tc
 */
export const testMapDeltaBasics = _tc => {
  const $d = s.$object({
    num: s.$union(s.$number, s.$string),
    str: s.$string
  })
  const d = dmap.create($d)
  t.fails(() => {
    // @ts-expect-error
    d.set('str', 42)
  })
  d.set('str', 'hi')
  t.fails(() => {
    // @ts-expect-error
    d.set('?', 'hi')
  })

  d.forEach((c) => {
    if (c.key === 'str') {
      // @ts-expect-error because value can't be a string
      c.value === 42
    } else if (c.key === 'num') {
      c.value === 42
    } else {
      // no other option, this will always throw if called
      s.assert(c, s.$never)
    }
  })
  // @ts-expect-error
  d.get('?')
  const x = d.get('str')
  t.assert(dmap.$insertOp(s.$string).optional.check(x) && dmap.$insertOp(s.$string).optional.validate(x))
  t.assert(!dmap.$insertOp(s.$number).optional.check(x))
  d.has('str')
  // @ts-expect-error should throw type error
  d.has('_')
  for (const entry of d) {
    // ensure that typings work correctly when iterating through changes
    if (entry.key === 'str') {
      t.assert(dmap.$insertOp(s.$string).optional.check(entry))
      t.assert(!dmap.$insertOp(s.$number).optional.check(entry))
    }
  }
  const ddone = d.done()
}

/**
 * @param {t.TestCase} _tc
 */
export const testMapDeltaModify = _tc => {
  // Yjs users will create nested Yjs types like this (instead of $mapDelta they would use $yarray):
  const $d = s.$object({
    num: s.$union(s.$number, s.$string),
    str: s.$string,
    map: dmap.$deltaMap(s.$object({ x: s.$number }))
  })
  const $dsmaller = s.$object({
    str: s.$string
  })
  t.group('test extensibility', () => {
    // observeDeep needs to transform this to a modifyOp, while preserving tying
    const d = dmap.create($d)
    t.assert(dmap.$deltaMap($d).check(d))
    t.assert(dmap.$deltaMap($dsmaller).check(d))
    t.assert(!dmap.$deltaMap($d).check(dmap.create($dsmaller)))
  })
  t.group('test delta insert', () => {
    const d = dmap.create($d)
    d.set('map', dmap.create(s.$object({ x: s.$number })).set('x', 42 ))
    d.forEach(change => {
      if (change.key === 'map' && change.type === 'insert') {
        dmap.$deltaMap(s.$object({ x: s.$number })).validate(change.value)
      } else {
        error.unexpectedCase()
      }
    })
  })
  t.group('test modify', () => {
    const d = dmap.create($d)
    d.modify('map', dmap.create(s.$object({ x: s.$number })).delete('x'))
    d.forEach(change => {
      if (change.key === 'map' && change.type === 'modify') {
        dmap.$deltaMap(s.$object({ x: s.$number })).validate(change.value)
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
  const d = dmap.create(x)
  d.delete('over')
  d.set('key', 'value')
    .useAttribution({ delete: ['me'] })
    .delete('v', 94)
    .useAttribution(null)
    .set('over', 'andout', 'i existed before')
    .done()
  t.compare(d.toJSON(), {
    key: { type: 'insert', value: 'value', prevValue: undefined, attribution: null },
    v: { type: 'delete', prevValue: 94, attribution: { delete: ['me'] } },
    over: { type: 'insert', value: 'andout', prevValue: 'i existed before', attribution: null }
  })
  t.compare(d.origin, null)
  t.compare(d.remote, false)
  t.compare(d.isDiff, true)
  d.forEach(change => {
    if (change.key === 'v') {
      t.assert(d.get(change.key)?.prevValue === 94) // should know that value is number
      if (dmap.$insertOp(s.$any).check(change)) {
        // @ts-expect-error
        change.value === ''
        t.assert(change.value === undefined)
        t.assert(change.prevValue === 94)
      } else if (dmap.$deleteOp(s.$any).check(change)) {
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
  for (const change of d) {
    const {key, value, prevValue} = change
    if (key === 'v') {
      t.assert(d.get(key)?.prevValue === 94)
      t.assert(prevValue === 94) // should know that value is number
    } else if (key === 'key') {
      t.assert(value === 'value') // should know that value is string
      // @ts-expect-error
      t.assert(value !== 42)
    } else if (key === 'over') {
      t.assert(value === 'andout')
    } else {
      throw new Error()
    }
  }
}
