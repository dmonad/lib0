import * as t from 'lib0/testing'
import * as position from './position.js'

export const testPositionConstructors = () => {
  // `pos(...)` is right gravity; `createPos` takes an explicit assoc
  t.compare(position.pos('a', 1), { path: ['a', 1], assoc: 1 })
  t.compare(position.pos(), { path: [], assoc: 1 })
  t.compare(position.createPos([2, 3], -1), { path: [2, 3], assoc: -1 })
  t.compare(position.createPos([2, 3]), { path: [2, 3], assoc: 1 })
}

export const testPositionEquals = () => {
  t.assert(position.equals(position.pos('a', 1), position.createPos(['a', 1], 1)))
  t.assert(position.equals(position.pos(), position.pos()))
  // differs by assoc / length / a step
  t.assert(!position.equals(position.pos('a', 1), position.createPos(['a', 1], -1)))
  t.assert(!position.equals(position.pos(1), position.pos(1, 2)))
  t.assert(!position.equals(position.pos('a', 1), position.pos('a', 2)))
  t.assert(!position.equals(position.pos('a'), position.pos('b')))
}

export const testPositionSchema = () => {
  t.assert(position.$pos.check(position.pos('a', 1)))
  t.assert(position.$pos.check(position.createPos([], -1)))
  t.assert(!position.$pos.check({ path: ['a', 1] })) // missing assoc
  t.assert(!position.$pos.check({ path: [{ child: 1 }], assoc: 1 })) // step must be string|number
  t.assert(!position.$pos.check({ path: [], assoc: 0 })) // assoc must be -1|1
}
