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
  DeltaArrayBuilder
} from './array.js'

/**
 * @template Content
 * @typedef {import('./array.js').DeltaArray<Content>} DeltaArray
 */

export {
  xml,
  $xml,
  $xmlAny,
  DeltaXml
} from './xml.js'

// delta map
export {
  map,
  $map,
  $mapAny,
  $mapJson,
  DeltaMapBuilder,
  DeltaMap
} from './map.js'

export {
  text,
  DeltaTextBuilder,
  $text
} from './text.js'

/**
 * @typedef {import('./text.js').DeltaText<any>} DeltaText
 */

/**
 * @typedef {DeltaArray<any> | import('./xml.js').DeltaXml<string,any,any> } Delta
 */

export {
  value,
  $value,
  $valueAny,
  DeltaValue,
  DeltaValueBuilder
} from './value.js'
