
import * as metric from './metric.js'
import * as math from './math.js'

export const getDate = () => new Date()
export const getUnixTime = Date.now

/**
 * @param {number} d duration in milliseconds
 * @return {string} humanized approximation of time
 */
export const humanizeDuration = d => {
  if (d < 60000) {
    const p = metric.prefix(d, -1)
    return math.round(p.n * 100) / 100 + p.prefix + 's'
  }
  d = math.floor(d / 1000)
  const seconds = d % 60
  const minutes = math.floor(d / 60) % 60
  const hours = math.floor(d / 3600) % 24
  const days = math.floor(d / 86400)
  if (days > 0) {
    return days + 'd' + (hours > 0 ? ' ' + (minutes > 30 ? hours + 1 : hours) + 'h' : '')
  }
  if (hours > 0 ) {
    return hours + 'h' + (minutes > 0 ? ' ' + (seconds > 30 ? minutes + 1 : minutes) + 'min' : '')
  }
  return minutes + 'min' + (seconds > 0 ? ' ' + seconds + 's' : '')
}
