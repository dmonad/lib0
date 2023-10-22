import { ObservableV2 } from './observable.js'
import * as array from './array.js'

class Insert {
  /**
   * @param {string} content
   */
  constructor (content) {
    this.insert = content
  }
}

class Delete {
  /**
   * @param {number} len
   */
  constructor (len) {
    this.delete = len
  }
}

class Retain {
  /**
   * @param {number} retain
   */
  constructor (retain) {
    this.retain = retain
  }
}

export class Delta {
  constructor () {
    /**
     * @type {Array<Insert|Delete|Retain>}
     */
    this.ds = []
  }

  /**
   * @param {Partial<{ insert: function(Insert, number):void, delete: function(Delete, number):void, retain: function(Retain, number):void }>} iterator
   */
  each (iterator) {
    for (let i = 0, currPos = 0; i < this.ds.length; i++) {
      const d = this.ds[i]
      switch (d.constructor) {
        case Insert: {
          iterator.insert?.(/** @type {Insert} */ (d), currPos)
          currPos += /** @type {Insert} */ (d).insert.length
          break
        }
        case Delete: {
          iterator.delete?.(/** @type {Delete} */ (d), currPos)
          break
        }
        case Retain: {
          iterator.retain?.(/** @type {Retain} */ (d), currPos)
          currPos += /** @type {Retain} */ (d).retain
          break
        }
      }
    }
  }
}

export class DeltaConstructor extends Delta {
  /**
   * @param {number} len
   */
  retain (len) {
    this.ds.push(new Retain(len))
    return this
  }

  /**
   * @param {number} len
   */
  delete (len) {
    this.ds.push(new Delete(len))
    return this
  }

  /**
   * @param {string} content
   */
  insert (content) {
    this.ds.push(new Insert(content))
    return this
  }
}

export const delta = () => new DeltaConstructor()

const _maxTextContentSize = 100

/**
 * @extends {ObservableV2<{ delta: function(Delta,Text,any):void }>}
 */
export class Text extends ObservableV2 {
  /**
   * @param {string} content
   */
  constructor (content) {
    super()
    /**
     * @type {Array<string>}
     */
    this.cs = [content]
  }

  get length () {
    return array.fold(this.cs, 0, (len, c) => len + c.length)
  }

  toString () {
    return this.cs.join('')
  }

  /**
   * @param {number} start inclusive start
   * @param {number} end exclusive end
   */
  slice (start = 0, end = this.length) {
    let res = ''
    let len = end - start
    for (let currC = 0; currC < this.cs.length && len > 0; currC++) {
      const c = this.cs[currC]
      start -= c.length
      if (start < 0) {
        const add = len >= -start ? c.slice(start) : c.slice(start, start + len)
        res += add
        len -= add.length
        start = 0
      }
    }
    return res
  }

  /**
   * @param {Delta} delta
   * @param {any} origin
   */
  applyDelta (delta, origin = null) {
    let currC = 0
    let currCI = 0
    const split = () => {
      if (currCI > 0) {
        const c = this.cs[currC]
        this.cs[currC] = c.slice(0, currCI)
        this.cs.splice(currC + 1, 0, c.slice(currCI))
        currC++
        currCI = 0
      }
    }
    delta.each({
      insert: ins => {
        split()
        const left = this.cs[currC - 1]
        const right = this.cs[currC]
        if (left != null && left.length + ins.insert.length < _maxTextContentSize) {
          this.cs[currC - 1] = left + ins.insert
        } else if (right != null && right.length + ins.insert.length < _maxTextContentSize) {
          this.cs[currC] = ins.insert + right
          currCI += ins.insert.length
        } else {
          this.cs.splice(currC++, 0, ins.insert)
        }
      },
      delete: del => {
        split()
        let d = del.delete
        while (d > 0 && currC < this.cs.length) {
          const c = this.cs[currC]
          if (d < c.length) {
            this.cs[currC] = c.slice(d)
            d = 0
          } else {
            d -= this.cs[currC].length
            this.cs.splice(currC, 1)
          }
        }
        if (currC > 0 && currC < this.cs.length) {
          const a = this.cs[currC - 1]
          const b = this.cs[currC]
          if (a.length + b.length < _maxTextContentSize) {
            this.cs[currC - 1] = a + b
            this.cs.splice(currC, 1)
            currC--
            currCI = a.length
          }
        }
      },
      retain: ret => {
        let retain = ret.retain
        while (retain > 0 && currC < this.cs.length) {
          const diff = this.cs[currC].length - currCI
          if (retain < diff) {
            currCI += retain
            retain = 0
          } else {
            retain -= diff
            currCI = 0
            currC++
          }
        }
      }
    })
    this.emit('delta', [delta, this, origin])
  }
}

/**
 * @param {string} content
 */
export const from = content => new Text(content)
