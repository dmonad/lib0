import * as t from './testing.js'
import * as queue from './queue.js'

class QueueItem extends queue.QueueNode {
  /**
   * @param {number} v
   */
  constructor (v) {
    super()
    this.v = v
  }
}

/**
 * @param {t.TestCase} tc
 */
export const testEnqueueDequeue = tc => {
  const N = 30
  /**
   * @type {queue.Queue}
   */
  const q = queue.create()
  t.assert(queue.isEmpty(q))
  t.assert(queue.dequeue(q) === null)
  for (let i = 0; i < N; i++) {
    queue.enqueue(q, new QueueItem(i))
    t.assert(!queue.isEmpty(q))
  }
  for (let i = 0; i < N; i++) {
    const item = /** @type {QueueItem} */ (queue.dequeue(q))
    t.assert(item !== null && item.v === i)
  }
  t.assert(queue.isEmpty(q))
  t.assert(queue.dequeue(q) === null)
  for (let i = 0; i < N; i++) {
    queue.enqueue(q, new QueueItem(i))
    t.assert(!queue.isEmpty(q))
  }
  for (let i = 0; i < N; i++) {
    const item = /** @type {QueueItem} */ (queue.dequeue(q))
    t.assert(item !== null && item.v === i)
  }
  t.assert(queue.isEmpty(q))
  t.assert(queue.dequeue(q) === null)
}
