# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`lib0` is a collection of small, isomorphic utility modules (Node, browser, Deno, Bun, React Native). Each module is exported separately via the `exports` map in `package.json` (e.g. `lib0/array`, `lib0/encoding`, `lib0/crypto/ecdsa`). The package ships as ESM only; `.d.ts` files in `types/` are generated from JSDoc in `src/` by `tsc`.

Environment-specific implementations are resolved via conditional exports (see `package.json`): `logging`, `performance`, `webcrypto`, and `hash/sha256` each have separate `.node.js` / `.deno.js` / `.react-native.js` / default (browser) variants.

## Commands

- `npm test` — runs `src/test.js` under `c8` with strict coverage thresholds (lines 97 / branches 96 / functions 94 / statements 97). A change that drops coverage below these will fail CI.
- `npm run test:deno` — same suite under Deno.
- `npm run test-extensive` — longer fuzz run (`--repetition-time 1000 --extensive`); use when touching PRNG-backed or fuzz-tested modules.
- `npm run test-inspect` — run with `--inspect-brk` for the Chrome/Node debugger.
- `npm run debug` — generates `test.html` and serves it, so the same test suite runs in a browser.
- `npm run lint` — runs `tsc` (typecheck JSDoc), `standard` (style), and `dpdm` (fails on circular imports). All three must pass.
- `npm run types` / `npm run dist` — regenerate `types/**/*.d.ts` via `tsconfig.build.json`. Run before publishing; do not hand-edit `types/`.
- `npm run trace-deopt` / `trace-opt` — V8 deopt/opt tracing for performance work.

Run a single test file directly with `node ./src/<module>.test.js` only if it has its own entrypoint; the canonical way to run one test is to filter by name via the testing framework's `--filter` param, e.g. `node ./src/test.js --filter testMyThing`. To reproduce a fuzz failure use `--seed <n>` (see `envSeed` in `src/testing.js`).

## Architecture notes that aren't obvious from the file tree

**One module per concern, flat.** `src/*.js` is the public surface; each file is its own entry in `package.json` `exports`. Subdirectories (`crypto/`, `hash/`, `diff/`, `delta/`, `trait/`, `prng/`, `bin/`) group related entries but are still flat from the consumer's perspective — `src/prng/Xoroshiro128plus.js` is *not* exported; only `src/prng.js` is. When adding a new public module, add it to `exports` in `package.json` and to `src/test.js`.

**Test runner is homegrown (`src/testing.js`), not a third-party framework.** Every `*.test.js` file exports functions named `test<CamelCase>` which take a `TestCase` argument. `src/test.js` imports every test module and calls `runTests({...})`. Fuzz/property tests use `src/prng.js` seeded from `--seed` so failures are reproducible. When adding a new module with tests, add its import to `src/test.js` — missing it there means the CI suite won't run it. See the `lib0-testing` skill for details on the testing/PRNG APIs.

**Code style is performance-first and bundler-first** (detailed in `README.md` "Code style"). The important rules that affect patches:
- Modules export only pure functions and constants. Top-level `export const x = cond ? A : B` defeats dead-code elimination — wrap the initializer in a `/*#__PURE__*/`-annotated IIFE: `export const x = /*#__PURE__*/ (() => cond ? A : B)()`. `/*#__PURE__*/` only binds to a `CallExpression` or `NewExpression`; placing it before a ternary, parenthesized expression, or bare identifier is silently a no-op.
- Annotate pure function *declarations* with `/*#__NO_SIDE_EFFECTS__*/` so every call site is drop-if-unused without per-call `/*#__PURE__*/`. `sideEffects: false` in `package.json` is the primary tree-shake mechanism for lib0; the annotations are belt-and-braces for consumer pipelines that don't honor the package flag (notably React Native / Metro).
- Avoid polymorphism. Use classes for data shape (stable hidden classes in V8), not for method dispatch; the only approved use of methods is when two classes implement the same signature differently (duck-typed dispatch).
- Consumers should never call `new ClassName()`. Export factory functions (`createFoo(...)`) instead — class names don't survive mangling, factory names do.
- Prefer `const`; `let` only in loops. No semicolons (`standard` lint enforces this).
- Avoid recursion (stack limits, not always optimized).
- No circular imports — `dpdm` enforces this in `npm run lint`.

**JSDoc is the type system.** Source is plain `.js` with `@type` / `@template` / `@param` annotations; `tsconfig.json` has `allowJs: true, checkJs: true, strict: true`. Generated `.d.ts` files live in `types/` and are what npm consumers import for types. Don't add a `.ts` file.

**Delta module (`src/delta/`)** is a substantial subsystem for representing changes to map/text/array-like data with schema validation and OT-style rebase. It has its own `readme.md` in that directory — read it before editing.

**Binaries in `src/bin/`** are exposed via `package.json` `bin` as `0gentesthtml`, `0serve`, `0ecdsa-generate-keypair`. `gentesthtml` is what makes the test suite runnable in a browser.

## Things to watch for

- Changing `exports` in `package.json` is a public API change — every new module needs `types`, `default`, and any environment-specific variants wired up consistently.
- Node `>=22` is the declared floor; don't use newer-only APIs without a fallback.
