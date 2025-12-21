import * as t from './testing.js'
import * as bc from './broadcastchannel.js'

/**
 * @param {t.TestCase} tc
 */
export const testBroadcastChannel = tc => {
  bc.publish('test', 'test1', tc)
  /**
   * @type {any}
   */
  const messages = []
  const sub = bc.subscribe('test', (data, origin) => {
    messages.push({ data, origin })
  })
  t.compare(messages, [])
  bc.publish('test', 'test2', tc)
  bc.publish('test', 'test3')
  t.compare(messages, [{ data: 'test2', origin: tc }, { data: 'test3', origin: null }])
  bc.unsubscribe('test', sub)
  bc.publish('test', 'test4')
  t.compare(messages, [{ data: 'test2', origin: tc }, { data: 'test3', origin: null }])
}
