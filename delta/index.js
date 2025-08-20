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
  createDeltaArray,
  $deltaArray,
  $deltaArrayAny,
  DeltaArrayBuilder
} from './array.js'

/**
 * @template Content
 * @typedef {import('./array.js').DeltaArray<Content>} DeltaArray
 */

export {
  createDeltaXml,
  $deltaXml,
  $deltaXmlAny,
  DeltaXml
} from './xml.js'

// delta map
export {
  createDeltaMap,
  $deltaMap,
  $deltaMapAny,
  $deltaMapJson,
  DeltaMapBuilder,
  DeltaMap
} from './map.js'

export {
  createDeltaText,
  DeltaTextBuilder,
  $deltaText
} from './text.js'

/**
 * @typedef {import('./text.js').DeltaText<any>} DeltaText
 */

/**
 * @typedef {DeltaArray<any> | import('./xml.js').DeltaXml<string,any,any> } Delta
 */

export {
  createDeltaValue,
  $deltaValueAny,
  $deltaValue,
  DeltaValue,
  DeltaValueBuilder
} from './value.js'
