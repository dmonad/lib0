
# Lib0
> Monorepo of isomorphic utility functions

This library is meant to replace all global JavaScript functions with isomorphic module imports. Additionally, it implements several performance-oriented utility modules. Most noteworthy are the binary encoding/decoding modules **[lib0/encoding]** / **[lib0/decoding]**, the randomized testing framework **[lib0/testing]**, the fast Pseudo Random Number Generator **[lib0/PRNG]**, the small socket.io alternative **[lib0/websocket]**, and the logging module **[lib0/logging]** that allows colorized logging in all environments. Lib0 has only one dependency, which is also from the author of lib0. If lib0 is transpiled with rollup or webpack, very little code is produced because of the way that it is written. All exports are pure and are removed by transpilers that support dead code elimination. Here is an example of how dead code elemination and mangling optimizes code from lib0:

```js
// How the code is optimized by transpilers:

// lib0/json.js
export const stringify = JSON.stringify
export const parse = JSON.parse

// index.js
import * as json from 'lib0/json'
export const f = (arg1, arg2) => json.stringify(arg1) + json.stringify(arg2)

// compiled with rollup and uglifyjs:
const s=JSON.stringify,f=(a,b)=>s(a)+s(b)
export {f}
```

## Performance resources

Each function in this library is tested thoroughly and is not deoptimized by v8 (except some logging and comparison functions that can't be implemented without deoptimizations). This library implements its own test suite that is designed for randomized testing and inspecting performance issues.

* `node --trace-deopt` and `node --trace-opt`
* https://youtu.be/IFWulQnM5E0 Good intro video
* https://github.com/thlorenz/v8-perf
* https://github.com/thlorenz/deoptigate - A great tool for investigating deoptimizations
* https://github.com/vhf/v8-bailout-reasons - Description of some deopt messages

## Code style

The code style might be a bit different from what you are used to. Stay open. Most of the design choices have been thought through. The purpose of this code style is to create code that is optimized by the compiler and that results in small code bundles when used with common module bundlers. Keep that in mind when reading the library.

* No polymorphism!
* Modules should only export pure functions and constants. This way the module bundler can eliminate dead code. The statement `const x = someCondition ? A : B` cannot be eleminated, because it is tied to a condition.
* Use Classes for structuring data. Classes are well supported by jsdoc and are immediately optimized by the compiler. I.e. prefer `class Coord { constructor (x, y) {  this.x = x; this.y = y} }` instead of `{ x: x, y: y }`, because the compiler needs to be assured that the order of properties does not change. `{ y: y, x: x }` has a different hidden class than `{ x: x, y: y }`, which will lead to code deoptimizations if their use is alternated.
* The user of your module should never create data objects with the `new` keyword. Prefer exporting factory functions like `const createCoordinate = (x, y) => new Coord(x, y)`.
* The use of class methods is discouraged, because method names can't be mangled or removed by dead code elimination.
* The only acceptable use of methods is when two objects implement functionality differently.
  E.g. `class Duck { eat () { swallow() } }` and `class Cow { eat () { chew() } }` have the
  same signature, but implement it differently.
* Prefer `const` variable declarations. Use `let` only in loops. `const` always leads to easier code.
* Keep the potential execution stack small and compartmentalized. Nobody wants to debug spaghetti code.
* Give proper names to your functions and ask yourself if you would know what the function does if you saw it in the execution stack.
* Avoid recursion. There is a stack limit in most browsers and not every recursive function is optimized by the compiler.
* Semicolons are superfluous. Lint with https://standardjs.com/

## Using lib0

`lib0` contains isomorphic modules that work in nodejs, the browser, and other environments. It exports modules as the `commonjs` and the new `esm module` format.

If possible,

**ESM module**
```js
import module from 'lib0/[module]' // automatically resolves to lib0/[module].js
```

**CommonJS**
```js
require('lib0/[module]') // automatically resolves to lib0/dist/[module].cjs
```

**Manual**

Automatically resolving to `commonjs` and `esm modules` is implemented using *conditional exports* which is available in `node>=v12`. If support for older versions is required, then it is recommended to define the location of the module manually:

```js
import module from 'lib0/[module].js'
// require('lib0/dist/[module].cjs')
```

### React-Native support

React-native apps should be able to use lib0. You need to install a polyfill for
webcrypto and enable package-exports support in react-native:

```sh
# install polyfill
npm i isomorphic-webcrypto@^2.3.8 # last known working version was 2.3.8
```

Add this to `metro.config.js` [(see docs)](https://reactnative.dev/blog/2023/06/21/package-exports-support):

```js
const config = {
  // ...
  resolver: {
    unstable_enablePackageExports: true
  }
}
```

### License

[The MIT License](./LICENSE) © Kevin Jahns
