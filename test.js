import { runTests } from './testing'
import * as array from './array.test'
import * as logging from './logging.test'
import * as string from './string.test'
import * as encoding from './encoding.test'
import * as diff from './diff.test'
import * as testing from './testing.test'
import * as indexeddb from './indexeddb.test'
import * as prng from './prng.test'
import * as log from './logging'
import * as statistics from './statistics.test'
import * as binary from './binary.test'
import * as random from './random.test'
import * as promise from './promise.test'
import * as queue from './queue.test'
import * as map from './map.test'
import * as eventloop from './eventloop.test'
import * as time from './time.test'
import * as pair from './pair.test'
import * as object from './object.test'
import * as math from './math.test'
import * as number from './number.test'
import * as buffer from './buffer.test'
import * as sort from './sort.test'
import * as url from './url.test'
import * as metric from './metric.test'
import * as func from './function.test'
import * as storage from './storage.test'

import { isBrowser, isNode } from './environment'

/* istanbul ignore if */
if (isBrowser) {
  log.createVConsole(document.body)
}

runTests({
  array,
  logging,
  string,
  encoding,
  diff,
  testing,
  indexeddb,
  prng,
  statistics,
  binary,
  random,
  promise,
  queue,
  map,
  eventloop,
  time,
  pair,
  object,
  math,
  number,
  buffer,
  sort,
  url,
  metric,
  func,
  storage
}).then(success => {
  /* istanbul ignore next */
  if (isNode) {
    process.exit(success ? 0 : 1)
  }
})
