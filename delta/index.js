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
  DeltaArray as Array
} from './array.js'

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
  DeltaMap as Map
} from './map.js'

export {
  text,
  $text,
  $textAny,
  DeltaTextBuilder as TextBuilder
} from './text.js'

/**
 * @typedef {import('./text.js').DeltaText<any>} Text
 */

/**
 * @typedef {Array<any> | import('./node.js').DeltaNode<string,any,any,any> } Delta
 */

/**
 * @template {string} NodeName
 * @template {{ [key:string]: any }} Attributes
 * @template Children
 * @template {boolean} WithText
 * @typedef {import('./node.js').RecursiveDeltaNode<NodeName, Attributes, Children, WithText>} RecursiveNode
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
