# AGENTS.md

Guidance for AI coding agents working in **lib0-like projects** — small, isomorphic JavaScript utility packages that follow the conventions pioneered by [lib0](https://github.com/dmonad/lib0). Read this before editing. If a project-specific `CLAUDE.md` (or equivalent) exists, it overrides anything here.

## Project shape

- **ESM only.** No CommonJS build. `"type": "module"` in `package.json`.
- **Isomorphic.** Code should run in Node, browsers, Deno, Bun, and React Native unless a module is explicitly environment-specific.
- **Environment-specific variants** use conditional exports. A module with per-runtime implementations ships as `foo.js` (default/browser), `foo.node.js`, `foo.deno.js`, `foo.react-native.js`, wired up in `exports`.

## Types: JSDoc, not TypeScript

The entire codebase is `.js` with JSDoc annotations. TypeScript is used only as a checker.

- `tsconfig.json` sets `allowJs: true`, `checkJs: true`, `strict: true`.
- Annotate with `@type`, `@param`, `@returns`, `@template`, `@typedef`.
- `npm run lint` runs `tsc --noEmit` — type errors fail CI.
- **Do not add `.ts` files.** If you're tempted to, the fix is better JSDoc.

## Code style

- **`sideEffects: false` in `package.json`** is the primary mechanism. Modules must be side-effect-free at import time.
- **Test runner is homegrown (`src/testing.js`), not a third-party framework.** Every `*.test.js` file exports functions named `test<CamelCase>` which take a `TestCase` argument. `src/test.js` imports every test module and calls `runTests({...})`. Fuzz/property tests use `src/prng.js` seeded from `--seed` so failures are reproducible. When adding a new module with tests, add its import to `src/test.js` — missing it there means the CI suite won't run it. See the `lib0-testing` skill for details on the testing/PRNG APIs.
- **Code style is performance-first and bundler-first** (detailed in `README.md` "Code style"). The important rules that affect patches:
- Modules export only pure functions and constants. Top-level `export const x = cond ? A : B` defeats dead-code elimination — wrap the initializer in a `/*#__PURE__*/`-annotated IIFE: `export const x = /*#__PURE__*/ (() => cond ? A : B)()`. `/*#__PURE__*/` only binds to a `CallExpression` or `NewExpression`; placing it before a ternary, parenthesized expression, or bare identifier is silently a no-op.
- Annotate pure function *declarations* with `/*#__NO_SIDE_EFFECTS__*/` so every call site is drop-if-unused without per-call `/*#__PURE__*/`. `sideEffects: false` in `package.json` is the primary tree-shake mechanism for lib0; the annotations are belt-and-braces for consumer pipelines that don't honor the package flag (notably React Native / Metro).
- Avoid polymorphism. Use classes for data shape (stable hidden classes in V8), not for method dispatch; the only approved use of methods is when two classes implement the same signature differently (duck-typed dispatch).
- Consumers should never call `new ClassName()`. Export factory functions (`createFoo(...)`) instead — class names don't survive mangling, factory names do.
- Prefer `const`; `let` only in loops. No semicolons (`standard` lint enforces this).
- Avoid recursion (stack limits, not always optimized).
- No circular imports — `dpdm` enforces this in `npm run lint`.

**JSDoc is the type system.** Source is plain `.js` with `@type` / `@template` / `@param` annotations; `tsconfig.json` has `allowJs: true, checkJs: true, strict: true`. Generated `.d.ts` files live in `dist/` and are what npm consumers import for types. Don't add a `.ts` file.

## Things that look like cleanup but aren't

- **Don't convert JSDoc to TypeScript.** The `.js`+JSDoc choice is deliberate (zero-build consumer experience, smaller published package).
- **Don't introduce a bundler or build step for `src/`.** Published files are the source.
- **Don't add semicolons** to match "normal" JS — `standard` will fail the lint.
- **Don't replace factory functions with exported classes** for "ergonomics" — it breaks minified consumers.
- **Don't add polyfills or runtime feature-detection** unless the module is explicitly cross-environment; use conditional exports for that.
