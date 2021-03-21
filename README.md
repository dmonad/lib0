
# Lib0 [![Build Status](https://travis-ci.com/dmonad/lib0.svg?branch=main)](https://travis-ci.com/dmonad/lib0)
> Monorepo of isomorphic utility functions

This library is meant to replace all global JavaScript functions with isomorphic module imports. Additionally, it implements several performance-oriented utility modules. Most noteworthy are the binary encoding/decoding modules **[lib0/encoding]** / **[lib0/decoding]**, the randomized testing framework **[lib0/testing]**, the fast Pseudo Random Number Generator **[lib0/PRNG]**, the small socket.io alternative **[lib0/websocket]**, and the logging module **[lib0/logging]** that allows colorized logging in all environments. Lib0 has only one dependency, which is also from the author of lib0. If lib0 is transpiled with rollup or webpack, very little code is produced because of the way that it is written. All exports are pure and are removed by transpilers that support dead code elimination. Here is an example of how dead code elemination and mangling optimizes code from lib0:

```js
// How the code is optimized by transpilers:

// lib0/json.js
export const stringify = JSON.stringify
export const parse = JSON.parse

// index.js
import * as json from 'lib0/json.js'
export const f = (arg1, arg2) => json.stringify(arg1) + json.stringify(arg2)

// compiled with rollup and uglifyjs:
const s=JSON.stringify,f=(a,b)=>s(a)+s(b)
export {f}
```

## Performance resources

Each function in this library is tested thoroughly and is not deoptimized by v8 (except some logging and comparison functions that can't be implemented without deoptimizations). This library implements its own test suite that is designed for randomized testing and inspecting performance issues.

* `node --trace-deop` and `node --trace-opt`
* https://youtu.be/IFWulQnM5E0 Good intro video
* https://github.com/thlorenz/v8-perf
* https://github.com/thlorenz/deoptigate - A great tool for investigating deoptimizations
* https://github.com/vhf/v8-bailout-reasons - Description of some deopt messages

## Code style

The code style might be a bit different from what you are used to. Stay open. Most of the design choices have been thought through. The purpose of this code style is to create code that is optimized by the compiler and that results in small code bundles when used with common module bundlers. Keep that in mind when reading the library.

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

## Modules

<details><summary><b>[lib0/array]</b> Utility module to work with Arrays.</summary>
<pre>import * as array from 'lib0/array.js'</pre>
<dl>
<b><code>array.last(arr: Array&lt;L&gt;): L</code></b><br>
<dd><p>Return the last element of an array. The element must exist</p></dd>
<b><code>array.create(): Array&lt;C&gt;</code></b><br>
<b><code>array.copy(a: Array&lt;D&gt;): Array&lt;D&gt;</code></b><br>
<b><code>array.appendTo(dest: Array&lt;M&gt;, src: Array&lt;M&gt;)</code></b><br>
<dd><p>Append elements from src to dest</p></dd>
<b><code>array.from(arraylike: ArrayLike&lt;T&gt;|Iterable&lt;T&gt;): T</code></b><br>
<dd><p>Transforms something array-like to an actual Array.</p></dd>
<b><code>array.every(arr: Array&lt;ITEM&gt;, f: function(ITEM, number, Array&lt;ITEM&gt;):boolean): boolean</code></b><br>
<dd><p>True iff condition holds on every element in the Array.</p></dd>
<b><code>array.some(arr: Array&lt;S&gt;, f: function(S, number, Array&lt;S&gt;):boolean): boolean</code></b><br>
<dd><p>True iff condition holds on some element in the Array.</p></dd>
<b><code>array.equalFlat(a: Array&lt;ELEM&gt;, b: Array&lt;ELEM&gt;): boolean</code></b><br>
<b><code>array.flatten(arr: Array&lt;Array&lt;ELEM&gt;&gt;): Array&lt;ELEM&gt;</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/binary]</b> Binary data constants.</summary>
<pre>import * as binary from 'lib0/binary.js'</pre>
<dl>
<b><code>binary.BIT1: number</code></b><br>
<dd><p>n-th bit activated.</p></dd>
<b><code>binary.BIT2</code></b><br>
<b><code>binary.BIT3</code></b><br>
<b><code>binary.BIT4</code></b><br>
<b><code>binary.BIT5</code></b><br>
<b><code>binary.BIT6</code></b><br>
<b><code>binary.BIT7</code></b><br>
<b><code>binary.BIT8</code></b><br>
<b><code>binary.BIT9</code></b><br>
<b><code>binary.BIT10</code></b><br>
<b><code>binary.BIT11</code></b><br>
<b><code>binary.BIT12</code></b><br>
<b><code>binary.BIT13</code></b><br>
<b><code>binary.BIT14</code></b><br>
<b><code>binary.BIT15</code></b><br>
<b><code>binary.BIT16</code></b><br>
<b><code>binary.BIT17</code></b><br>
<b><code>binary.BIT18</code></b><br>
<b><code>binary.BIT19</code></b><br>
<b><code>binary.BIT20</code></b><br>
<b><code>binary.BIT21</code></b><br>
<b><code>binary.BIT22</code></b><br>
<b><code>binary.BIT23</code></b><br>
<b><code>binary.BIT24</code></b><br>
<b><code>binary.BIT25</code></b><br>
<b><code>binary.BIT26</code></b><br>
<b><code>binary.BIT27</code></b><br>
<b><code>binary.BIT28</code></b><br>
<b><code>binary.BIT29</code></b><br>
<b><code>binary.BIT30</code></b><br>
<b><code>binary.BIT31</code></b><br>
<b><code>binary.BIT32</code></b><br>
<b><code>binary.BITS0: number</code></b><br>
<dd><p>First n bits activated.</p></dd>
<b><code>binary.BITS1</code></b><br>
<b><code>binary.BITS2</code></b><br>
<b><code>binary.BITS3</code></b><br>
<b><code>binary.BITS4</code></b><br>
<b><code>binary.BITS5</code></b><br>
<b><code>binary.BITS6</code></b><br>
<b><code>binary.BITS7</code></b><br>
<b><code>binary.BITS8</code></b><br>
<b><code>binary.BITS9</code></b><br>
<b><code>binary.BITS10</code></b><br>
<b><code>binary.BITS11</code></b><br>
<b><code>binary.BITS12</code></b><br>
<b><code>binary.BITS13</code></b><br>
<b><code>binary.BITS14</code></b><br>
<b><code>binary.BITS15</code></b><br>
<b><code>binary.BITS16</code></b><br>
<b><code>binary.BITS17</code></b><br>
<b><code>binary.BITS18</code></b><br>
<b><code>binary.BITS19</code></b><br>
<b><code>binary.BITS20</code></b><br>
<b><code>binary.BITS21</code></b><br>
<b><code>binary.BITS22</code></b><br>
<b><code>binary.BITS23</code></b><br>
<b><code>binary.BITS24</code></b><br>
<b><code>binary.BITS25</code></b><br>
<b><code>binary.BITS26</code></b><br>
<b><code>binary.BITS27</code></b><br>
<b><code>binary.BITS28</code></b><br>
<b><code>binary.BITS29</code></b><br>
<b><code>binary.BITS30</code></b><br>
<b><code>binary.BITS31: number</code></b><br>
<b><code>binary.BITS32: number</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/broadcastchannel]</b> Helpers for cross-tab communication using broadcastchannel with LocalStorage fallback.</summary>
<pre>import * as broadcastchannel from 'lib0/broadcastchannel.js'</pre>

<pre class="prettyprint source lang-js"><code>// In browser window A:
broadcastchannel.subscribe('my events', data => console.log(data))
broadcastchannel.publish('my events', 'Hello world!') // => A: 'Hello world!' fires synchronously in same tab

