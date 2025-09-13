export {
  TextOp,
  InsertOp,
  DeleteOp,
  ModifyOp,
  RetainOp,
  MapInsertOp,
  MapDeleteOp,
  MapModifyOp,
  $textOp,
  $insertOp,
  $insertOpWith,
  $deleteOp,
  $modifyOp,
  $modifyOpWith,
  $anyOp
} from './ops.js'

export { $delta, $$delta, AbstractDelta, mergeDeltas } from './abstract.js'

// delta array
export {
  array,
  $array,
  $arrayAny,
  DeltaArrayBuilder as ArrayBuilder
} from './array.js'

/**
 * @template Content
 * @typedef {import('./array.js').DeltaArray<Content>} DeltaArray
 */

export {
  node,
  $node,
  $nodeAny,
  DeltaNode as Node
} from './node.js'

// delta map
export {
  map,
  $map,
  $mapAny,
  $mapJson,
  DeltaMapBuilder as MapBuilder,
  DeltaMap as Map
} from './map.js'

export {
  text,
  $text,
  DeltaTextBuilder as TextBuilder
} from './text.js'

/**
 * @typedef {import('./text.js').DeltaText<any>} DeltaText
 */

/**
 * @typedef {DeltaArray<any> | import('./node.js').DeltaNode<string,any,any> } Delta
 */

export {
  value,
  $value,
  $valueAny,
  DeltaValue as Value,
  DeltaValueBuilder as ValueBuilder
} from './value.js'

/**
 * @template V
 * @typedef {V extends import('./value.js').DeltaValue<infer X> ? X : V} ValueUnwrap
 */
