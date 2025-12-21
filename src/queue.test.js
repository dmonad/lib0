import * as t from './testing.js'
import * as queue from './queue.js'

/**
 * @param {t.TestCase} _tc
 */
export const testEnqueueDequeue = _tc => {
  const N = 30
  /**
   * @type {queue.Queue<queue.QueueValue<number>>}
   */
  const q = queue.create()
  t.assert(queue.isEmpty(q))
  t.assert(queue.dequeue(q) === null)
  for (let i = 0; i < N; i++) {
    queue.enqueue(q, new queue.QueueValue(i))
    t.assert(!queue.isEmpty(q))
  }
  for (let i = 0; i < N; i++) {
    const item = queue.dequeue(q)
    t.assert(item !== null && item.v === i)
  }
  t.assert(queue.isEmpty(q))
  t.assert(queue.dequeue(q) === null)
  for (let i = 0; i < N; i++) {
    queue.enqueue(q, new queue.QueueValue(i))
    t.assert(!queue.isEmpty(q))
  }
  for (let i = 0; i < N; i++) {
    const item = queue.dequeue(q)
    t.assert(item !== null && item.v === i)
  }
  t.assert(queue.isEmpty(q))
  t.assert(queue.dequeue(q) === null)
}