// In browser window B:
broadcastchannel.publish('my events', 'hello from tab B') // => A: 'hello from tab B'
</code></pre>
<dl>
<b><code>broadcastchannel.subscribe(room: string, f: function(any):any)</code></b><br>
<dd><p>Subscribe to global <code>publish</code> events.</p></dd>
<b><code>broadcastchannel.unsubscribe(room: string, f: function(any):any)</code></b><br>
<dd><p>Unsubscribe from <code>publish</code> global events.</p></dd>
<b><code>broadcastchannel.publish(room: string, data: any)</code></b><br>
<dd><p>Publish data to all subscribers (including subscribers on this tab)</p></dd>
</dl>
</details>
<details><summary><b>[lib0/buffer]</b> Utility functions to work with buffers (Uint8Array).</summary>
<pre>import * as buffer from 'lib0/buffer.js'</pre>
<dl>
<b><code>buffer.createUint8ArrayFromLen(len: number)</code></b><br>
<b><code>buffer.createUint8ArrayViewFromArrayBuffer(buffer: ArrayBuffer, byteOffset: number, length: number)</code></b><br>
<dd><p>Create Uint8Array with initial content from buffer</p></dd>
<b><code>buffer.createUint8ArrayFromArrayBuffer(buffer: ArrayBuffer)</code></b><br>
<dd><p>Create Uint8Array with initial content from buffer</p></dd>
<b><code>buffer.toBase64</code></b><br>
<b><code>buffer.fromBase64</code></b><br>
<b><code>buffer.copyUint8Array(uint8Array: Uint8Array): Uint8Array</code></b><br>
<dd><p>Copy the content of an Uint8Array view to a new ArrayBuffer.</p></dd>
<b><code>buffer.encodeAny(data: any): Uint8Array</code></b><br>
<dd><p>Encode anything as a UInt8Array. It's a pun on typescripts's <code>any</code> type.
See encoding.writeAny for more information.</p></dd>
<b><code>buffer.decodeAny(buf: Uint8Array): any</code></b><br>
<dd><p>Decode an any-encoded value.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/component]</b> Web components.</summary>
<pre>import * as component from 'lib0/component.js'</pre>
<dl>
<b><code>component.registry</code></b><br>
<b><code>component.define(name: string, constr: any, opts: ElementDefinitionOptions)</code></b><br>
<b><code>component.whenDefined(name: string): Promise&lt;void&gt;</code></b><br>
<b><code>new component.Lib0Component(state: S)</code></b><br>
<b><code>component.Lib0Component#state: S|null</code></b><br>
<b><code>component.Lib0Component#setState(state: S, forceStateUpdate: boolean)</code></b><br>
<b><code>component.Lib0Component#updateState(stateUpdate: any)</code></b><br>
<b><code>component.createComponent(name: string, cnf: module:component~CONF&lt;T&gt;): Class&lt;module:component.Lib0Component&gt;</code></b><br>
<b><code>component.createComponentDefiner(definer: function)</code></b><br>
<b><code>component.defineListComponent</code></b><br>
<b><code>component.defineLazyLoadingComponent</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/conditions]</b> Often used conditions.</summary>
<pre>import * as conditions from 'lib0/conditions.js'</pre>
<dl>
<b><code>conditions.undefinedToNull</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/decoding]</b> Efficient schema-less binary decoding with support for variable length encoding.</summary>
<pre>import * as decoding from 'lib0/decoding.js'</pre>

