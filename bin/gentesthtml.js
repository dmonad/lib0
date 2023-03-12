
import fs from 'fs'
import * as object from '../object.js'

/**
 * @type {Object<string,string>}
 */
const exports = {}

/**
 * @param {any} v
 * @param {string} k
 * @param {string} pkgName
 * @param {string} pathPrefix
 */
const extractModMap = (v, k, pkgName, pathPrefix) => {
  if (k[0] !== '.') return
  if (typeof v === 'object') {
    extractModMap(v.browser || v.module || v.import, k, pkgName, pathPrefix)
  } else if (v && v[0] === '.') {
    exports[pkgName + k.slice(1)] = pathPrefix + v.slice(1)
  }
}
const rootPkgJson = JSON.parse(fs.readFileSync('./package.json'))
/**
 * @param {object} pkgJson
 * @param {string} pathPrefix
 */
const extractPkgJsonInfo = (pkgJson, pathPrefix) => object.forEach(pkgJson.exports, (v, k) => extractModMap(v, k, pkgJson.name, pathPrefix))
extractPkgJsonInfo(rootPkgJson, '.')
object.forEach(rootPkgJson.dependencies, (_v, depName) => {
  const prefix = `./node_modules/${depName}`
  const depPkgJson = JSON.parse(fs.readFileSync(prefix + '/package.json'))
  extractPkgJsonInfo(depPkgJson, prefix)
})

const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Testing lib0</title>
  <script type="importmap">
    {
      "imports": ${JSON.stringify(exports, null, 2)}
    }
  </script>
</head>
<body>
  <script type="module" src="./test.js"></script>
</body>
</html>
`

console.log(testHtml)
