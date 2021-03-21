import { runTests } from './testing.js'
import * as array from './array.test.js'
import * as logging from './logging.test.js'
import * as string from './string.test.js'
import * as encoding from './encoding.test.js'
import * as diff from './diff.test.js'
import * as testing from './testing.test.js'
import * as indexeddb from './indexeddb.test.js'
import * as prng from './prng.test.js'
import * as log from './logging.js'
import * as statistics from './statistics.test.js'
import * as binary from './binary.test.js'
import * as random from './random.test.js'
import * as promise from './promise.test.js'
import * as queue from './queue.test.js'
import * as map from './map.test.js'
import * as eventloop from './eventloop.test.js'
import * as time from './time.test.js'
import * as pair from './pair.test.js'
import * as object from './object.test.js'
import * as math from './math.test.js'
import * as number from './number.test.js'
import * as buffer from './buffer.test.js'
import * as sort from './sort.test.js'
import * as url from './url.test.js'
import * as metric from './metric.test.js'
import * as func from './function.test.js'
import * as storage from './storage.test.js'

import { isBrowser, isNode } from './environment.js'

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