<p>Use [lib0/decoding] with [lib0/encoding]. Every encoding function has a corresponding decoding function.</p>
<p>Encodes numbers in little-endian order (least to most significant byte order)
and is compatible with Golang's binary encoding (https://golang.org/pkg/encoding/binary/)
which is also used in Protocol Buffers.</p>
<pre class="prettyprint source lang-js"><code>// encoding step
const encoder = new encoding.createEncoder()
encoding.writeVarUint(encoder, 256)
encoding.writeVarString(encoder, 'Hello world!')
const buf = encoding.toUint8Array(encoder)
</code></pre>
<pre class="prettyprint source lang-js"><code>// decoding step
const decoder = new decoding.createDecoder(buf)
decoding.readVarUint(decoder) // => 256
decoding.readVarString(decoder) // => 'Hello world!'
decoding.hasContent(decoder) // => false - all data is read
</code></pre>
<dl>
<b><code>new decoding.Decoder(uint8Array: Uint8Array)</code></b><br>
<dd><p>A Decoder handles the decoding of an Uint8Array.</p></dd>
<b><code>decoding.Decoder#arr: Uint8Array</code></b><br>
<dd><p>Decoding target.</p></dd>
<b><code>decoding.Decoder#pos: number</code></b><br>
<dd><p>Current decoding position.</p></dd>
<b><code>decoding.createDecoder(uint8Array: Uint8Array): module:decoding.Decoder</code></b><br>
<b><code>decoding.hasContent(decoder: module:decoding.Decoder): boolean</code></b><br>
<b><code>decoding.clone(decoder: module:decoding.Decoder, newPos: number): module:decoding.Decoder</code></b><br>
<dd><p>Clone a decoder instance.
Optionally set a new position parameter.</p></dd>
<b><code>decoding.readUint8Array(decoder: module:decoding.Decoder, len: number): Uint8Array</code></b><br>
<dd><p>Create an Uint8Array view of the next <code>len</code> bytes and advance the position by <code>len</code>.</p>
<p>Important: The Uint8Array still points to the underlying ArrayBuffer. Make sure to discard the result as soon as possible to prevent any memory leaks.
Use <code>buffer.copyUint8Array</code> to copy the result into a new Uint8Array.</p></dd>
<b><code>decoding.readVarUint8Array(decoder: module:decoding.Decoder): Uint8Array</code></b><br>
<dd><p>Read variable length Uint8Array.</p>
<p>Important: The Uint8Array still points to the underlying ArrayBuffer. Make sure to discard the result as soon as possible to prevent any memory leaks.
Use <code>buffer.copyUint8Array</code> to copy the result into a new Uint8Array.</p></dd>
<b><code>decoding.readTailAsUint8Array(decoder: module:decoding.Decoder): Uint8Array</code></b><br>
<dd><p>Read the rest of the content as an ArrayBuffer</p></dd>
<b><code>decoding.skip8(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Skip one byte, jump to the next position.</p></dd>
<b><code>decoding.readUint8(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Read one byte as unsigned integer.</p></dd>
<b><code>decoding.readUint16(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Read 2 bytes as unsigned integer.</p></dd>
<b><code>decoding.readUint32(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Read 4 bytes as unsigned integer.</p></dd>
<b><code>decoding.readUint32BigEndian(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Read 4 bytes as unsigned integer in big endian order.
(most significant byte first)</p></dd>
<b><code>decoding.peekUint8(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Look ahead without incrementing the position
to the next byte and read it as unsigned integer.</p></dd>
<b><code>decoding.peekUint16(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Look ahead without incrementing the position
to the next byte and read it as unsigned integer.</p></dd>
<b><code>decoding.peekUint32(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Look ahead without incrementing the position
to the next byte and read it as unsigned integer.</p></dd>
<b><code>decoding.readVarUint(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Read unsigned integer (32bit) with variable length.
1/8th of the storage is used as encoding overhead.</p>
<ul>
<li>numbers &lt; 2^7 is stored in one bytlength</li>
<li>numbers &lt; 2^14 is stored in two bylength</li>
</ul></dd>
<b><code>decoding.readVarInt(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Read signed integer (32bit) with variable length.
1/8th of the storage is used as encoding overhead.</p>
<ul>
<li>numbers &lt; 2^7 is stored in one bytlength</li>
<li>numbers &lt; 2^14 is stored in two bylength</li>
</ul></dd>
<b><code>decoding.peekVarUint(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Look ahead and read varUint without incrementing position</p></dd>
<b><code>decoding.peekVarInt(decoder: module:decoding.Decoder): number</code></b><br>
<dd><p>Look ahead and read varUint without incrementing position</p></dd>
<b><code>decoding.readVarString(decoder: module:decoding.Decoder): String</code></b><br>
<dd><p>Read string of variable length</p>
<ul>
<li>varUint is used to store the length of the string</li>
</ul>
<p>Transforming utf8 to a string is pretty expensive. The code performs 10x better
when String.fromCodePoint is fed with all characters as arguments.
But most environments have a maximum number of arguments per functions.
For effiency reasons we apply a maximum of 10000 characters at once.</p></dd>
<b><code>decoding.peekVarString(decoder: module:decoding.Decoder): string</code></b><br>
<dd><p>Look ahead and read varString without incrementing position</p></dd>
<b><code>decoding.readFromDataView(decoder: module:decoding.Decoder, len: number): DataView</code></b><br>
<b><code>decoding.readFloat32(decoder: module:decoding.Decoder)</code></b><br>
<b><code>decoding.readFloat64(decoder: module:decoding.Decoder)</code></b><br>
<b><code>decoding.readBigInt64(decoder: module:decoding.Decoder)</code></b><br>
<b><code>decoding.readBigUint64(decoder: module:decoding.Decoder)</code></b><br>
<b><code>decoding.readAny(decoder: module:decoding.Decoder)</code></b><br>
<b><code>new decoding.RleDecoder(uint8Array: Uint8Array, reader: function(module:decoding.Decoder):T)</code></b><br>
<dd><p>T must not be null.</p></dd>
<b><code>decoding.RleDecoder#s: T|null</code></b><br>
<dd><p>Current state</p></dd>
<b><code>decoding.RleDecoder#read()</code></b><br>
<b><code>decoding.RleDecoder#s: T</code></b><br>
<b><code>new decoding.IntDiffDecoder(uint8Array: Uint8Array, start: number)</code></b><br>
<b><code>decoding.IntDiffDecoder#s: number</code></b><br>
<dd><p>Current state</p></dd>
<b><code>decoding.IntDiffDecoder#read(): number</code></b><br>
<b><code>new decoding.RleIntDiffDecoder(uint8Array: Uint8Array, start: number)</code></b><br>
<b><code>decoding.RleIntDiffDecoder#s: number</code></b><br>
<dd><p>Current state</p></dd>
<b><code>decoding.RleIntDiffDecoder#read(): number</code></b><br>
<b><code>decoding.RleIntDiffDecoder#s: number</code></b><br>
<b><code>new decoding.UintOptRleDecoder(uint8Array: Uint8Array)</code></b><br>
<b><code>decoding.UintOptRleDecoder#s: number</code></b><br>
<b><code>decoding.UintOptRleDecoder#read()</code></b><br>
<b><code>decoding.UintOptRleDecoder#s: number</code></b><br>
<b><code>new decoding.IncUintOptRleDecoder(uint8Array: Uint8Array)</code></b><br>
<b><code>decoding.IncUintOptRleDecoder#s: number</code></b><br>
<b><code>decoding.IncUintOptRleDecoder#read()</code></b><br>
<b><code>new decoding.IntDiffOptRleDecoder(uint8Array: Uint8Array)</code></b><br>
<b><code>decoding.IntDiffOptRleDecoder#s: number</code></b><br>
<b><code>decoding.IntDiffOptRleDecoder#read(): number</code></b><br>
<b><code>new decoding.StringDecoder(uint8Array: Uint8Array)</code></b><br>
<b><code>decoding.StringDecoder#spos: number</code></b><br>
<b><code>decoding.StringDecoder#read(): string</code></b><br>
<b><code>decoding.RleDecoder#arr: Uint8Array</code></b><br>
<dd><p>Decoding target.</p></dd>
<b><code>decoding.RleDecoder#pos: number</code></b><br>
<dd><p>Current decoding position.</p></dd>
<b><code>decoding.IntDiffDecoder#arr: Uint8Array</code></b><br>
<dd><p>Decoding target.</p></dd>
<b><code>decoding.IntDiffDecoder#pos: number</code></b><br>
<dd><p>Current decoding position.</p></dd>
<b><code>decoding.RleIntDiffDecoder#arr: Uint8Array</code></b><br>
<dd><p>Decoding target.</p></dd>
<b><code>decoding.RleIntDiffDecoder#pos: number</code></b><br>
<dd><p>Current decoding position.</p></dd>
<b><code>decoding.UintOptRleDecoder#arr: Uint8Array</code></b><br>
<dd><p>Decoding target.</p></dd>
<b><code>decoding.UintOptRleDecoder#pos: number</code></b><br>
<dd><p>Current decoding position.</p></dd>
<b><code>decoding.IncUintOptRleDecoder#arr: Uint8Array</code></b><br>
<dd><p>Decoding target.</p></dd>
<b><code>decoding.IncUintOptRleDecoder#pos: number</code></b><br>
<dd><p>Current decoding position.</p></dd>
<b><code>decoding.IntDiffOptRleDecoder#arr: Uint8Array</code></b><br>
<dd><p>Decoding target.</p></dd>
<b><code>decoding.IntDiffOptRleDecoder#pos: number</code></b><br>
<dd><p>Current decoding position.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/diff]</b> Efficient diffs.</summary>
<pre>import * as diff from 'lib0/diff.js'</pre>
<dl>
<b><code>diff.simpleDiffString(a: string, b: string): module:diff~SimpleDiff&lt;string&gt;</code></b><br>
<dd><p>Create a diff between two strings. This diff implementation is highly
efficient, but not very sophisticated.</p></dd>
<b><code>diff.simpleDiff</code></b><br>
<b><code>diff.simpleDiffArray(a: Array&lt;T&gt;, b: Array&lt;T&gt;, compare: function(T, T):boolean): module:diff~SimpleDiff&lt;Array&lt;T&gt;&gt;</code></b><br>
<dd><p>Create a diff between two arrays. This diff implementation is highly
efficient, but not very sophisticated.</p>
<p>Note: This is basically the same function as above. Another function was created so that the runtime
can better optimize these function calls.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/dom]</b> Utility module to work with the DOM.</summary>
<pre>import * as dom from 'lib0/dom.js'</pre>
<dl>
<b><code>dom.doc: Document</code></b><br>
<b><code>dom.createElement</code></b><br>
<b><code>dom.createDocumentFragment</code></b><br>
<b><code>dom.createTextNode</code></b><br>
<b><code>dom.domParser</code></b><br>
<b><code>dom.emitCustomEvent</code></b><br>
<b><code>dom.setAttributes</code></b><br>
<b><code>dom.setAttributesMap</code></b><br>
<b><code>dom.fragment</code></b><br>
<b><code>dom.append</code></b><br>
<b><code>dom.remove</code></b><br>
<b><code>dom.addEventListener</code></b><br>
<b><code>dom.removeEventListener</code></b><br>
<b><code>dom.addEventListeners</code></b><br>
<b><code>dom.removeEventListeners</code></b><br>
<b><code>dom.element</code></b><br>
<b><code>dom.canvas</code></b><br>
<b><code>dom.text</code></b><br>
<b><code>dom.pairToStyleString</code></b><br>
<b><code>dom.pairsToStyleString</code></b><br>
<b><code>dom.mapToStyleString</code></b><br>
<b><code>dom.querySelector</code></b><br>
<b><code>dom.querySelectorAll</code></b><br>
<b><code>dom.getElementById</code></b><br>
<b><code>dom.parseFragment</code></b><br>
<b><code>dom.childNodes: any</code></b><br>
<b><code>dom.parseElement</code></b><br>
<b><code>dom.replaceWith</code></b><br>
<b><code>dom.insertBefore</code></b><br>
<b><code>dom.appendChild</code></b><br>
<b><code>dom.ELEMENT_NODE</code></b><br>
<b><code>dom.TEXT_NODE</code></b><br>
<b><code>dom.CDATA_SECTION_NODE</code></b><br>
<b><code>dom.COMMENT_NODE</code></b><br>
<b><code>dom.DOCUMENT_NODE</code></b><br>
<b><code>dom.DOCUMENT_TYPE_NODE</code></b><br>
<b><code>dom.DOCUMENT_FRAGMENT_NODE</code></b><br>
<b><code>dom.checkNodeType(node: any, type: number)</code></b><br>
<b><code>dom.isParentOf(parent: Node, child: HTMLElement)</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/encoding]</b> Efficient schema-less binary encoding with support for variable length encoding.</summary>
<pre>import * as encoding from 'lib0/encoding.js'</pre>

<p>Use [lib0/encoding] with [lib0/decoding]. Every encoding function has a corresponding decoding function.</p>
<p>Encodes numbers in little-endian order (least to most significant byte order)
and is compatible with Golang's binary encoding (https://golang.org/pkg/encoding/binary/)
which is also used in Protocol Buffers.</p>
<pre class="prettyprint source lang-js"><code>// encoding step
const encoder = new encoding.createEncoder()
encoding.writeVarUint(encoder, 256)
encoding.writeVarString(encoder, 'Hello world!')
const buf = encoding.toUint8Array(encoder)
</code></pre>
<pre class="prettyprint source lang-js"><code>// decoding step
const decoder = new decoding.createDecoder(buf)
decoding.readVarUint(decoder) // => 256
decoding.readVarString(decoder) // => 'Hello world!'
decoding.hasContent(decoder) // => false - all data is read
</code></pre>
<dl>
<b><code>new encoding.Encoder()</code></b><br>
<dd><p>A BinaryEncoder handles the encoding to an Uint8Array.</p></dd>
<b><code>encoding.Encoder#bufs: Array&lt;Uint8Array&gt;</code></b><br>
<b><code>encoding.createEncoder(): module:encoding.Encoder</code></b><br>
<b><code>encoding.length(encoder: module:encoding.Encoder): number</code></b><br>
<dd><p>The current length of the encoded data.</p></dd>
<b><code>encoding.toUint8Array(encoder: module:encoding.Encoder): Uint8Array</code></b><br>
<dd><p>Transform to Uint8Array.</p></dd>
<b><code>encoding.write(encoder: module:encoding.Encoder, num: number)</code></b><br>
<dd><p>Write one byte to the encoder.</p></dd>
<b><code>encoding.set(encoder: module:encoding.Encoder, pos: number, num: number)</code></b><br>
<dd><p>Write one byte at a specific position.
Position must already be written (i.e. encoder.length &gt; pos)</p></dd>
<b><code>encoding.writeUint8(encoder: module:encoding.Encoder, num: number)</code></b><br>
<dd><p>Write one byte as an unsigned integer.</p></dd>
<b><code>encoding.setUint8(encoder: module:encoding.Encoder, pos: number, num: number)</code></b><br>
<dd><p>Write one byte as an unsigned Integer at a specific location.</p></dd>
<b><code>encoding.writeUint16(encoder: module:encoding.Encoder, num: number)</code></b><br>
<dd><p>Write two bytes as an unsigned integer.</p></dd>
<b><code>encoding.setUint16(encoder: module:encoding.Encoder, pos: number, num: number)</code></b><br>
<dd><p>Write two bytes as an unsigned integer at a specific location.</p></dd>
<b><code>encoding.writeUint32(encoder: module:encoding.Encoder, num: number)</code></b><br>
<dd><p>Write two bytes as an unsigned integer</p></dd>
<b><code>encoding.writeUint32BigEndian(encoder: module:encoding.Encoder, num: number)</code></b><br>
<dd><p>Write two bytes as an unsigned integer in big endian order.
(most significant byte first)</p></dd>
<b><code>encoding.setUint32(encoder: module:encoding.Encoder, pos: number, num: number)</code></b><br>
<dd><p>Write two bytes as an unsigned integer at a specific location.</p></dd>
<b><code>encoding.writeVarUint(encoder: module:encoding.Encoder, num: number)</code></b><br>
<dd><p>Write a variable length unsigned integer.</p>
<p>Encodes integers in the range from [0, 4294967295] / [0, 0xffffffff]. (max 32 bit unsigned integer)</p></dd>
<b><code>encoding.writeVarInt(encoder: module:encoding.Encoder, num: number)</code></b><br>
<dd><p>Write a variable length integer.</p>
<p>Encodes integers in the range from [-2147483648, -2147483647].</p>
<p>We don't use zig-zag encoding because we want to keep the option open
to use the same function for BigInt and 53bit integers (doubles).</p>
<p>We use the 7th bit instead for signaling that this is a negative number.</p></dd>
<b><code>encoding.writeVarString(encoder: module:encoding.Encoder, str: String)</code></b><br>
<dd><p>Write a variable length string.</p></dd>
<b><code>encoding.writeBinaryEncoder(encoder: module:encoding.Encoder, append: module:encoding.Encoder)</code></b><br>
<dd><p>Write the content of another Encoder.</p></dd>
<b><code>encoding.writeUint8Array(encoder: module:encoding.Encoder, uint8Array: Uint8Array)</code></b><br>
<dd><p>Append fixed-length Uint8Array to the encoder.</p></dd>
<b><code>encoding.writeVarUint8Array(encoder: module:encoding.Encoder, uint8Array: Uint8Array)</code></b><br>
<dd><p>Append an Uint8Array to Encoder.</p></dd>
<b><code>encoding.writeOnDataView(encoder: module:encoding.Encoder, len: number): DataView</code></b><br>
<dd><p>Create an DataView of the next <code>len</code> bytes. Use it to write data after
calling this function.</p>
<pre class="prettyprint source lang-js"><code>// write float32 using DataView
const dv = writeOnDataView(encoder, 4)
dv.setFloat32(0, 1.1)
// read float32 using DataView
const dv = readFromDataView(encoder, 4)
dv.getFloat32(0) // => 1.100000023841858 (leaving it to the reader to find out why this is the correct result)
</code></pre></dd>
<b><code>encoding.writeFloat32(encoder: module:encoding.Encoder, num: number)</code></b><br>
<b><code>encoding.writeFloat64(encoder: module:encoding.Encoder, num: number)</code></b><br>
<b><code>encoding.writeBigInt64(encoder: module:encoding.Encoder, num: bigint)</code></b><br>
<b><code>encoding.writeBigUint64(encoder: module:encoding.Encoder, num: bigint)</code></b><br>
<b><code>encoding.writeAny(encoder: module:encoding.Encoder, data: undefined|null|number|bigint|boolean|string|Object&lt;string,any&gt;|Array&lt;any&gt;|Uint8Array)</code></b><br>
<dd><p>Encode data with efficient binary format.</p>
<p>Differences to JSON:
• Transforms data to a binary format (not to a string)
• Encodes undefined, NaN, and ArrayBuffer (these can't be represented in JSON)
• Numbers are efficiently encoded either as a variable length integer, as a
32 bit float, as a 64 bit float, or as a 64 bit bigint.</p>
<p>Encoding table:</p>
<table>
<thead>
<tr>
<th>Data Type</th>
<th>Prefix</th>
<th>Encoding Method</th>
<th>Comment</th>
</tr>
</thead>
<tbody>
<tr>
<td>undefined</td>
<td>127</td>
<td></td>
<td>Functions, symbol, and everything that cannot be identified is encoded as undefined</td>
</tr>
<tr>
<td>null</td>
<td>126</td>
<td></td>
<td></td>
</tr>
<tr>
<td>integer</td>
<td>125</td>
<td>writeVarInt</td>
<td>Only encodes 32 bit signed integers</td>
</tr>
<tr>
<td>float32</td>
<td>124</td>
<td>writeFloat32</td>
<td></td>
</tr>
<tr>
<td>float64</td>
<td>123</td>
<td>writeFloat64</td>
<td></td>
</tr>
<tr>
<td>bigint</td>
<td>122</td>
<td>writeBigInt64</td>
<td></td>
</tr>
<tr>
<td>boolean (false)</td>
<td>121</td>
<td></td>
<td>True and false are different data types so we save the following byte</td>
</tr>
<tr>
<td>boolean (true)</td>
<td>120</td>
<td></td>
<td>- 0b01111000 so the last bit determines whether true or false</td>
</tr>
<tr>
<td>string</td>
<td>119</td>
<td>writeVarString</td>
<td></td>
</tr>
<tr>
<td>object&lt;string,any&gt;</td>
<td>118</td>
<td>custom</td>
<td>Writes {length} then {length} key-value pairs</td>
</tr>
<tr>
<td>array<any></td>
<td>117</td>
<td>custom</td>
<td>Writes {length} then {length} json values</td>
</tr>
<tr>
<td>Uint8Array</td>
<td>116</td>
<td>writeVarUint8Array</td>
<td>We use Uint8Array for any kind of binary data</td>
</tr>
</tbody>
</table>
<p>Reasons for the decreasing prefix:
We need the first bit for extendability (later we may want to encode the
prefix with writeVarUint). The remaining 7 bits are divided as follows:
[0-30]   the beginning of the data range is used for custom purposes
(defined by the function that uses this library)
[31-127] the end of the data range is used for data encoding by
lib0/encoding.js</p></dd>
<b><code>new encoding.RleEncoder(writer: function(module:encoding.Encoder, T):void)</code></b><br>
<dd><p>Now come a few stateful encoder that have their own classes.</p></dd>
<b><code>encoding.RleEncoder#s: T|null</code></b><br>
<dd><p>Current state</p></dd>
<b><code>encoding.RleEncoder#write(v: T)</code></b><br>
<b><code>new encoding.IntDiffEncoder(start: number)</code></b><br>
<dd><p>Basic diff decoder using variable length encoding.</p>
<p>Encodes the values [3, 1100, 1101, 1050, 0] to [3, 1097, 1, -51, -1050] using writeVarInt.</p></dd>
<b><code>encoding.IntDiffEncoder#s: number</code></b><br>
<dd><p>Current state</p></dd>
<b><code>encoding.IntDiffEncoder#write(v: number)</code></b><br>
<b><code>new encoding.RleIntDiffEncoder(start: number)</code></b><br>
<dd><p>A combination of IntDiffEncoder and RleEncoder.</p>
<p>Basically first writes the IntDiffEncoder and then counts duplicate diffs using RleEncoding.</p>
<p>Encodes the values [1,1,1,2,3,4,5,6] as [1,1,0,2,1,5] (RLE([1,0,0,1,1,1,1,1]) ⇒ RleIntDiff[1,1,0,2,1,5])</p></dd>
<b><code>encoding.RleIntDiffEncoder#s: number</code></b><br>
<dd><p>Current state</p></dd>
<b><code>encoding.RleIntDiffEncoder#write(v: number)</code></b><br>
<b><code>new encoding.UintOptRleEncoder()</code></b><br>
<dd><p>Optimized Rle encoder that does not suffer from the mentioned problem of the basic Rle encoder.</p>
<p>Internally uses VarInt encoder to write unsigned integers. If the input occurs multiple times, we write
write it as a negative number. The UintOptRleDecoder then understands that it needs to read a count.</p>
<p>Encodes [1,2,3,3,3] as [1,2,-3,3] (once 1, once 2, three times 3)</p></dd>
<b><code>encoding.UintOptRleEncoder#s: number</code></b><br>
<b><code>encoding.UintOptRleEncoder#write(v: number)</code></b><br>
<b><code>encoding.UintOptRleEncoder#toUint8Array()</code></b><br>
<b><code>new encoding.IncUintOptRleEncoder()</code></b><br>
<dd><p>Increasing Uint Optimized RLE Encoder</p>
<p>The RLE encoder counts the number of same occurences of the same value.
The IncUintOptRle encoder counts if the value increases.
I.e. 7, 8, 9, 10 will be encoded as [-7, 4]. 1, 3, 5 will be encoded
as [1, 3, 5].</p></dd>
<b><code>encoding.IncUintOptRleEncoder#s: number</code></b><br>
<b><code>encoding.IncUintOptRleEncoder#write(v: number)</code></b><br>
<b><code>encoding.IncUintOptRleEncoder#toUint8Array()</code></b><br>
<b><code>new encoding.IntDiffOptRleEncoder()</code></b><br>
<dd><p>A combination of the IntDiffEncoder and the UintOptRleEncoder.</p>
<p>The count approach is similar to the UintDiffOptRleEncoder, but instead of using the negative bitflag, it encodes
in the LSB whether a count is to be read. Therefore this Encoder only supports 31 bit integers!</p>
<p>Encodes [1, 2, 3, 2] as [3, 1, 6, -1] (more specifically [(1 &lt;&lt; 1) | 1, (3 &lt;&lt; 0) | 0, -1])</p>
<p>Internally uses variable length encoding. Contrary to normal UintVar encoding, the first byte contains:</p>
<ul>
<li>1 bit that denotes whether the next value is a count (LSB)</li>
<li>1 bit that denotes whether this value is negative (MSB - 1)</li>
<li>1 bit that denotes whether to continue reading the variable length integer (MSB)</li>
</ul>
<p>Therefore, only five bits remain to encode diff ranges.</p>
<p>Use this Encoder only when appropriate. In most cases, this is probably a bad idea.</p></dd>
<b><code>encoding.IntDiffOptRleEncoder#s: number</code></b><br>
<b><code>encoding.IntDiffOptRleEncoder#write(v: number)</code></b><br>
<b><code>encoding.IntDiffOptRleEncoder#toUint8Array()</code></b><br>
<b><code>new encoding.StringEncoder()</code></b><br>
<dd><p>Optimized String Encoder.</p>
<p>Encoding many small strings in a simple Encoder is not very efficient. The function call to decode a string takes some time and creates references that must be eventually deleted.
In practice, when decoding several million small strings, the GC will kick in more and more often to collect orphaned string objects (or maybe there is another reason?).</p>
<p>This string encoder solves the above problem. All strings are concatenated and written as a single string using a single encoding call.</p>
<p>The lengths are encoded using a UintOptRleEncoder.</p></dd>
<b><code>encoding.StringEncoder#sarr: Array&lt;string&gt;</code></b><br>
<b><code>encoding.StringEncoder#write(string: string)</code></b><br>
<b><code>encoding.StringEncoder#toUint8Array()</code></b><br>
<b><code>encoding.RleEncoder#bufs: Array&lt;Uint8Array&gt;</code></b><br>
<b><code>encoding.IntDiffEncoder#bufs: Array&lt;Uint8Array&gt;</code></b><br>
<b><code>encoding.RleIntDiffEncoder#bufs: Array&lt;Uint8Array&gt;</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/map]</b> Isomorphic module to work access the environment (query params, env variables).</summary>
<pre>import * as map from 'lib0/environment.js'</pre>
<dl>
<b><code>map.isNode</code></b><br>
<b><code>map.isBrowser</code></b><br>
<b><code>map.isMac</code></b><br>
<b><code>map.hasParam</code></b><br>
<b><code>map.getParam</code></b><br>
<b><code>map.getVariable</code></b><br>
<b><code>map.getConf(name: string): string|null</code></b><br>
<b><code>map.hasConf</code></b><br>
<b><code>map.production</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/error]</b> Error helpers.</summary>
<pre>import * as error from 'lib0/error.js'</pre>
<dl>
<b><code>error.create</code></b><br>
<b><code>error.methodUnimplemented</code></b><br>
<b><code>error.unexpectedCase</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/eventloop]</b> Utility module to work with EcmaScript's event loop.</summary>
<pre>import * as eventloop from 'lib0/eventloop.js'</pre>
<dl>
<b><code>eventloop.enqueue(f: function():void)</code></b><br>
<b><code>eventloop#destroy()</code></b><br>
<b><code>eventloop.timeout(timeout: number, callback: function): module:eventloop~TimeoutObject</code></b><br>
<b><code>eventloop.interval(timeout: number, callback: function): module:eventloop~TimeoutObject</code></b><br>
<b><code>eventloop.Animation</code></b><br>
<b><code>eventloop.animationFrame(cb: function(number):void): module:eventloop~TimeoutObject</code></b><br>
<b><code>eventloop.idleCallback(cb: function): module:eventloop~TimeoutObject</code></b><br>
<dd><p>Note: this is experimental and is probably only useful in browsers.</p></dd>
<b><code>eventloop.createDebouncer(timeout: number): function(function():void):void</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/function]</b> Common functions and function call helpers.</summary>
<pre>import * as function from 'lib0/function.js'</pre>
<dl>
<b><code>function.callAll(fs: Array&lt;function&gt;, args: Array&lt;any&gt;)</code></b><br>
<dd><p>Calls all functions in <code>fs</code> with args. Only throws after all functions were called.</p></dd>
<b><code>function.nop</code></b><br>
<b><code>function.apply(f: function():T): T</code></b><br>
<b><code>function.id(a: A): A</code></b><br>
<b><code>function.equalityStrict(a: T, b: T): boolean</code></b><br>
<b><code>function.equalityFlat(a: Array&lt;T&gt;|object, b: Array&lt;T&gt;|object): boolean</code></b><br>
<b><code>function.equalityDeep(a: any, b: any): boolean</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/lib0]</b> Experimental method to import lib0.</summary>
<pre>import * as lib0 from 'lib0/index.js'</pre>

<p>Not recommended if the module bundler doesn't support dead code elimination.</p>
<dl>
</dl>
</details>
<details><summary><b>[lib0/idb]</b> Helpers to work with IndexedDB.</summary>
<pre>import * as idb from 'lib0/indexeddb.js'</pre>
<dl>
<b><code>idb.rtop</code></b><br>
<b><code>idb.openDB</code></b><br>
<b><code>idb.deleteDB</code></b><br>
<b><code>idb.createStores</code></b><br>
<b><code>idb.transact(db: IDBDatabase, stores: Array&lt;string&gt;, access: "readwrite"|"readonly"): Array&lt;IDBObjectStore&gt;</code></b><br>
<b><code>idb.count</code></b><br>
<b><code>idb.get</code></b><br>
<b><code>idb.del</code></b><br>
<b><code>idb.put</code></b><br>
<b><code>idb.add</code></b><br>
<b><code>idb.addAutoKey</code></b><br>
<b><code>idb.getAll</code></b><br>
<b><code>idb.getAllKeys</code></b><br>
<b><code>idb.queryFirst(store: IDBObjectStore, query: IDBKeyRange|null, direction: 'next'|'prev'|'nextunique'|'prevunique'): Promise&lt;any&gt;</code></b><br>
<b><code>idb.getLastKey(store: IDBObjectStore): Promise&lt;any&gt;</code></b><br>
<b><code>idb.getFirstKey(store: IDBObjectStore): Promise&lt;any&gt;</code></b><br>
<b><code>idb.getAllKeysValues</code></b><br>
<b><code>idb.iterate</code></b><br>
<b><code>idb.iterateKeys</code></b><br>
<b><code>idb.getStore</code></b><br>
<b><code>idb.createIDBKeyRangeBound</code></b><br>
<b><code>idb.createIDBKeyRangeUpperBound</code></b><br>
<b><code>idb.createIDBKeyRangeLowerBound</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/isomorphic]</b> Isomorphic library exports from isomorphic.js.</summary>
<pre>import * as isomorphic from 'lib0/isomorphic.js'</pre>
<dl>
</dl>
</details>
<details><summary><b>[lib0/iterator]</b> Utility module to create and manipulate Iterators.</summary>
<pre>import * as iterator from 'lib0/iterator.js'</pre>
<dl>
<b><code>iterator.mapIterator(iterator: Iterator&lt;T&gt;, f: function(T):R): IterableIterator&lt;R&gt;</code></b><br>
<b><code>iterator.createIterator(next: function():IteratorResult&lt;T&gt;): IterableIterator&lt;T&gt;</code></b><br>
<b><code>iterator.iteratorFilter(iterator: Iterator&lt;T&gt;, filter: function(T):boolean)</code></b><br>
<b><code>iterator.iteratorMap(iterator: Iterator&lt;T&gt;, fmap: function(T):M)</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/json]</b> JSON utility functions.</summary>
<pre>import * as json from 'lib0/json.js'</pre>
<dl>
<b><code>json.stringify(object: any): string</code></b><br>
<dd><p>Transform JavaScript object to JSON.</p></dd>
<b><code>json.parse(json: string): any</code></b><br>
<dd><p>Parse JSON object.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/logging]</b> Isomorphic logging module with support for colors!</summary>
<pre>import * as logging from 'lib0/logging.js'</pre>
<dl>
<b><code>logging.BOLD</code></b><br>
<b><code>logging.UNBOLD</code></b><br>
<b><code>logging.BLUE</code></b><br>
<b><code>logging.GREY</code></b><br>
<b><code>logging.GREEN</code></b><br>
<b><code>logging.RED</code></b><br>
<b><code>logging.PURPLE</code></b><br>
<b><code>logging.ORANGE</code></b><br>
<b><code>logging.UNCOLOR</code></b><br>
<b><code>logging.print(args: Array&lt;string|Symbol|Object|number&gt;)</code></b><br>
<b><code>logging.warn(args: Array&lt;string|Symbol|Object|number&gt;)</code></b><br>
<b><code>logging.printError(err: Error)</code></b><br>
<b><code>logging.printImg(url: string, height: number)</code></b><br>
<b><code>logging.printImgBase64(base64: string, height: number)</code></b><br>
<b><code>logging.group(args: Array&lt;string|Symbol|Object|number&gt;)</code></b><br>
<b><code>logging.groupCollapsed(args: Array&lt;string|Symbol|Object|number&gt;)</code></b><br>
<b><code>logging.groupEnd</code></b><br>
<b><code>logging.printDom(createNode: function():Node)</code></b><br>
<b><code>logging.printCanvas(canvas: HTMLCanvasElement, height: number)</code></b><br>
<b><code>logging.vconsoles</code></b><br>
<b><code>new logging.VConsole(dom: Element)</code></b><br>
<b><code>logging.VConsole#ccontainer: Element</code></b><br>
<b><code>logging.VConsole#group(args: Array&lt;string|Symbol|Object|number&gt;, collapsed: boolean)</code></b><br>
<b><code>logging.VConsole#groupCollapsed(args: Array&lt;string|Symbol|Object|number&gt;)</code></b><br>
<b><code>logging.VConsole#groupEnd()</code></b><br>
<b><code>logging.VConsole#print(args: Array&lt;string|Symbol|Object|number&gt;)</code></b><br>
<b><code>logging.VConsole#printError(err: Error)</code></b><br>
<b><code>logging.VConsole#printImg(url: string, height: number)</code></b><br>
<b><code>logging.VConsole#printDom(node: Node)</code></b><br>
<b><code>logging.VConsole#destroy()</code></b><br>
<b><code>logging.createVConsole(dom: Element)</code></b><br>
<b><code>logging.createModuleLogger(moduleName: string): function(...any):void</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/map]</b> Utility module to work with key-value stores.</summary>
<pre>import * as map from 'lib0/map.js'</pre>
<dl>
<b><code>map.create(): Map&lt;any, any&gt;</code></b><br>
<dd><p>Creates a new Map instance.</p></dd>
<b><code>map.copy(m: Map&lt;X,Y&gt;): Map&lt;X,Y&gt;</code></b><br>
<dd><p>Copy a Map object into a fresh Map object.</p></dd>
<b><code>map.setIfUndefined(map: Map&lt;K, T&gt;, key: K, createT: function():T): T</code></b><br>
<dd><p>Get map property. Create T if property is undefined and set T on map.</p>
<pre class="prettyprint source lang-js"><code>const listeners = map.setIfUndefined(events, 'eventName', set.create)
listeners.add(listener)
</code></pre></dd>
<b><code>map.map(m: Map&lt;K,V&gt;, f: function(V,K):R): Array&lt;R&gt;</code></b><br>
<dd><p>Creates an Array and populates it with the content of all key-value pairs using the <code>f(value, key)</code> function.</p></dd>
<b><code>map.any(m: Map&lt;K,V&gt;, f: function(V,K):boolean): boolean</code></b><br>
<dd><p>Tests whether any key-value pairs pass the test implemented by <code>f(value, key)</code>.</p></dd>
<b><code>map.all(m: Map&lt;K,V&gt;, f: function(V,K):boolean): boolean</code></b><br>
<dd><p>Tests whether all key-value pairs pass the test implemented by <code>f(value, key)</code>.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/math]</b> Common Math expressions.</summary>
<pre>import * as math from 'lib0/math.js'</pre>
<dl>
<b><code>math.floor</code></b><br>
<b><code>math.ceil</code></b><br>
<b><code>math.abs</code></b><br>
<b><code>math.imul</code></b><br>
<b><code>math.round</code></b><br>
<b><code>math.log10</code></b><br>
<b><code>math.log2</code></b><br>
<b><code>math.log</code></b><br>
<b><code>math.sqrt</code></b><br>
<b><code>math.add(a: number, b: number): number</code></b><br>
<b><code>math.min(a: number, b: number): number</code></b><br>
<b><code>math.max(a: number, b: number): number</code></b><br>
<b><code>math.isNaN</code></b><br>
<b><code>math.pow</code></b><br>
<b><code>math.exp10(exp: number): number</code></b><br>
<dd><p>Base 10 exponential function. Returns the value of 10 raised to the power of pow.</p></dd>
<b><code>math.sign</code></b><br>
<b><code>math.isNegativeZero(n: number): boolean</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/metric]</b> Utility module to convert metric values.</summary>
<pre>import * as metric from 'lib0/metric.js'</pre>
<dl>
<b><code>metric.yotta</code></b><br>
<b><code>metric.zetta</code></b><br>
<b><code>metric.exa</code></b><br>
<b><code>metric.peta</code></b><br>
<b><code>metric.tera</code></b><br>
<b><code>metric.giga</code></b><br>
<b><code>metric.mega</code></b><br>
<b><code>metric.kilo</code></b><br>
<b><code>metric.hecto</code></b><br>
<b><code>metric.deca</code></b><br>
<b><code>metric.deci</code></b><br>
<b><code>metric.centi</code></b><br>
<b><code>metric.milli</code></b><br>
<b><code>metric.micro</code></b><br>
<b><code>metric.nano</code></b><br>
<b><code>metric.pico</code></b><br>
<b><code>metric.femto</code></b><br>
<b><code>metric.atto</code></b><br>
<b><code>metric.zepto</code></b><br>
<b><code>metric.yocto</code></b><br>
<b><code>metric.prefix(n: number, baseMultiplier: number): {n:number,prefix:string}</code></b><br>
<dd><p>Calculate the metric prefix for a number. Assumes E.g. <code>prefix(1000) = { n: 1, prefix: 'k' }</code></p></dd>
</dl>
</details>
<details><summary><b>[lib0/mutex]</b> Mutual exclude for JavaScript.</summary>
<pre>import * as mutex from 'lib0/mutex.js'</pre>
<dl>
<b><code>mutex.createMutex(): mutex</code></b><br>
<dd><p>Creates a mutual exclude function with the following property:</p>
<pre class="prettyprint source lang-js"><code>const mutex = createMutex()
mutex(() => {
  // This function is immediately executed
  mutex(() => {
    // This function is not executed, as the mutex is already active.
  })
})
</code></pre></dd>
</dl>
</details>
<details><summary><b>[lib0/number]</b> </summary>
<pre>import * as number from 'lib0/number.js'</pre>
<dl>
<b><code>number.MAX_SAFE_INTEGER</code></b><br>
<b><code>number.MIN_SAFE_INTEGER</code></b><br>
<b><code>number.LOWEST_INT32</code></b><br>
<b><code>number.HIGHEST_INT32: number</code></b><br>
<b><code>number.isInteger</code></b><br>
<b><code>number.isNaN</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/object]</b> Utility functions for working with EcmaScript objects.</summary>
<pre>import * as object from 'lib0/object.js'</pre>
<dl>
<b><code>object.create(): Object&lt;string,any&gt;</code></b><br>
<b><code>object.assign</code></b><br>
<dd><p>Object.assign</p></dd>
<b><code>object.keys(obj: Object&lt;string,any&gt;)</code></b><br>
<b><code>object.forEach(obj: Object&lt;string,any&gt;, f: function(any,string):any)</code></b><br>
<b><code>object.map(obj: Object&lt;string,any&gt;, f: function(any,string):R): Array&lt;R&gt;</code></b><br>
<b><code>object.length(obj: Object&lt;string,any&gt;): number</code></b><br>
<b><code>object.some(obj: Object&lt;string,any&gt;, f: function(any,string):boolean): boolean</code></b><br>
<b><code>object.every(obj: Object&lt;string,any&gt;, f: function(any,string):boolean): boolean</code></b><br>
<b><code>object.hasProperty(obj: any, key: string|symbol): boolean</code></b><br>
<dd><p>Calls <code>Object.prototype.hasOwnProperty</code>.</p></dd>
<b><code>object.equalFlat(a: Object&lt;string,any&gt;, b: Object&lt;string,any&gt;): boolean</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/observable]</b> Observable class prototype.</summary>
<pre>import * as observable from 'lib0/observable.js'</pre>
<dl>
<b><code>new observable.Observable()</code></b><br>
<dd><p>Handles named events.</p></dd>
<b><code>observable.Observable#on(name: N, f: function)</code></b><br>
<b><code>observable.Observable#once(name: N, f: function)</code></b><br>
<b><code>observable.Observable#off(name: N, f: function)</code></b><br>
<b><code>observable.Observable#emit(name: N, args: Array&lt;any&gt;)</code></b><br>
<dd><p>Emit a named event. All registered event listeners that listen to the
specified name will receive the event.</p></dd>
<b><code>observable.Observable#destroy()</code></b><br>
<b><code>websocket.WebsocketClient#on(name: N, f: function)</code></b><br>
<b><code>websocket.WebsocketClient#once(name: N, f: function)</code></b><br>
<b><code>websocket.WebsocketClient#off(name: N, f: function)</code></b><br>
<b><code>websocket.WebsocketClient#emit(name: N, args: Array&lt;any&gt;)</code></b><br>
<dd><p>Emit a named event. All registered event listeners that listen to the
specified name will receive the event.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/pair]</b> Working with value pairs.</summary>
<pre>import * as pair from 'lib0/pair.js'</pre>
<dl>
<b><code>new pair.Pair(left: L, right: R)</code></b><br>
<b><code>pair.create(left: L, right: R): module:pair.Pair&lt;L,R&gt;</code></b><br>
<b><code>pair.createReversed(right: R, left: L): module:pair.Pair&lt;L,R&gt;</code></b><br>
<b><code>pair.forEach(arr: Array&lt;module:pair.Pair&lt;L,R&gt;&gt;, f: function(L, R):any)</code></b><br>
<b><code>pair.map(arr: Array&lt;module:pair.Pair&lt;L,R&gt;&gt;, f: function(L, R):X): Array&lt;X&gt;</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/prng]</b> Fast Pseudo Random Number Generators.</summary>
<pre>import * as prng from 'lib0/prng.js'</pre>

