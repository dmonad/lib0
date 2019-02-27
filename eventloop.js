
import * as f from './function.js'

/**
 * @type {Array<function>}
 */
let queue = []

const _runQueue = () => {
  for (let i = 0; i < queue.length; i++) {
    queue[i]()
  }
  queue = []
}

export const enqueue = f => {
  queue.push(f)
  if (queue.length === 1) {
    setTimeout(_runQueue, 0)
  }
}

export const profile = (name, f)  => {
  enqueue(() => {
    console.profile(name)
    f()
    console.profileEnd(name)
  })
}
