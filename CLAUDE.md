# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`lib0` is a collection of small, isomorphic utility modules (Node, browser, Deno, Bun, React Native). Each module is exported separately via the `exports` map in `package.json` (e.g. `lib0/array`, `lib0/encoding`, `lib0/crypto/ecdsa`). The package ships as ESM only; `.d.ts` files in `dist/` are generated from JSDoc in `src/` by `tsc`.

Environment-specific implementations are resolved via conditional exports (see `package.json`): `logging`, `performance`, `webcrypto`, and `hash/sha256` each have separate `.node.js` / `.deno.js` / `.react-native.js` / default (browser) variants.

## Commands

- `npm test` — runs `src/test.js` under `c8` with strict coverage thresholds (lines 97 / branches 96 / functions 94 / statements 97). A change that drops coverage below these will fail CI.
- `npm run test:deno` — same suite under Deno.
- `npm run test-extensive` — longer fuzz run (`--repetition-time 1000 --extensive`); use when touching PRNG-backed or fuzz-tested modules.
- `npm run test-inspect` — run with `--inspect-brk` for the Chrome/Node debugger.
- `npm run debug` — generates `test.html` and serves it, so the same test suite runs in a browser.
- `npm run lint` — runs `tsc` (typecheck JSDoc), `standard` (style), and `dpdm` (fails on circular imports). All three must pass.
- `npm run types` / `npm run dist` — regenerate `dist/**/*.d.ts` via `tsconfig.build.json`. Run before publishing; do not hand-edit `dist/`.
- `npm run trace-deopt` / `trace-opt` — V8 deopt/opt tracing for performance work.

Run a single test file directly with `node ./src/<module>.test.js` only if it has its own entrypoint; the canonical way to run one test is to filter by name via the testing framework's `--filter` param, e.g. `node ./src/test.js --filter testMyThing`. To reproduce a fuzz failure use `--seed <n>` (see `envSeed` in `src/testing.js`).

## Architecture notes that aren't obvious from the file tree

- **`sideEffects: false` in `package.json`** is the primary mechanism. Modules must be side-effect-free at import time.
- **One module per concern, flat.** `src/*.js` is the public surface; each file is its own entry in `package.json` `exports`. Subdirectories (`crypto/`, `hash/`, `diff/`, `delta/`, `trait/`, `prng/`, `bin/`) group related entries but are still flat from the consumer's perspective — `src/prng/Xoroshiro128plus.js` is *not* exported; only `src/prng.js` is. When adding a new public module, add it to `exports` in `package.json` and to `src/test.js`.
- **Delta module (`src/delta/`)** is a substantial subsystem for representing changes to map/text/array-like data with schema validation and OT-style rebase. It has its own `readme.md` in that directory — read it before editing.
- **Binaries in `src/bin/`** are exposed via `package.json` `bin` as `0gentesthtml`, `0serve`, `0ecdsa-generate-keypair`. `gentesthtml` is what makes the test suite runnable in a browser.

## Things to watch for

- Changing `exports` in `package.json` is a public API change — every new module needs `types`, `default`, and any environment-specific variants wired up consistently.
- Node `>=22` is the declared floor; don't use newer-only APIs without a fallback.

@AGENTS.md