<p>Given a seed a PRNG generates a sequence of numbers that cannot be reasonably predicted.
Two PRNGs must generate the same random sequence of numbers if  given the same seed.</p>
<dl>
<b><code>prng.DefaultPRNG</code></b><br>
<b><code>prng.create(seed: number): module:prng~PRNG</code></b><br>
<dd><p>Create a Xoroshiro128plus Pseudo-Random-Number-Generator.
This is the fastest full-period generator passing BigCrush without systematic failures.
But there are more PRNGs available in ./PRNG/.</p></dd>
<b><code>prng.bool(gen: module:prng~PRNG): Boolean</code></b><br>
<dd><p>Generates a single random bool.</p></dd>
<b><code>prng.int53(gen: module:prng~PRNG, min: Number, max: Number): Number</code></b><br>
<dd><p>Generates a random integer with 53 bit resolution.</p></dd>
<b><code>prng.uint53(gen: module:prng~PRNG, min: Number, max: Number): Number</code></b><br>
<dd><p>Generates a random integer with 53 bit resolution.</p></dd>
<b><code>prng.int32(gen: module:prng~PRNG, min: Number, max: Number): Number</code></b><br>
<dd><p>Generates a random integer with 32 bit resolution.</p></dd>
<b><code>prng.uint32(gen: module:prng~PRNG, min: Number, max: Number): Number</code></b><br>
<dd><p>Generates a random integer with 53 bit resolution.</p></dd>
<b><code>prng.int31(gen: module:prng~PRNG, min: Number, max: Number): Number</code></b><br>
<b><code>prng.real53(gen: module:prng~PRNG): Number</code></b><br>
<dd><p>Generates a random real on [0, 1) with 53 bit resolution.</p></dd>
<b><code>prng.char(gen: module:prng~PRNG): string</code></b><br>
<dd><p>Generates a random character from char code 32 - 126. I.e. Characters, Numbers, special characters, and Space:</p></dd>
<b><code>prng.letter(gen: module:prng~PRNG): string</code></b><br>
<b><code>prng.word(gen: module:prng~PRNG, minLen: number, maxLen: number): string</code></b><br>
<b><code>prng.utf16Rune(gen: module:prng~PRNG): string</code></b><br>
<dd><p>TODO: this function produces invalid runes. Does not cover all of utf16!!</p></dd>
<b><code>prng.utf16String(gen: module:prng~PRNG, maxlen: number)</code></b><br>
<b><code>prng.oneOf(gen: module:prng~PRNG, array: Array&lt;T&gt;): T</code></b><br>
<dd><p>Returns one element of a given array.</p></dd>
<b><code>prng.uint8Array(gen: module:prng~PRNG, len: number): Uint8Array</code></b><br>
<b><code>prng.uint16Array(gen: module:prng~PRNG, len: number): Uint16Array</code></b><br>
<b><code>prng.uint32Array(gen: module:prng~PRNG, len: number): Uint32Array</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/promise]</b> Utility helpers to work with promises.</summary>
<pre>import * as promise from 'lib0/promise.js'</pre>
<dl>
<b><code>promise.create(f: function(PromiseResolve&lt;T&gt;,function(Error):void):any): Promise&lt;T&gt;</code></b><br>
<b><code>promise.createEmpty(f: function(function():void,function(Error):void):void): Promise&lt;void&gt;</code></b><br>
<b><code>promise.all(arrp: Array&lt;Promise&lt;T&gt;&gt;): Promise&lt;Array&lt;T&gt;&gt;</code></b><br>
<dd><p><code>Promise.all</code> wait for all promises in the array to resolve and return the result</p></dd>
<b><code>promise.reject(reason: Error): Promise&lt;never&gt;</code></b><br>
<b><code>promise.resolve(res: T|void): Promise&lt;T|void&gt;</code></b><br>
<b><code>promise.until(timeout: number, check: function():boolean, intervalResolution: number): Promise&lt;void&gt;</code></b><br>
<b><code>promise.wait(timeout: number): Promise&lt;undefined&gt;</code></b><br>
<b><code>promise.isPromise(p: any): boolean</code></b><br>
<dd><p>Checks if an object is a promise using ducktyping.</p>
<p>Promises are often polyfilled, so it makes sense to add some additional guarantees if the user of this
library has some insane environment where global Promise objects are overwritten.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/queue]</b> </summary>
<pre>import * as queue from 'lib0/queue.js'</pre>
<dl>
<b><code>new de#QueueNode()</code></b><br>
<b><code>de#next: module:queue.QueueNode|null</code></b><br>
<b><code>new ueue()</code></b><br>
<b><code>tart: module:queue.QueueNode | null</code></b><br>
<b><code>nd: module:queue.QueueNode | null</code></b><br>
<b><code>(): module:queue.Queue</code></b><br>
<b><code>()</code></b><br>
<b><code>(queue: module:queue.Queue)</code></b><br>
<b><code>()</code></b><br>
<b><code>(queue: module:queue.Queue, n: module:queue.QueueNode)</code></b><br>
<b><code>()</code></b><br>
<b><code>(queue: module:queue.Queue): module:queue.QueueNode | null</code></b><br>
<b><code>()</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/random]</b> Isomorphic module for true random numbers / buffers / uuids.</summary>
<pre>import * as random from 'lib0/random.js'</pre>

