import * as t from './testing.js'
import * as text from './text.js'
import * as prng from './prng.js'

/**
 * @param {t.TestCase} _tc
 */
export const testText = _tc => {
  const txt = text.from('hello?')
  txt.applyDelta(text.delta().retain(5).delete(1).insert(' ').insert('world!'), null)
  t.assert(txt.toString() === 'hello world!')
  t.assert(txt.slice() === txt.toString())
  t.assert(txt.cs.length === 1)
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandom = tc => {
  const gen = prng.create(42) // tc.prng // prng.create(42)
  let testString = prng.word(gen, 0, 10)
  const txt = text.from(testString)
  const numOfChanges = 30
  for (let i = 0; i < numOfChanges; i++) {
    prng.oneOf(gen, [
      // insert
      () => {
        const start = prng.uint32(gen, 0, txt.length)
        const ins = prng.word(gen, 0, 4)
        const ops = text.delta().retain(start).insert(ins)
        const removeOne = prng.bool(gen) && start !== txt.length
        if (removeOne) {
          ops.delete(1)
        }
        txt.applyDelta(ops)
        testString = testString.slice(0, start) + ins + testString.slice(start + (removeOne ? 1 : 0))
      },
      // delete
      () => {
        const start = prng.uint32(gen, 0, txt.length - 1)
        const len = prng.uint32(gen, 0, txt.length - start)
        const ops = text.delta().retain(start).delete(len)
        let middle = ''
        if (prng.bool(gen)) {
          middle = 'X'
          ops.insert(middle)
        }
        txt.applyDelta(ops)
        testString = testString.slice(0, start) + middle + testString.slice(start + len)
      }
    ])()
    t.assert(testString === txt.toString())
    t.assert(testString.length === txt.length)
    // slice test
    const start = prng.uint32(gen, 0, testString.length)
    const end = prng.uint32(gen, 0, testString.length - start)
    t.assert(txt.slice(start, end) === testString.slice(start, end))
  }
}
