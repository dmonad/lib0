
export class QueueNode {
  constructor () {
    /**
     * @type {QueueNode|null}
     */
    this.next = null
  }
}

export class Queue {
  constructor () {
    /**
     * @type {QueueNode | null}
     */
    this.start = null
    /**
     * @type {QueueNode | null}
     */
    this.end = null
  }
}

/**
 * @note The queue implementation is experimental and unfinished.
 * Don't use this in production yet.
 *
 * @return {Queue}
 */
export const create = () => new Queue()

/**
 * @param {Queue} queue
 */
export const isEmpty = queue => queue.start === null

/**
 * @param {Queue} queue
 * @param {QueueNode} n
 */
export const enqueue = (queue, n) => {
  if (queue.end !== null) {
    queue.end.next = n
    queue.end = n
  } else {
    queue.end = n
    queue.start = n
  }
}

/**
 * @param {Queue} queue
 * @return {QueueNode | null}
 */
export const dequeue = queue => {
  const n = queue.start
  if (n !== null) {
    // @ts-ignore
    queue.start = n.next
    return n
  }
  return null
}