<p>Attention: falls back to Math.random if the browser does not support crypto.</p>
<dl>
<b><code>random.rand</code></b><br>
<b><code>random.uint32</code></b><br>
<b><code>random.oneOf(arr: Array&lt;T&gt;): T</code></b><br>
<b><code>random.uuidv4</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/set]</b> Utility module to work with sets.</summary>
<pre>import * as set from 'lib0/set.js'</pre>
<dl>
<b><code>set.create</code></b><br>
<b><code>set.toArray(set: Set&lt;T&gt;): Array&lt;T&gt;</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/sort]</b> Efficient sort implementations.</summary>
<pre>import * as sort from 'lib0/sort.js'</pre>

<p>Note: These sort implementations were created to compare different sorting algorithms in JavaScript.
Don't use them if you don't know what you are doing. Native Array.sort is almost always a better choice.</p>
<dl>
<b><code>sort.insertionSort(arr: Array&lt;T&gt;, compare: function(T,T):number): void</code></b><br>
<b><code>sort.quicksort(arr: Array&lt;T&gt;, compare: function(T,T):number): void</code></b><br>
<dd><p>This algorithm beats Array.prototype.sort in Chrome only with arrays with 10 million entries.
In most cases [].sort will do just fine. Make sure to performance test your use-case before you
integrate this algorithm.</p>
<p>Note that Chrome's sort is now a stable algorithm (Timsort). Quicksort is not stable.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/statistics]</b> Utility helpers for generating statistics.</summary>
<pre>import * as statistics from 'lib0/statistics.js'</pre>
<dl>
<b><code>statistics.median(arr: Array&lt;number&gt;): number</code></b><br>
<b><code>statistics.average(arr: Array&lt;number&gt;): number</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/storage]</b> Isomorphic variable storage.</summary>
<pre>import * as storage from 'lib0/storage.js'</pre>

