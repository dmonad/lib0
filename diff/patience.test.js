import * as prng from '../prng.js'
import * as t from '../testing.js'
import * as patience from './patience.js'

/**
 * @param {string} a
 * @param {string} b
 * @param {Array<{ insert: string, remove: string, index: number }>} expect
 */
const testDiffAuto = (a, b, expect) => {
  const res = patience.diffAuto(a, b)
  t.info(`Diffing "${a}" with "${b}"`)
  console.log(res)
  t.compare(res, expect)
}

/**
 * @param {t.TestCase} _tc
 */
export const testDiffing = _tc => {
  testDiffAuto(
    'z d a b c',
    'y d b a c',
    [{
      insert: 'y',
      remove: 'z',
      index: 0
    }, {
      insert: 'b ',
      remove: '',
      index: 4
    }, {
      insert: '',
      remove: ' b',
      index: 5
    }]
  )
  testDiffAuto(
    'a b c',
    'b a c',
    [{
      insert: 'b ',
      remove: '',
      index: 0
    }, {
      insert: '',
      remove: ' b',
      index: 1
    }]
  )
  testDiffAuto(
    'x  ',
    ' ',
    [{
      insert: '',
      remove: 'x ',
      index: 0
    }]
  )
  // no change
  testDiffAuto(
    'testa',
    'testa',
    []
  )
  // single char change
  testDiffAuto(
    'testa',
    'testb',
    [{
      insert: 'testb',
      remove: 'testa',
      index: 0
    }]
  )
  // single word change
  testDiffAuto(
    'The rabbit jumped over the fence.\n',
    'The dog jumped over the fence.\n',
    [{
      insert: 'dog',
      remove: 'rabbit',
      index: 4
    }]
  )
  // similar sentences.
  testDiffAuto(
    'the dog. the cat.',
    'the cat. the rabbit.',
    [{
      insert: 'cat',
      remove: 'dog',
      index: 4
    }, {
      insert: 'rabbit',
      remove: 'cat',
      index: 13
    }]
  )
  testDiffAuto(
    'cat food',
    'my cat food',
    [{
      insert: 'my ',
      remove: '',
      index: 0
    }]
  )
  testDiffAuto(
    'the cat stuff',
    'my cat food',
    [{
      insert: 'my',
      remove: 'the',
      index: 0
    }, {
      insert: 'food',
      remove: 'stuff',
      index: 8
    }]
  )
}

/**
 * @param {t.TestCase} tc
 */
export const testRepeatRandomWordReplace = tc => {
  const NWords = 600
  const NReplacements = Math.floor(NWords / 20)
  const NInserts = Math.floor(NWords / 20) + 1
  const NDeletes = Math.floor(NWords / 20) + 1
  const MaxWordLen = 6

  t.group(`Diff on changed list of words (#words=${NWords},#replacements=${NReplacements},#inserts=${NInserts},#deletes=${NDeletes}})`, () => {
    const words = []
    for (let i = 0; i < NWords; i++) {
      words.push(prng.word(tc.prng, 0, MaxWordLen))
    }
    const newWords = words.slice()
    for (let i = 0; i < NReplacements; i++) {
      const pos = prng.int32(tc.prng, 0, words.length - 1)
      newWords[pos] = prng.word(tc.prng, 0, MaxWordLen)
    }
    for (let i = 0; i < NInserts; i++) {
      const pos = prng.int32(tc.prng, 0, words.length - 1)
      newWords.splice(pos, 0, prng.word(tc.prng, 0, MaxWordLen))
    }
    for (let i = 0; i < NDeletes; i++) {
      const pos = prng.int32(tc.prng, 0, words.length - 1)
      newWords.splice(pos, 1)
    }
    const before = words.join(' ')
    const after = newWords.join(' ')
    /**
     * @type {Array<{ insert: string, remove: string, index: number }>}
     */
    let d = []
    t.measureTime(`time to calculate diff (a.length=${before.length},b.length=${after.length})`, () => {
      d = patience.diffAuto(before, after)
    })
    let updating = before
    console.log({ words, newWords, diff: d })
    // verify by applying
    for (let i = d.length - 1; i >= 0; i--) {
      const change = d[i]
      const spliced = updating.split('')
      spliced.splice(change.index, change.remove.length, change.insert)
      updating = spliced.join('')
    }
    t.compare(updating, after)
    t.assert(d.length <= NReplacements + 1 + NInserts + NDeletes) // Sanity check: A maximum of one fault
  })
}
