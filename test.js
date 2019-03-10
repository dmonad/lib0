
import { runTests } from './testing.js'
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
import * as map from './map.test.js'
import * as eventloop from './eventloop.test.js'

import { isBrowser, isNode } from './environment.js'

/* istanbul ignore if */
if (isBrowser) {
  log.createVConsole(document.body)
}

runTests({
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
  map,
  eventloop
}).then(success => {
  if (isNode) {
    process.exit(success ? 0 : 1)
  }
})