<p>Uses LocalStorage in the browser and falls back to in-memory storage.</p>
<dl>
<b><code>storage.varStorage</code></b><br>
<dd><p>This is basically localStorage in browser, or a polyfill in nodejs</p></dd>
<b><code>storage.onChange(eventHandler: function({ key: string, newValue: string, oldValue: string }): void)</code></b><br>
<dd><p>A polyfill for <code>addEventListener('storage', event =&gt; {..})</code> that does nothing if the polyfill is being used.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/string]</b> Utility module to work with strings.</summary>
<pre>import * as string from 'lib0/string.js'</pre>
<dl>
<b><code>string.fromCharCode</code></b><br>
<b><code>string.fromCodePoint</code></b><br>
<b><code>string.trimLeft(s: string): string</code></b><br>
<b><code>string.fromCamelCase(s: string, separator: string): string</code></b><br>
<b><code>string.utf8ByteLength(str: string): number</code></b><br>
<dd><p>Compute the utf8ByteLength</p></dd>
<b><code>string.utf8TextEncoder</code></b><br>
<b><code>string.encodeUtf8</code></b><br>
<b><code>string.decodeUtf8</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/symbol]</b> Utility module to work with EcmaScript Symbols.</summary>
<pre>import * as symbol from 'lib0/symbol.js'</pre>
<dl>
<b><code>symbol.create(): Symbol</code></b><br>
<dd><p>Return fresh symbol.</p></dd>
<b><code>symbol.isSymbol(s: any): boolean</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/testing]</b> Testing framework with support for generating tests.</summary>
<pre>import * as testing from 'lib0/testing.js'</pre>

