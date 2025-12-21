import * as t from './testing.js'
import { ObservableV2 } from './observable.js'

/**
 * @param {t.TestCase} _tc
 */
export const testTypedObservable = _tc => {
  /**
   * @type {ObservableV2<{ "hey": function(number, string):any, listen: function(string):any }>}
   */
  const o = new ObservableV2()
  let calls = 0
  /**
   * Test "hey"
   */
  /**
   * @param {number} n
   * @param {string} s
   */
  const listener = (n, s) => {
    t.assert(typeof n === 'number')
    t.assert(typeof s === 'string')
    calls++
  }
  o.on('hey', listener)
  o.on('hey', (arg1) => t.assert(typeof arg1 === 'number'))
  // o.emit('hey', ['four']) // should emit type error
  // o.emit('hey', [4]) // should emit type error
  o.emit('hey', [4, 'four'])
  t.assert(calls === 1)
  o.emit('hey', [5, 'five'])
  t.assert(calls === 2)
  o.off('hey', listener)
  o.emit('hey', [6, 'six'])
  t.assert(calls === 2)
  /**
   * Test "listen"
   */
  o.once('listen', n => {
    t.assert(typeof n === 'string')
    calls++
  })
  // o.emit('listen', [4]) // should emit type error
  o.emit('listen', ['four'])
  o.emit('listen', ['five']) // shouldn't trigger
  t.assert(calls === 3)
  o.destroy()
  o.emit('hey', [7, 'seven'])
  t.assert(calls === 3)
}
