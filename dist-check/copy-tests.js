/**
 * Copies the test files from `src/` next to the generated declaration files in `dist/` (run by
 * `npm run check-dist-types`). There, the relative imports of a test (`./delta.js`) resolve to the
 * declaration files (`./delta.d.ts`) instead of the JS+JSDoc source, so the whole test suite is
 * type-checked the way a consumer of lib0 is. Declaration emit doesn't always preserve the meaning
 * of the JSDoc source; `npm run lint` can't catch that.
 *
 * The copies are not published (`files` in package.json only includes `dist/**\/*.d.ts`).
 */
import * as fs from 'node:fs'

fs.cpSync('src', 'dist', {
  recursive: true,
  filter: src => fs.statSync(src).isDirectory() || /(\.test|[\\/]test|[\\/]test-setup)\.js$/.test(src)
})