<pre class="prettyprint source lang-js"><code>// test.js template for creating a test executable
import { runTests } from 'lib0/testing.js'
import * as log from 'lib0/logging.js'
import * as mod1 from './mod1.test.js'
import * as mod2 from './mod2.test.js'
import { isBrowser, isNode } from 'lib0/environment.js'

if (isBrowser) {
  // optional: if this is ran in the browser, attach a virtual console to the dom
  log.createVConsole(document.body)
}

runTests({
 mod1,
 mod2,
}).then(success => {
  if (isNode) {
    process.exit(success ? 0 : 1)
  }
})
</code></pre>
<pre class="prettyprint source lang-js"><code>// mod1.test.js
/**
 * runTests automatically tests all exported functions that start with &quot;test&quot;.
 * The name of the function should be in camelCase and is used for the logging output.
 *
 * @param {t.TestCase} tc
 *\/
export const testMyFirstTest = tc => {
  t.compare({ a: 4 }, { a: 4 }, 'objects are equal')
}
</code></pre>
<p>Now you can simply run <code>node test.js</code> to run your test or run test.js in the browser.</p>
<dl>
<b><code>testing.extensive</code></b><br>
<b><code>testing.envSeed</code></b><br>
<b><code>new testing.TestCase(moduleName: string, testName: string)</code></b><br>
<b><code>testing.TestCase#moduleName: string</code></b><br>
<b><code>testing.TestCase#testName: string</code></b><br>
<b><code>testing.TestCase#resetSeed()</code></b><br>
<b><code>testing.TestCase#prng: prng.PRNG</code></b><br>
<dd><p>A PRNG for this test case. Use only this PRNG for randomness to make the test case reproducible.</p></dd>
<b><code>testing.repetitionTime</code></b><br>
<b><code>testing.run(moduleName: string, name: string, f: function(module:testing.TestCase):void|Promise&lt;any&gt;, i: number, numberOfTests: number)</code></b><br>
<b><code>testing.describe(description: string, info: string)</code></b><br>
<dd><p>Describe what you are currently testing. The message will be logged.</p>
<pre class="prettyprint source lang-js"><code>export const testMyFirstTest = tc => {
  t.describe('crunching numbers', 'already crunched 4 numbers!') // the optional second argument can describe the state.
}
</code></pre></dd>
<b><code>testing.info(info: string)</code></b><br>
<dd><p>Describe the state of the current computation.</p>
<pre class="prettyprint source lang-js"><code>export const testMyFirstTest = tc => {
  t.info(already crunched 4 numbers!') // the optional second argument can describe the state.
}
</code></pre></dd>
<b><code>testing.printDom</code></b><br>
<b><code>testing.printCanvas</code></b><br>
<b><code>testing.group(description: string, f: function(void):void)</code></b><br>
<dd><p>Group outputs in a collapsible category.</p>
<pre class="prettyprint source lang-js"><code>export const testMyFirstTest = tc => {
  t.group('subtest 1', () => {
    t.describe('this message is part of a collapsible section')
  })
  await t.groupAsync('subtest async 2', async () => {
    await someaction()
    t.describe('this message is part of a collapsible section')
  })
}
</code></pre></dd>
<b><code>testing.groupAsync(description: string, f: function(void):Promise&lt;any&gt;)</code></b><br>
<dd><p>Group outputs in a collapsible category.</p>
<pre class="prettyprint source lang-js"><code>export const testMyFirstTest = async tc => {
  t.group('subtest 1', () => {
    t.describe('this message is part of a collapsible section')
  })
  await t.groupAsync('subtest async 2', async () => {
    await someaction()
    t.describe('this message is part of a collapsible section')
  })
}
</code></pre></dd>
<b><code>testing.measureTime(message: string, f: function():void): number</code></b><br>
<dd><p>Measure the time that it takes to calculate something.</p>
<pre class="prettyprint source lang-js"><code>export const testMyFirstTest = async tc => {
  t.measureTime('measurement', () => {
    heavyCalculation()
  })
  await t.groupAsync('async measurement', async () => {
    await heavyAsyncCalculation()
  })
}
</code></pre></dd>
<b><code>testing.measureTimeAsync(message: string, f: function():Promise&lt;any&gt;): Promise&lt;number&gt;</code></b><br>
<dd><p>Measure the time that it takes to calculate something.</p>
<pre class="prettyprint source lang-js"><code>export const testMyFirstTest = async tc => {
  t.measureTimeAsync('measurement', async () => {
    await heavyCalculation()
  })
  await t.groupAsync('async measurement', async () => {
    await heavyAsyncCalculation()
  })
}
</code></pre></dd>
<b><code>testing.compareArrays(as: Array&lt;T&gt;, bs: Array&lt;T&gt;, m: string): boolean</code></b><br>
<b><code>testing.compareStrings(a: string, b: string, m: string)</code></b><br>
<b><code>testing.compareObjects(a: Object&lt;K,V&gt;, b: Object&lt;K,V&gt;, m: string)</code></b><br>
<b><code>testing.compare(a: T, b: T, message: string?, customCompare: function(any,T,T,string,any):boolean)</code></b><br>
<b><code>testing.assert(condition: boolean, message: string?)</code></b><br>
<b><code>testing.fails(f: function():void)</code></b><br>
<b><code>testing.runTests(tests: Object&lt;string, Object&lt;string, function(module:testing.TestCase):void|Promise&lt;any&gt;&gt;&gt;)</code></b><br>
<b><code>testing.fail(reason: string)</code></b><br>
<b><code>testing.skip(cond: boolean)</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/time]</b> Utility module to work with time.</summary>
<pre>import * as time from 'lib0/time.js'</pre>
<dl>
<b><code>time.getDate(): Date</code></b><br>
<dd><p>Return current time.</p></dd>
<b><code>time.getUnixTime(): number</code></b><br>
<dd><p>Return current unix time.</p></dd>
<b><code>time.humanizeDuration(d: number): string</code></b><br>
<dd><p>Transform time (in ms) to a human readable format. E.g. 1100 =&gt; 1.1s. 60s =&gt; 1min. .001 =&gt; 10μs.</p></dd>
</dl>
</details>
<details><summary><b>[lib0/tree]</b> Red-black-tree implementation.</summary>
<pre>import * as tree from 'lib0/tree.js'</pre>
<dl>
<b><code>new tree.Tree()</code></b><br>
<dd><p>This is a Red Black Tree implementation</p></dd>
<b><code>tree.Tree#findNext(id: K)</code></b><br>
<b><code>tree.Tree#findPrev(id: K)</code></b><br>
<b><code>tree.Tree#findNodeWithLowerBound(from: K)</code></b><br>
<b><code>tree.Tree#findNodeWithUpperBound(to: K)</code></b><br>
<b><code>tree.Tree#findSmallestNode(): V</code></b><br>
<b><code>tree.Tree#findWithLowerBound(from: K): V</code></b><br>
<b><code>tree.Tree#findWithUpperBound(to: K): V</code></b><br>
<b><code>tree.Tree#iterate(from: K, from: K, f: K)</code></b><br>
<b><code>tree.Tree#find(id: K): V|null</code></b><br>
<b><code>tree.Tree#findNode(id: K): module:tree~N&lt;V&gt;|null</code></b><br>
<b><code>tree.Tree#delete(id: K)</code></b><br>
<b><code>tree.Tree#put()</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/url]</b> Utility module to work with urls.</summary>
<pre>import * as url from 'lib0/url.js'</pre>
<dl>
<b><code>url.decodeQueryParams(url: string): Object&lt;string,string&gt;</code></b><br>
<dd><p>Parse query parameters from an url.</p></dd>
<b><code>url.encodeQueryParams(params: Object&lt;string,string&gt;): string</code></b><br>
</dl>
</details>
<details><summary><b>[lib0/websocket]</b> Tiny websocket connection handler.</summary>
<pre>import * as websocket from 'lib0/websocket.js'</pre>

<p>Implements exponential backoff reconnects, ping/pong, and a nice event system using [lib0/observable].</p>
<dl>
<b><code>new websocket.WebsocketClient(url: string, opts: object, opts.binaryType: 'arraybuffer' | 'blob' | null)</code></b><br>
<b><code>websocket.WebsocketClient#ws: WebSocket?</code></b><br>
<b><code>websocket.WebsocketClient#shouldConnect: boolean</code></b><br>
<dd><p>Whether to connect to other peers or not</p></dd>
<b><code>websocket.WebsocketClient#send(message: any)</code></b><br>
<b><code>websocket.WebsocketClient#destroy()</code></b><br>
<b><code>websocket.WebsocketClient#disconnect()</code></b><br>
<b><code>websocket.WebsocketClient#connect()</code></b><br>
</dl>
</details>

### License

[The MIT License](./LICENSE) © Kevin Jahns
