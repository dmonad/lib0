import * as t from './testing.js'
import * as list from './list.js'

class QueueItem extends list.ListNode {
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
   * @type {list.List<QueueItem>}
   */
  const q = list.create()
  t.assert(list.isEmpty(q))
  t.assert(list.popFront(q) === null)
  for (let i = 0; i < N; i++) {
    list.pushEnd(q, new QueueItem(i))
    t.assert(!list.isEmpty(q))
  }
  for (let i = 0; i < N; i++) {
    const item = /** @type {QueueItem} */ (list.popFront(q))
    t.assert(item !== null && item.v === i)
  }
  t.assert(list.isEmpty(q))
  t.assert(list.popFront(q) === null)
  for (let i = 0; i < N; i++) {
    list.pushEnd(q, new QueueItem(i))
    t.assert(!list.isEmpty(q))
  }
  for (let i = 0; i < N; i++) {
    const item = /** @type {QueueItem} */ (list.popFront(q))
    t.assert(item !== null && item.v === i)
  }
  t.assert(list.isEmpty(q))
  t.assert(list.popFront(q) === null)
}

/**
 * @param {t.TestCase} tc
 */
export const testSelectivePop = tc => {
  /**
   * @type {list.List<QueueItem>}
   */
  const l = list.create()
  list.pushFront(l, new QueueItem(1))
  list.pushEnd(l, new QueueItem(3))
  const middleNode = new QueueItem(2)
  list.insertBetween(l, l.start, l.end, middleNode)
  t.compare(list.map(l, n => n.v), [1, 2, 3])
  t.assert(list.removeNode(l, middleNode) === middleNode)
  t.compare(/** @type {QueueItem} */ (list.popEnd(l)).v, 3)
  t.compare(/** @type {QueueItem} */ (list.popEnd(l)).v, 1)
  t.compare(list.popEnd(l), null)
  t.assert(l.start === null)
  t.assert(l.end === null)
}
