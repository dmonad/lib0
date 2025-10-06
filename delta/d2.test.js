import * as t from 'lib0/testing'
import * as s from 'lib0/schema'
import * as delta from './d2.js'

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
  const d = delta.text()
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
    .done()
  const d2 = delta.text()
    .insert('a')
    .insert('b', { bold: true })
    .insert('c', { bold: 4 })
    .insert('d')
    .insert('e', { italic: true })
    .insert('f')
    .done()
  t.compare(d, d2)
}

/**
 * @param {t.TestCase} _tc
 */
export const testUseAttribution = _tc => {
  const d = delta.text()
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
    .done()
  const d2 = delta.text()
    .insert('a')
    .insert('b', null, { insert: ['me'] })
    .insert('c', null, { insert: ['you'] })
    .insert('d')
    .insert('e', null, { insert: ['me'] })
    .insert('f')
    .done()
  t.compare(d, d2)
}
