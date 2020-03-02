import * as t from './testing.js'
import * as metric from './metric.js'

/**
 * @param {t.TestCase} tc
 */
export const testMetricPrefix = tc => {
  t.compare(metric.prefix(0), { n: 0, prefix: '' })
  t.compare(metric.prefix(1, -1), { n: 1, prefix: 'm' })
  t.compare(metric.prefix(1.5), { n: 1.5, prefix: '' })
  t.compare(metric.prefix(100.5), { n: 100.5, prefix: '' })
  t.compare(metric.prefix(1000.5), { n: 1.0005, prefix: 'k' })
  t.compare(metric.prefix(0.3), { n: 300, prefix: 'm' })
  t.compare(metric.prefix(0.001), { n: 1, prefix: 'm' })
  // up
  t.compare(metric.prefix(10000), { n: 10, prefix: 'k' })
  t.compare(metric.prefix(1e7), { n: 10, prefix: 'M' })
  t.compare(metric.prefix(1e11), { n: 100, prefix: 'G' })
  t.compare(metric.prefix(1e12 + 3), { n: (1e12 + 3) / 1e12, prefix: 'T' })
  t.compare(metric.prefix(1e15), { n: 1, prefix: 'P' })
  t.compare(metric.prefix(1e20), { n: 100, prefix: 'E' })
  t.compare(metric.prefix(1e22), { n: 10, prefix: 'Z' })
  t.compare(metric.prefix(1e24), { n: 1, prefix: 'Y' })
  t.compare(metric.prefix(1e28), { n: 10000, prefix: 'Y' })
  // down
  t.compare(metric.prefix(0.01), { n: 10, prefix: 'm' })
  t.compare(metric.prefix(1e-4), { n: 100, prefix: 'μ' })
  t.compare(metric.prefix(1e-9), { n: 1, prefix: 'n' })
  t.compare(metric.prefix(1e-12), { n: 1, prefix: 'p' })
  t.compare(metric.prefix(1e-14), { n: 10, prefix: 'f' })
  t.compare(metric.prefix(1e-18), { n: 1, prefix: 'a' })
  t.compare(metric.prefix(1e-21), { n: 1, prefix: 'z' })
  t.compare(metric.prefix(1e-22), { n: 100, prefix: 'y' })
  t.compare(metric.prefix(1e-30), { n: 0.000001, prefix: 'y' })
}
