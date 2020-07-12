
export class QueueNode {
  constructor () {
    /**
     * @type {QueueNode|null}
     */
    this.next = null
  }
}

/**
 * @template T
 */
export class Queue {
  constructor () {
    /**
     * @type {(T & QueueNode) | null}
     */
    this.start = null
    /**
     * @type {(T & QueueNode) | null}
     */
    this.end = null
  }
}

/**
 * @template T
 * @return {Queue<T & QueueNode>}
 */
export const create = () => new Queue()

/**
 * @template T
 * @param {Queue<T & QueueNode>} queue
 */
export const isEmpty = queue => queue.start === null

/**
 * @template T
 * @param {Queue<T & QueueNode>} queue
 * @param {T & QueueNode} n
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
 * @template T
 * @param {Queue<T & QueueNode>} queue
 * @return {T & QueueNode | null}
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
