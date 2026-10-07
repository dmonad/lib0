import * as t from './testing.js'
import * as env from './environment.js'

/**
 * Use a fresh process so browser globals are in place before environment/storage are imported,
 * without changing the test runner's globals or reusing its already evaluated modules.
 *
 * @param {string} script
 */
const runInBrowserEnvironment = script => {
  const { execFileSync } = process.getBuiltinModule('child_process')
  execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict'
    globalThis.window = {}
    globalThis.document = {}
    globalThis.process = undefined
    const environmentURL = ${JSON.stringify(new URL('./environment.js', import.meta.url).href)}
    ${script}
  `], { encoding: 'utf8' })
}

/**
 * @param {t.TestCase} _tc
 */
export const testBrowserStorageReadFailureDuringImport = _tc => {
  t.skip(!env.isNode || env.isDeno)
  for (const name of ['NS_ERROR_FAILURE', 'SecurityError']) {
    runInBrowserEnvironment(`
      globalThis.localStorage = {
        getItem () { throw new DOMException('Failure', ${JSON.stringify(name)}) }
      }
      const environment = await import(environmentURL)
      assert.equal(environment.production, false)
      assert.equal(environment.getVariable('missing'), null)
      assert.equal(environment.hasConf('missing'), false)
    `)
  }
}

/**
 * @param {t.TestCase} _tc
 */
export const testBrowserStorageReadRecovery = _tc => {
  t.skip(!env.isNode || env.isDeno)
  runInBrowserEnvironment(`
    const values = new Map([['production', ''], ['custom', 'configured']])
    let unavailable = false
    globalThis.localStorage = {
      getItem (name) {
        if (unavailable) throw new DOMException('Failure', 'NS_ERROR_FAILURE')
        return values.get(name)
      }
    }
    const environment = await import(environmentURL)
    assert.equal(environment.production, true)
    assert.equal(environment.getVariable('production'), '')
    assert.equal(environment.getVariable('custom'), 'configured')
    assert.equal(environment.getVariable('missing'), null)
    unavailable = true
    assert.equal(environment.getVariable('custom'), null)
    unavailable = false
    assert.equal(environment.getVariable('custom'), 'configured')
  `)
}

/**
 * @param {t.TestCase} _tc
 */
export const testNodeEnvironmentVariable = _tc => {
  t.skip(!env.isNode || env.isDeno)
  const name = 'LIB0_ENVIRONMENT_TEST'
  const previous = process.env[name]
  try {
    process.env[name] = 'configured'
    t.compare(env.getVariable('lib0-environment-test'), 'configured')
    process.env[name] = ''
    t.compare(env.getVariable('lib0-environment-test'), '')
    delete process.env[name]
    t.compare(env.getVariable('lib0-environment-test'), null)
  } finally {
    if (previous === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = previous
    }
  }
}
