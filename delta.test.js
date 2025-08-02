import * as t from 'lib0/testing'
import * as delta from './delta.js'
import * as s from 'lib0/schema'

export const testSchema = () => {
  const x = delta.$arrayOp(s.$number)
  const d = delta.createArrayDelta([, d.$embedOp(s.$any)], [d.$any])
}

/**
 * @param {t.TestCase} _tc
 */
export const testDelta = _tc => {
  const d = delta.createTextDelta().insert('hello').insert(' ').useAttributes({ bold: true }).insert('world').useAttribution({ insert: ['tester'] }).insert('!').done()
  t.compare(d.toJSON(), [{ insert: 'hello ' }, { insert: 'world', attributes: { bold: true } }, { insert: '!', attributes: { bold: true }, attribution: { insert: ['tester'] } }])
}

/**
 * @param {t.TestCase} _tc
 */
export const testDeltaMerging = _tc => {
  const d = delta.createTextDelta()
    .insert('hello')
    .insert('world')
    .insert(' ', { italic: true })
    .insert({})
    .insert([1])
    .insert([2])
    .done()
  t.compare(d.toJSON(), [{ insert: 'helloworld' }, { insert: ' ', attributes: { italic: true } }, { insert: {} }, { insert: [1, 2] }])
}

/**
 * @param {t.TestCase} _tc
 */
export const testUseAttributes = _tc => {
  const d = delta.createTextDelta()
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
  const d2 = delta.createTextDelta()
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
  const d = delta.createTextDelta()
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
  const d2 = delta.createTextDelta()
    .insert('a')
    .insert('b', null, { insert: ['me'] })
    .insert('c', null, { insert: ['you'] })
    .insert('d')
    .insert('e', null, { insert: ['me'] })
    .insert('f')
    .done()
  t.compare(d, d2)
}


/**
 * @param {t.TestCase} _tc
 */
export const testXmlDelta = _tc => {
  const d = /** @type {delta.XmlDelta<string, string, { a: 1 }>} */ (delta.createXmlDelta())
  d.children.insert(['hi'])
  d.attributes.set('a', 1)
  d.attributes.delete('a', 1)
  /**
   * @type {Array<Array<string>| number>}
   */
  const arr = []
  d.children.forEach(
    (op, index) => {
      if (op instanceof delta.InsertArrayOp) {
        arr.push(op.insert, index)
      }
    },
    (op, index) => {
      arr.push(op.insert, index)
    },
    (op, _index) => {
      arr.push(op.retain)
    },
    (op, _index) => {
      arr.push(op.delete)
    }
  )
  t.compare(arr, [['hi'], 0, ['hi'], 0])
  const x = d.done()
  console.log(x)
}

const textDeltaSchema = s.object({
  ops: s.array(
    s.any
  )
})

/**
 * @param {t.TestCase} _tc
 */
export const testTextModifyingDelta = _tc => {
  const d = /** @type {delta.TextDelta<Y.Map<any>|Y.Array<any>,undefined>} */ (delta.createTextDelta().insert('hi').insert(new Y.Map()).done())
  s.assert(d, textDeltaSchema)
  console.log(d)
}

/**
 * @param {t.TestCase} _tc
 */
export const testYtypeDeltaTypings = _tc => {
  const ydoc = new Y.Doc({ gc: false })
  {
    const yarray = /** @type {Y.Array<Y.Text|number>} */ (ydoc.getArray('numbers'))
    const content = yarray.getContent()
    content.forEach(
      op => {
        s.union(
          s.constructedBy(delta.InsertArrayOp),
          s.constructedBy(delta.RetainOp),
          s.constructedBy(delta.DeleteOp)
        ).ensure(op)
      },
      op => {
        s.constructedBy(delta.InsertArrayOp).ensure(op)
      },
      op => {
        s.constructedBy(delta.RetainOp).ensure(op)
      },
      op => {
        s.constructedBy(delta.DeleteOp).ensure(op)
      }
    )
    const cdeep = yarray.getContentDeep()
    cdeep.forEach(
      op => {
        s.union(
          s.constructedBy(delta.InsertArrayOp),
          s.constructedBy(delta.RetainOp),
          s.constructedBy(delta.DeleteOp),
          s.constructedBy(delta.ModifyOp)
        ).ensure(op)
      },
      op => {
        s.constructedBy(delta.InsertArrayOp).ensure(op)
      },
      op => {
        s.constructedBy(delta.RetainOp).ensure(op)
      },
      op => {
        s.constructedBy(delta.DeleteOp).ensure(op)
      },
      op => {
        s.constructedBy(delta.ModifyOp).ensure(op)
      }
    )
  }
}
